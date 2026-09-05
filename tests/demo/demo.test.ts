import test from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { createDatabase, databaseOptionsFromEnv } from "../../lib/db/pool"
import { migrate } from "../../lib/db/migrate"
import { seedDemo, demoDataset, fixtureKey } from "../../lib/demo/dataset"
import { demoFixtures } from "../../lib/demo/fixtures"
import { demoMode, runtimeSchema } from "../../lib/demo/mode"
import { serverRegistry } from "../../cards/server"
import { CardServices } from "../../lib/cards/service"
import { resolveConfig } from "../../lib/config"
import { setupStatus } from "../../lib/auth/setup"
import { authorizeRequest } from "../../lib/auth"
import { createIngestHandlers } from "../../lib/ingest/service"
const connectionString = process.env.ATLAS_TEST_DATABASE_URL!
if (!connectionString || !["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname) || !/(test|roadmap)/.test(new URL(connectionString).pathname)) throw new Error("Use a local ATLAS_TEST_DATABASE_URL test/roadmap database.")
test("demo mode is explicit and schemas cannot overlap", () => {
  assert.equal(demoMode({}), false)
  assert.throws(() => demoMode({ ATLAS_DEMO: "1" }))
  assert.equal(runtimeSchema({ ATLAS_SCHEMA: "atlas_live", ATLAS_DEMO: "true" }), "atlas_demo_preview")
  assert.throws(() => runtimeSchema({ ATLAS_SCHEMA: "atlas_demo_preview" }))
  assert.throws(() => runtimeSchema({ ATLAS_DEMO: "true", ATLAS_DEMO_SCHEMA: "atlas_live" }))
  assert.equal(databaseOptionsFromEnv({ DATABASE_URL: connectionString, ATLAS_DEMO: "true" }).schema, "atlas_demo_preview")
  assert.deepEqual(Object.keys(demoFixtures).sort(), [...serverRegistry.keys()].sort())
})
test("real Postgres seed is deterministic, isolated, complete, and never falls back", async () => {
  const suffix = randomUUID().replaceAll("-", ""), demo = createDatabase({ connectionString, schema: `atlas_demo_${suffix}` }), live = createDatabase({ connectionString, schema: `atlas_live_${suffix}` })
  try {
    await migrate(demo); await migrate(live)
    await live.query(`INSERT INTO ${live.table("dataset_cache")} (cache_key,card_id,payload,expires_at) VALUES ('live-marker','releases','{"live":true}','infinity')`)
    await assert.rejects(seedDemo(live), /reserved/)
    assert.equal((await demoDataset(() => demo, "releases", { limit: 100 })).status, "empty")
    assert.equal(await seedDemo(demo), 9)
    const rows = async () => (await demo.query(`SELECT cache_key,payload,stored_at,expires_at::text FROM ${demo.table("dataset_cache")} ORDER BY cache_key`)).rows
    const first = await rows(); await seedDemo(demo); assert.deepEqual(await rows(), first)
    const service = new CardServices({ registry: serverRegistry, config: resolveConfig({}, {}), env: { ATLAS_DEMO: "true" }, database: () => demo, fetch: async () => { throw new Error("Must not fetch") } })
    for (const id of serverRegistry.keys()) {
      const dataset = await service.dataset(id)
      assert.equal(dataset.status, "ready", id); assert.equal(dataset.provenance, "synthetic"); assert.equal(dataset.stale, false)
      assert.deepEqual(dataset.data, demoFixtures[id].data)
      assert.equal((await service.collect(id)).status, "unsupported")
      assert.equal((await service.dataset(id, { since: "2027-01-01T00:00:00.000Z", limit: 1 })).status, "empty")
    }
    assert.equal((await service.dataset("releases", { limit: 1 })).data && ((await service.dataset("releases", { limit: 1 })).data as { rows: unknown[] }).rows.length, 1)
    for (const kind of ["vitals", "page-views", "errors"] as const) assert.equal((await createIngestHandlers({ config: resolveConfig({}, {}), env: { ATLAS_DEMO: "true" }, database: () => { throw new Error("No write") } }).post(new Request("http://localhost/api/ingest", { method: "POST" }), kind)).status, 403)
    for (const table of ["collector_runs", "lighthouse_reports", "seo_audits", "region_latency_samples", "repo_metrics", "releases", "error_logs", "web_vitals", "page_views", "ai_usage", "anomalies"] as const) assert.equal((await demo.query(`SELECT count(*)::int AS count FROM ${demo.table(table)}`)).rows[0].count, 0, table)
    assert.deepEqual((await live.query(`SELECT payload FROM ${live.table("dataset_cache")}`)).rows, [{ payload: { live: true } }])
    await demo.query(`DELETE FROM ${demo.table("dataset_cache")} WHERE cache_key=$1`, [fixtureKey("releases")])
    assert.match((await service.dataset("releases")).reason!, /seed/)
    assert.equal((await demoDataset(() => live, "releases", { limit: 10 })).status, "error")
    const normal = new CardServices({ registry: serverRegistry, config: resolveConfig({}, {}), env: {}, database: () => { throw new Error("Should not read") } })
    assert.equal((await normal.dataset("ai-usage")).status, "missing-config")
    assert.match((await normal.dataset("ai-usage")).reason!, /opt in/)
  } finally { await demo.query(`DROP SCHEMA "${demo.schema}" CASCADE`); await live.query(`DROP SCHEMA "${live.schema}" CASCADE`); await demo.close(); await live.close() }
})

test("demo needs no monitored site but retains production authentication refusal", async () => {
  const env = { NODE_ENV: "production", ATLAS_DEMO: "true", DATABASE_URL: connectionString, ATLAS_AUTH: "open", ATLAS_APP_URL: "http://127.0.0.1:4186" }
  assert.equal(setupStatus({}, env).site, true)
  assert.equal(setupStatus({}, env).ready, false)
  assert.equal((await authorizeRequest(new Request("http://127.0.0.1:4186/api/datasets/releases"), "read", env)).ok, false)
})
