import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createDatabase, migrate, TABLES, createDashboard, listDashboards, renameDashboard, readLayout, saveLayout, deleteDashboard, LayoutConflictError, readCache, writeCache, pruneCache, invalidateCache, startCollectorRun, completeCollectorRun, failCollectorRun, heartbeatCollectorRun, latestCollectorRun, insertTelemetry, readTelemetry, type Database } from "../../lib/db/index.js";

const connectionString = process.env.ATLAS_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Set ATLAS_TEST_DATABASE_URL to a disposable local PostgreSQL database before running storage tests.");
const url = new URL(connectionString);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/(test|roadmap)/.test(url.pathname)) throw new Error("Storage tests require a loopback database with test or roadmap in its name.");
const schemas: string[] = [];
const schema = () => { const name = "atlas_test_" + randomUUID().replaceAll("-", ""); schemas.push(name); return name; };
const db = createDatabase({ connectionString, schema: schema() });
const clients: Database[] = [db];
const fixtures: string[] = [];
before(async () => { await migrate(db); });
after(async () => {
  try { for (const name of schemas) await db.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`); }
  finally { await Promise.all(clients.map((client) => client.close())); await Promise.all(fixtures.map((directory) => rm(directory, { recursive: true, force: true }))); }
});

test("migration creates exactly 19 application tables plus ledger and remains idempotent", async () => {
  const result = await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'", [db.schema]);
  assert.deepEqual(result.rows.map(({ table_name }) => table_name).sort(), [...TABLES].sort());
  assert.equal(TABLES.length - 1, 19);
  assert.deepEqual(await migrate(db), []);
  const ledger = await db.query(`SELECT * FROM ${db.table("schema_migrations")}`);
  assert.equal(ledger.rowCount, 3);
  assert.match(ledger.rows[0].checksum, /^[a-f0-9]{64}$/);
});

test("simultaneous migrators serialize on the same advisory lock", async () => {
  const name = schema();
  const a = createDatabase({ connectionString: connectionString!, schema: name });
  const b = createDatabase({ connectionString: connectionString!, schema: name });
  clients.push(a, b);
  const outcomes = await Promise.all([migrate(a), migrate(b)]);
  assert.equal(outcomes.flat().length, 3);
  assert.equal((await a.query(`SELECT * FROM ${a.table("schema_migrations")}`)).rowCount, 3);
});

test("failed migration rolls back DDL and ledger; applied migrations cannot be changed", async () => {
  const folder = await mkdtemp(join(tmpdir(), "atlas-migrations-")); fixtures.push(folder);
  const client = createDatabase({ connectionString: connectionString!, schema: schema() }); clients.push(client);
  await writeFile(join(folder, "0001_probe.sql"), "CREATE TABLE probe (id integer PRIMARY KEY);\n");
  await writeFile(join(folder, "0002_broken.sql"), "CREATE TABLE should_rollback (id integer); SELECT nonexistent_function();\n");
  await assert.rejects(migrate(client, folder), /nonexistent_function/);
  assert.equal((await db.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1", [client.schema])).rowCount, 0);
  await rm(join(folder, "0002_broken.sql"));
  await migrate(client, folder);
  await writeFile(join(folder, "0001_probe.sql"), "CREATE TABLE probe (id text PRIMARY KEY);\n");
  await assert.rejects(migrate(client, folder), /append-only/);
  assert.equal((await client.query(`SELECT * FROM ${client.table("schema_migrations")}`)).rowCount, 1);
  await writeFile(join(folder, "0001_probe.sql"), "CREATE TABLE probe (id integer PRIMARY KEY);\n");
  await writeFile(join(folder, "0002_broken.sql"), "CREATE TABLE should_rollback (id integer); SELECT nonexistent_function();\n");
  await assert.rejects(migrate(client, folder));
  assert.equal((await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'should_rollback'", [client.schema])).rowCount, 0);
});

test("dashboard names/layouts are owner-scoped and revisions prevent lost writes", async () => {
  const owner = randomUUID(), other = randomUUID();
  const first = await createDashboard(db, owner, " Overview ", { cards: { latency: { x: 0, span: 6 } } });
  const second = await createDashboard(db, owner, "Performance", { cards: {} });
  const differentOwner = await createDashboard(db, other, "Overview");
  assert.equal((await listDashboards(db, owner)).length, 2);
  assert.equal((await listDashboards(db, other))[0].id, differentOwner.id);
  assert.equal(await readLayout(db, other, first.id), null);
  assert.equal(await renameDashboard(db, other, first.id, "Stolen"), null);
  await assert.rejects(createDashboard(db, owner, "overview"), /duplicate key/);
  assert.equal((await renameDashboard(db, owner, second.id, "Build health"))?.name, "Build health");
  const saved = await saveLayout(db, owner, first.id, { cards: { latency: { x: 6, span: 6 } } }, 1);
  assert.equal(saved.revision, 2);
  await assert.rejects(saveLayout(db, owner, first.id, { lost: true }, 1), LayoutConflictError);
  assert.deepEqual((await readLayout(db, owner, first.id))?.layout, saved.layout);
  assert.deepEqual((await readLayout(db, owner, second.id))?.layout, { cards: {} });
  assert.equal(await deleteDashboard(db, other, first.id), false);
  assert.equal(await deleteDashboard(db, owner, first.id), true);
  assert.equal((await db.query(`SELECT * FROM ${db.table("dashboard_layouts")} WHERE dashboard_id = $1`, [first.id])).rowCount, 0);
});

test("cache retains stale data for revalidation and supports per-card invalidation", async () => {
  const id = randomUUID();
  await writeCache(db, id, "latency", { milliseconds: 80 }, 60);
  assert.equal((await readCache(db, id))?.stale, false);
  await db.query(`UPDATE ${db.table("dataset_cache")} SET stored_at = now() - interval '2 minutes', expires_at = now() - interval '1 minute' WHERE cache_key = $1`, [id]);
  assert.deepEqual((await readCache<{ milliseconds: number }>(db, id))?.payload, { milliseconds: 80 });
  assert.equal((await readCache(db, id))?.stale, true);
  assert.equal(await pruneCache(db), 1);
  assert.equal(await readCache(db, id), null);
  await writeCache(db, id, "latency", [1, 2, 3], 60);
  await writeCache(db, id + "-other", "seo", [], 60);
  assert.equal(await invalidateCache(db, "latency"), 1);
  assert.ok(await readCache(db, id + "-other"));
});

test("collector leases arbitrate concurrency, reclaim crashes, and publish atomically", async () => {
  const target = randomUUID();
  const leases = await Promise.all([startCollectorRun(db, "region-latency", target), startCollectorRun(db, "region-latency", target)]);
  assert.equal(leases.filter(Boolean).length, 1);
  const lease = leases.find(Boolean)!;
  assert.equal(await heartbeatCollectorRun(db, lease), true);
  await assert.rejects(completeCollectorRun(db, lease, async (tx) => {
    await writeCache(tx, target, "latency", { partial: true }, 60);
    throw new Error("network failed");
  }), /network failed/);
  assert.equal(await readCache(db, target), null);
  assert.equal((await latestCollectorRun(db, "region-latency", target))?.status, "running");
  const value = await completeCollectorRun(db, lease, async (tx) => { await writeCache(tx, target, "latency", { complete: true }, 60); return { value: "done", rowsWritten: 1 }; });
  assert.equal(value, "done");
  assert.equal((await latestCollectorRun(db, "region-latency", target))?.status, "succeeded");
  const expired = await startCollectorRun(db, "region-latency", target);
  assert.ok(expired);
  await db.query(`UPDATE ${db.table("collector_runs")} SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [expired.id]);
  const replacement = await startCollectorRun(db, "region-latency", target);
  assert.ok(replacement);
  assert.notEqual(replacement.id, expired.id);
  assert.equal(await heartbeatCollectorRun(db, expired), false);
  await assert.rejects(completeCollectorRun(db, expired, async () => ({ value: "bad", rowsWritten: 0 })), /expired/);
  assert.equal(await failCollectorRun(db, replacement, "Provider unavailable"), true);
  assert.equal((await latestCollectorRun(db, "region-latency", target))?.error, "Provider unavailable");
});

