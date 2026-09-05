import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { test } from "node:test"
import { createDatabase, migrate, insertTelemetry, readTelemetry, type Database } from "../../lib/db/index"
import { createRegistry, defineCard, type CardDefinition, type CollectionBatch } from "../../lib/cards/define"
import { CardServices } from "../../lib/cards/service"
import { createCardHandlers } from "../../lib/cards/handlers"
import { resolveConfig } from "../../lib/config"
import { runCollectCommand } from "../../scripts/collect"

const connectionString = process.env.ATLAS_TEST_DATABASE_URL
if (!connectionString) throw new Error("Set ATLAS_TEST_DATABASE_URL to a disposable local Postgres database before running card tests.")
const url = new URL(connectionString)
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/(test|roadmap)/.test(url.pathname)) throw new Error("Card tests require a loopback test/roadmap database.")
async function withDatabase(work: (db: Database) => Promise<void>) {
  const db = createDatabase({ connectionString: connectionString!, schema: `atlas_cards_${randomUUID().replaceAll("-", "")}` })
  try { await migrate(db); await work(db) } finally { try { await db.query(`DROP SCHEMA IF EXISTS "${db.schema}" CASCADE`) } finally { await db.close() } }
}
const info = { id: "test-card", title: "Test card", category: "Testing", description: "Local deterministic test collector.", defaultLayout: { width: 4, height: 3 }, defaultEnabled: true, freshnessSeconds: 3600 }
function definition(): CardDefinition {
  return defineCard({
    info,
    dataset: async ({ db }) => {
      const rows = await readTelemetry(db, "error_logs")
      return { data: rows.map(row => ({ message: row.message })), empty: rows.length === 0 }
    },
    collector: { collect: async () => ({ publish: async tx => {
      await insertTelemetry(tx, "error_logs", { level: "error", message: "Explicit test fixture", fingerprint: randomUUID() })
      return { rowsWritten: 1 }
    } }) },
  })
}
function services(db: Database, card = definition(), overrides = {}) {
  return new CardServices({ registry: createRegistry([card]), config: resolveConfig({ siteUrl: "http://example.test", ...overrides }, {}), env: { DATABASE_URL: connectionString }, database: () => db })
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }

test("dataset TTL, empty/ready states, run freshness and successful invalidation use real Postgres", () => withDatabase(async db => {
  let reads = 0
  const card = definition(), query = card.dataset
  card.dataset = async context => { reads++; return query(context) }
  const app = services(db, card)
  const empty = await app.dataset(info.id)
  assert.equal(empty.status, "empty"); assert.equal(empty.cache.hit, false)
  assert.equal((await app.dataset(info.id)).cache.hit, true); assert.equal(reads, 1)
  const result = await app.collect(info.id)
  assert.equal(result.status, "succeeded"); assert.equal(result.rowsWritten, 1)
  const ready = await app.dataset(info.id)
  assert.equal(ready.status, "ready"); assert.equal(ready.run?.status, "succeeded"); assert.ok(ready.updatedAt); assert.equal(ready.stale, false); assert.equal(ready.cache.hit, false)
  assert.equal((await app.dataset(info.id)).cache.hit, true)
  await db.query(`UPDATE ${db.table("dataset_cache")} SET stored_at = now() - interval '2 minutes', expires_at = now() - interval '1 minute'`)
  assert.equal((await app.dataset(info.id)).cache.hit, false)
  const anotherTarget = services(db, card, { siteUrl: "http://another.test" })
  assert.equal((await anotherTarget.dataset(info.id)).cache.hit, false)
  assert.equal((await anotherTarget.dataset(info.id)).run, null)
}))

test("concurrent execution admits one collector and commits telemetry with its run", () => withDatabase(async db => {
  const started = deferred<void>(), release = deferred<void>()
  let calls = 0
  const card = definition(), original = card.collector!
  card.collector = { collect: async context => { calls++; started.resolve(); await release.promise; return original.collect(context) } }
  const app = services(db, card)
  const first = app.collect(info.id)
  await started.promise
  assert.equal((await app.collect(info.id)).status, "already-running")
  assert.equal((await db.query(`SELECT * FROM ${db.table("collector_runs")} WHERE status='running'`)).rowCount, 1)
  release.resolve()
  assert.equal((await first).status, "succeeded"); assert.equal(calls, 1)
  assert.equal((await readTelemetry(db, "error_logs")).length, 1)
}))

test("failed publication rolls back telemetry, sanitizes errors and marks previous data stale", () => withDatabase(async db => {
  const card = definition(), app = services(db, card)
  await app.collect(info.id)
  await app.dataset(info.id)
  card.collector = { collect: async () => ({ publish: async tx => {
    await insertTelemetry(tx, "error_logs", { level: "error", message: "Must roll back", fingerprint: randomUUID() })
    throw new Error("postgres://private:super-secret@host/raw-provider-token")
  } }) }
  const failed = await app.collect(info.id)
  assert.equal(failed.status, "failed"); assert.doesNotMatch(JSON.stringify(failed), /super-secret|raw-provider/)
  const result = await app.dataset(info.id)
  assert.equal(result.status, "ready"); assert.equal(result.stale, true); assert.equal(result.run?.status, "failed"); assert.ok(result.error)
  assert.equal((await readTelemetry(db, "error_logs")).length, 1)
  assert.doesNotMatch(JSON.stringify((await db.query(`SELECT error FROM ${db.table("collector_runs")} WHERE status='failed'`)).rows), /super-secret/)
}))

