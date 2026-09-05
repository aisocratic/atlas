import assert from "node:assert/strict"
import { createServer } from "node:http"
import { once } from "node:events"
import { test } from "node:test"
import { createHash } from "node:crypto"
import { withDatabase, services } from "./support"
import { resolveConfig } from "../../lib/config"
import { createIngestHandlers, writeCredentialConfigured } from "../../lib/ingest/service"
import { authorizeRequest } from "../../lib/auth"
import { CardServices } from "../../lib/cards/service"
import { createRegistry } from "../../lib/cards/define"
import { serverRegistry } from "../../cards/server"
import type { TelemetryPresentation } from "../../lib/cards/presentation"

const origin = "https://browser.example", publicKey = "public-browser-write-fixture", errorToken = "private-error-write-fixture-token-32chars"
test("ingestion credentials cannot authorize read, collection, administration, or reuse privileged secrets", async () => {
  for (const token of [publicKey, errorToken]) for (const action of ["read", "collect", "write"] as const) {
    const result = await authorizeRequest(new Request("http://127.0.0.1/api", { headers: { Authorization: `Bearer ${token}` } }), action, { ATLAS_AUTH: "open", ATLAS_COLLECTOR_TOKEN: "separate-collector-token-at-least-32chars" })
    assert.equal(result.ok, false)
  }
  assert.equal(writeCredentialConfigured({ ATLAS_RUM_WRITE_KEY: publicKey, ATLAS_PASSWORD: publicKey }, "browser"), false)
  assert.equal(writeCredentialConfigured({ ATLAS_ERRORS_WRITE_TOKEN: errorToken, ATLAS_PROXY_SECRET: errorToken }, "server"), false)
})
test("a read racing ingestion cannot repopulate the current cache generation", () => withDatabase(async db => {
  const config = resolveConfig({ siteUrl: origin }, {}), env = { ATLAS_RUM_WRITE_KEY: publicKey, DATABASE_URL: "configured" }, original = serverRegistry.get("real-users")!
  let release!: () => void, read!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { read = resolve })
  const blocked = new CardServices({ registry: createRegistry([{ ...original, dataset: async context => { const result = await original.dataset(context); read(); await gate; return result } }]), config, env, database: () => db })
  const pending = blocked.dataset("real-users"); await started
  const result = await createIngestHandlers({ config, env, database: () => db }).post(new Request("http://127.0.0.1/api/ingest/vitals", { method: "POST", headers: { Origin: origin }, body: JSON.stringify({ writeKey: publicKey, events: [{ id: "racing", name: "INP", value: 120, path: "/" }] }) }), "vitals")
  assert.equal(result.status, 202); release(); assert.equal((await pending).status, "empty")
  const current = await services(db, { siteUrl: origin }, env).dataset("real-users")
  assert.equal(current.status, "ready"); assert.equal(current.cache.hit, false); assert.equal((current.data as TelemetryPresentation).metrics[1].value, "120 ms")
}))
test("actual HTTP ingestion scopes keys/origins, deduplicates final metrics, and invalidates source caches", () => withDatabase(async db => {
  const env = { ATLAS_RUM_WRITE_KEY: publicKey, ATLAS_ERRORS_WRITE_TOKEN: errorToken }, config = resolveConfig({ siteUrl: origin }, {})
  const handlers = createIngestHandlers({ config, env, database: () => db })
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const req = new Request(`http://${request.headers.host}${request.url}`, { method: request.method, headers: Object.fromEntries(Object.entries(request.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")), body: Buffer.concat(chunks) })
    const result = await handlers.post(req, request.url === "/errors" ? "errors" : request.url === "/views" ? "page-views" : "vitals")
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text())
  })
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string")
  const endpoint = `http://127.0.0.1:${address.port}`, app = services(db, { siteUrl: origin }, env)
  const post = (path: string, value: unknown, headers: Record<string, string> = { Origin: origin }) => fetch(endpoint + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(value) })
  try {
    assert.equal((await app.dataset("real-users")).status, "empty")
    const timestamp = new Date(Date.now() - 1000).toISOString(), event = { id: "metric-1", name: "LCP", value: 1000, path: "/home?secret=query", timestamp }
    assert.equal((await post("/vitals", { writeKey: publicKey, events: [event] }, { Origin: "https://evil.test" })).status, 403)
    assert.equal((await post("/vitals", { writeKey: errorToken, events: [event] })).status, 401)
    assert.equal((await post("/vitals", { writeKey: publicKey, events: [event] })).status, 202)
    let response = await app.dataset("real-users")
    assert.equal(response.status, "ready"); assert.equal((response.data as TelemetryPresentation).metrics[0].value, "1,000 ms")
    assert.equal((await app.dataset("real-users")).cache.hit, true)
    assert.equal((await post("/vitals", { writeKey: publicKey, events: [{ ...event, value: 2500, timestamp: new Date().toISOString() }] })).status, 202)
    response = await app.dataset("real-users"); assert.equal(response.cache.hit, false); assert.equal((response.data as TelemetryPresentation).metrics[0].value, "2,500 ms")
    assert.equal((await post("/vitals", { writeKey: publicKey, events: [event] })).status, 202)
    assert.equal((await db.query(`SELECT metric_value,page_path FROM ${db.table("web_vitals")}`)).rows[0].metric_value, 2500)
    assert.equal((await db.query(`SELECT * FROM ${db.table("web_vitals")}`)).rowCount, 1)
    assert.equal((await db.query(`SELECT page_path FROM ${db.table("web_vitals")}`)).rows[0].page_path, "/home")
    assert.equal((await post("/views", { writeKey: publicKey, events: [{ id: "view-1", path: "/home" }] })).status, 202)
    assert.equal((await post("/views", { writeKey: publicKey, events: [{ id: "view-1", path: "/home" }] })).status, 202)
    assert.equal((await db.query(`SELECT * FROM ${db.table("page_views")}`)).rowCount, 1)
    const errors = { events: [{ id: "err-1", message: "Handler failed", level: "error", path: "/api" }] }
    assert.equal((await post("/errors", errors, { Authorization: `Bearer ${publicKey}` })).status, 401)
    assert.equal((await post("/errors", errors, { Authorization: `Bearer ${errorToken}`, Origin: origin })).status, 403)
    assert.equal((await post("/errors", errors, { Authorization: `Bearer ${errorToken}` })).status, 202)
    assert.equal((await post("/errors", errors, { Authorization: `Bearer ${errorToken}` })).status, 202)
    assert.equal((await db.query(`SELECT * FROM ${db.table("error_logs")}`)).rowCount, 1)
    const errorData = (await app.dataset("server-errors")).data as TelemetryPresentation
    assert.equal(errorData.metrics[0].value, "1"); assert.equal(errorData.metrics.some(metric => /rate/i.test(metric.label)), false)
    for (const id of ["real-users", "server-errors"]) assert.equal((await app.collect(id)).status, "succeeded")
    const other = services(db, { siteUrl: "https://other.example" }, env)
    for (const id of ["real-users", "server-errors"]) assert.equal((await other.dataset(id)).status, "empty")
    assert.equal((await post("/vitals", { writeKey: publicKey, events: [{ ...event, prompt: "must reject" }] })).status, 400)
    const scope = createHash("sha256").update(`${origin}:real-users`).digest("hex")
    await db.query(`UPDATE ${db.table("ingest_rate_buckets")} SET requests=120 WHERE scope_key=$1`, [scope])
    assert.equal((await post("/vitals", { writeKey: publicKey, events: [event] })).status, 429)
    assert.equal(handlers.options(new Request(endpoint, { method: "OPTIONS", headers: { Origin: origin } })).status, 204)
    assert.equal(handlers.options(new Request(endpoint, { method: "OPTIONS", headers: { Origin: "https://evil.test" } })).status, 403)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}))