test("all telemetry families round-trip; upserts, constraints and parent relations work", async () => {
  const report = await insertTelemetry(db, "lighthouse_reports", { page_path: "/", page_url: "https://example.test/", strategy: "mobile", performance_score: 91, lcp_ms: 1400, raw: { diagnostics: [] } });
  await insertTelemetry(db, "web_vitals", { page_path: "/", metric_name: "LCP", metric_value: 1900, rating: "good" });
  const audit = await insertTelemetry(db, "seo_audits", { page_path: "/", page_url: "https://example.test/", score: 88, checks: { canonical: true } });
  await insertTelemetry(db, "seo_findings", { audit_id: audit.id, rule_id: "description", severity: "warning", message: "Missing description" });
  await insertTelemetry(db, "region_latency_samples", { region_key: "fra", region_label: "Frankfurt", page_path: "/", page_url: "https://example.test/", status: "ok", ttfb_ms: 48 });
  await insertTelemetry(db, "region_latency_samples", { region_key: "syd", region_label: "Sydney", page_path: "/", page_url: "https://example.test/", status: "error", error: "Probe timeout" });
  await insertTelemetry(db, "region_latency_daily", { day: "2026-09-05", region_key: "fra", page_path: "/", samples: 2, ok_samples: 1, error_samples: 1, ttfb_p50_ms: 48 }, { upsert: true });
  const metric = await insertTelemetry(db, "repo_metrics", { repository: "aisocratic/atlas", source_loc: 2400, duplication_percentage: 1.4, metrics: { testCount: 11 } });
  await insertTelemetry(db, "dependency_health", { metric_id: metric.id, package_name: "pg", current_version: "8.20.0", dependency_type: "runtime", vulnerability_count: 0 });
  const release = { repository: "aisocratic/atlas", tag: "v0.1.0", published_at: "2026-09-05T00:00:00Z" };
  await insertTelemetry(db, "releases", release, { upsert: true });
  await insertTelemetry(db, "releases", { ...release, title: "Updated title" }, { upsert: true });
  const malicious = "'); DROP SCHEMA public CASCADE; --";
  await insertTelemetry(db, "error_logs", { level: "error", fingerprint: randomUUID(), message: malicious, metadata: { source: "test" } });
  await insertTelemetry(db, "page_views", { path: "/", session_key: "anonymous-session", is_bot: false });
  const ai = await insertTelemetry(db, "ai_usage", { day: "2026-09-05", tool: "codex", opted_in: true, input_tokens: "9007199254740993" }, { upsert: true });
  assert.equal(ai.input_tokens, "9007199254740993", "bigint must not lose precision");
  await assert.rejects(insertTelemetry(db, "ai_usage", { day: "2026-09-05", tool: "other", opted_in: false as unknown as true }), /check constraint/);
  await insertTelemetry(db, "anomalies", { card_id: "lighthouse", fingerprint: report.id, severity: "warning", title: "LCP regression", baseline_value: 1200, observed_value: 1900, evidence: { report: report.id } });
  assert.equal((await readTelemetry(db, "releases", { filters: { repository: "aisocratic/atlas" } })).length, 1);
  assert.equal((await readTelemetry(db, "error_logs", { filters: { message: malicious } })).length, 1);
  assert.equal((await readTelemetry(db, "region_latency_samples", { since: "2020-01-01", filters: { status: "error" } })).length, 1);
  await assert.rejects(insertTelemetry(db, "lighthouse_reports", { page_path: "/", page_url: "x", strategy: "mobile", performance_score: 999 }), /check constraint/);
  await assert.rejects(readTelemetry(db, "error_logs", { filters: { "message; DROP TABLE x": "value" } }), /Unknown telemetry filter/);
  await db.query(`DELETE FROM ${db.table("seo_audits")} WHERE id = $1`, [audit.id]);
  assert.equal((await readTelemetry(db, "seo_findings", { filters: { audit_id: audit.id } })).length, 0);
  assert.equal((await db.query(`SELECT * FROM ${db.table("lighthouse_reports")} WHERE id = $1`, [report.id])).rowCount, 1);
});

test("transaction failures rollback writes and return a usable connection", async () => {
  const id = randomUUID();
  await assert.rejects(db.transaction(async (tx) => { await writeCache(tx, id, "test", {}, 30); await tx.query("SELECT 1 / 0"); }));
  assert.equal(await readCache(db, id), null);
  assert.equal((await db.query("SELECT 42 AS answer")).rows[0].answer, 42);
});