test("deadlines abort external work and late completion cannot publish", () => withDatabase(async db => {
  const released = deferred<CollectionBatch>()
  let published = false, aborted = false
  const card = definition()
  card.collector = { timeoutMs: 30, collect: async ({ signal }) => { signal.addEventListener("abort", () => { aborted = true }); return released.promise } }
  const app = services(db, card)
  const result = await app.collect(info.id)
  assert.equal(result.status, "timeout"); assert.equal(aborted, true)
  released.resolve({ publish: async () => { published = true; return { rowsWritten: 1 } } })
  await delay(20)
  assert.equal(published, false)
  assert.equal((await db.query(`SELECT status FROM ${db.table("collector_runs")}`)).rows[0].status, "failed")
}))

test("lost leases cannot publish and a subsequent worker recovers", () => withDatabase(async db => {
  const card = definition()
  let published = false
  card.collector = { collect: async ({ runId }) => {
    await db.query(`UPDATE ${db.table("collector_runs")} SET lease_expires_at=now()-interval '1 second' WHERE id=$1`, [runId])
    return { publish: async () => { published = true; return { rowsWritten: 1 } } }
  } }
  assert.equal((await services(db, card).collect(info.id)).status, "failed"); assert.equal(published, false)
  assert.equal((await services(db).collect(info.id)).status, "succeeded")
}))

test("the execution heartbeat renews an active real-database lease during collection", () => withDatabase(async db => {
  const started = deferred<string>(), release = deferred<void>()
  const card = definition()
  card.collector = { timeoutMs: 1200, collect: async ({ runId }) => { started.resolve(runId); await release.promise; return { publish: async () => ({ rowsWritten: 0 }) } } }
  const pending = services(db, card).collect(info.id)
  const id = await started.promise
  const expiry = async () => (await db.query<{ lease_expires_at: Date }>(`SELECT lease_expires_at FROM ${db.table("collector_runs")} WHERE id=$1`, [id])).rows[0].lease_expires_at.getTime()
  const initial = await expiry()
  let renewed = initial
  for (let attempt = 0; attempt < 40 && renewed === initial; attempt++) { await delay(20); renewed = await expiry() }
  release.resolve()
  assert.equal((await pending).status, "succeeded")
  assert.ok(renewed > initial)
}))

test("a dataset query racing collection cannot poison the current cache generation", () => withDatabase(async db => {
  const started = deferred<void>(), release = deferred<void>()
  const card = definition(), query = card.dataset
  let hold = true
  card.dataset = async context => { const snapshot = await query(context); if (hold) { hold = false; started.resolve(); await release.promise } return snapshot }
  const app = services(db, card)
  const oldRead = app.dataset(info.id)
  await started.promise
  await app.collect(info.id)
  release.resolve()
  assert.equal((await oldRead).status, "empty")
  assert.equal((await app.dataset(info.id)).status, "ready")
}))

test("generic handlers authorize before DB, validate IDs/query, and CLI shares collector execution", () => withDatabase(async db => {
  const app = services(db)
  let calls = 0
  const denied = createCardHandlers({ authorize: async () => ({ ok: false, status: 403, error: "Forbidden" }), services: () => { calls++; return app } })
  assert.equal((await denied.dataset(new Request("http://localhost/api/datasets/test-card"), info.id)).status, 403)
  assert.equal((await denied.collect(new Request("http://localhost/api/collect/test-card", { method: "POST" }), info.id)).status, 403)
  assert.equal(calls, 0)
  const actions: string[] = []
  const handlers = createCardHandlers({ authorize: async (_request, action) => { actions.push(action); return { ok: true } }, services: () => app })
  assert.equal((await handlers.dataset(new Request("http://localhost/?limit=1001"), info.id)).status, 400)
  assert.equal((await handlers.dataset(new Request("http://localhost/"), "unknown")).status, 404)
  assert.equal((await handlers.collect(new Request("http://localhost/", { method: "POST", body: "{}" }), info.id)).status, 400)
  const collect = await handlers.collect(new Request("http://localhost/", { method: "POST" }), info.id)
  assert.equal(collect.status, 200)
  assert.equal((await collect.json()).rowsWritten, 1)
  const emptyStream = new Request("http://localhost/", { method: "POST", body: "", headers: { "content-length": "0" } })
  assert.notEqual(emptyStream.body, null)
  assert.equal((await handlers.collect(emptyStream, info.id)).status, 200)
  const response = await handlers.dataset(new Request("http://localhost/"), info.id)
  assert.equal(response.headers.get("cache-control"), "private, no-store")
  assert.equal((await response.json()).status, "ready")
  assert.ok(actions.includes("read")); assert.ok(actions.includes("collect"))
  const output: string[] = []
  assert.equal(await runCollectCommand([info.id], () => app, value => output.push(value)), 0)
  assert.equal(JSON.parse(output[0]).status, "succeeded")
  assert.equal((await readTelemetry(db, "error_logs")).length, 3)
  assert.equal(await runCollectCommand([], () => app, () => {}), 2)
}))
