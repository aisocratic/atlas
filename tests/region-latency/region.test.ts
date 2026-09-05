import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createDatabase, type Database } from "../../lib/db/pool"
import { migrate } from "../../lib/db/migrate"
import { insertTelemetry } from "../../lib/db/telemetry"
import { resolveConfig } from "../../lib/config"
import { createRegistry, defineCard, type CollectionContext, type CardContext } from "../../lib/cards/define"
import { CardServices } from "../../lib/cards/service"
import { collector, requirements } from "../../cards/region-latency/collector"
import { dataset } from "../../cards/region-latency/dataset"
import { info } from "../../cards/region-latency/info"
import { RegionLatencyCard } from "../../cards/region-latency/component"
import { regionOptions, defaultRegions } from "../../cards/region-latency/options"
import { normalizeMeasurement, measurementRequest, measureRegion } from "../../cards/region-latency/provider"
import type { RegionLatencyData } from "../../cards/region-latency/types"
import { resultFixture, createProvider } from "./provider-fixture"

const connectionString = process.env.ATLAS_TEST_DATABASE_URL
if (!connectionString) throw new Error("Set ATLAS_TEST_DATABASE_URL to a disposable local Postgres database.")
const dbUrl = new URL(connectionString)
if (!["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname) || !/(test|roadmap)/.test(dbUrl.pathname)) throw new Error("Region tests require a loopback test/roadmap database.")
async function withDatabase(work: (db: Database) => Promise<void>) {
  const db = createDatabase({ connectionString: connectionString!, schema: `atlas_region_${randomUUID().replaceAll("-", "")}` })
  try { await migrate(db); await work(db) } finally { try { await db.query(`DROP SCHEMA IF EXISTS "${db.schema}" CASCADE`) } finally { await db.close() } }
}
function context(endpoint = "https://api.globalping.io/v1/", siteUrl = "https://example.test/path?q=one"): CardContext {
  const config = resolveConfig({ siteUrl, cards: { [info.id]: { options: { regions: [defaultRegions[0], defaultRegions[4], defaultRegions[9]] } } } }, {})
  return { config, options: config.cards[info.id], env: { DATABASE_URL: connectionString, GLOBALPING_API_URL: endpoint, GLOBALPING_TOKEN: "private-fixture-token" } }
}
const definition = defineCard({ info, dataset, requirements, collector })
function services(db: Database, ctx: CardContext) { return new CardServices({ registry: createRegistry([definition]), config: ctx.config, env: ctx.env, database: () => db }) }

test("provider payload preserves URL path/query/port and uses HTTP protocol enums", () => {
  const ctx = context(), options = regionOptions(ctx)
  const payload = measurementRequest(options.urls[0], options.regions[0], options.protocol)
  assert.equal(payload.type, "http"); assert.equal(payload.target, "example.test")
  assert.deepEqual(payload.measurementOptions, { protocol: "HTTPS", port: 443, request: { method: "HEAD", path: "/path", query: "q=one" } })
  assert.equal(payload.locations[0].limit, 1); assert.equal("limit" in payload, false)
  const http = regionOptions(context(undefined, "http://example.test:8080/"))
  assert.equal(measurementRequest(http.urls[0], http.regions[0], http.protocol).measurementOptions.port, 8080)
  assert.equal(http.protocol, "HTTP")
  ctx.options.options.protocol = "HTTP2"
  assert.equal(regionOptions(ctx).protocol, "HTTP2")
  ctx.options.options.paths = ["//another.test/path"]
  assert.throws(() => regionOptions(ctx), /same-site/)
  assert.equal(defaultRegions.length, 12)
  assert.throws(() => regionOptions(context("http://provider.example/v1/")), /HTTPS/)
})

test("TTFB sums connection phases and preserves nulls, failed probes, HTTP errors and target identity", () => {
  const url = new URL("https://example.test/"), region = defaultRegions[0]
  const complete = normalizeMeasurement(resultFixture(), url, region, "m")
  assert.equal(complete.ttfb_ms, 120); assert.equal(complete.status, "ok")
  const missing = resultFixture(); (missing.results[0].result.timings as Record<string, unknown>).tls = null
  assert.equal(normalizeMeasurement(missing, url, region, "m").ttfb_ms, undefined)
  assert.equal(normalizeMeasurement(missing, url, region, "m").status, "error")
  assert.equal(normalizeMeasurement(missing, new URL("http://example.test/"), region, "m").ttfb_ms, 100)
  const failed = resultFixture(); failed.results[0].result.status = "failed"
  assert.equal(normalizeMeasurement(failed, url, region, "m").ttfb_ms, undefined)
  const badStatus = resultFixture(); badStatus.results[0].result.statusCode = 503
  assert.equal(normalizeMeasurement(badStatus, url, region, "m").status, "error")
  assert.equal(normalizeMeasurement(resultFixture("FR"), url, region, "m").status, "error")
  assert.equal(normalizeMeasurement(resultFixture("US", "wrong.test"), url, region, "m").status, "error")
  assert.doesNotMatch(JSON.stringify(complete), /private provider/)
})

test("real HTTP provider -> fenced storage -> source-filtered dataset -> accessible card", () => withDatabase(async db => {
  const provider = await createProvider({ pendingPolls: 1 })
  try {
    const ctx = context(provider.endpoint), app = services(db, ctx)
    assert.equal((await app.dataset(info.id)).status, "empty")
    const result = await app.collect(info.id)
    assert.equal(result.status, "succeeded"); assert.equal(result.rowsWritten, 3)
    assert.equal(provider.requests.length, 3)
    assert.ok(provider.authorizations.every(value => value === "Bearer private-fixture-token"))
    const response = await app.dataset(info.id), data = response.data as RegionLatencyData
    assert.equal(response.status, "ready"); assert.equal(response.cache.hit, false); assert.equal(response.run?.status, "succeeded")
    assert.equal(data.summary.medianTtfbMs, 120); assert.equal(data.summary.responding, 1); assert.equal(data.summary.failed, 2)
    assert.equal(data.history.length, 3)
    assert.equal((await app.dataset(info.id)).cache.hit, true)
    const rows = (await db.query(`SELECT * FROM ${db.table("region_latency_samples")} ORDER BY region_key`)).rows
    const german = rows.find(row => row.region_key === "de"), singapore = rows.find(row => row.region_key === "sg")
    assert.ok(german); assert.ok(singapore)
    assert.equal(german.ttfb_ms, null)
    assert.equal(singapore.status, "error")
    assert.ok(rows.every(row => row.run_id === result.runId && row.page_url === "https://example.test/path?q=one"))
    const html = renderToStaticMarkup(createElement(RegionLatencyCard, { dataset: response }))
    assert.match(html, /120 ms/); assert.match(html, /Unavailable/); assert.match(html, /<details/); assert.match(html, /<summary/); assert.match(html, /scope="col"/)
    assert.doesNotMatch(html, /private-fixture-token|private provider|secret failure/)
    const second = services(db, context(provider.endpoint, "https://other.test/path?q=one"))
    assert.equal((await second.dataset(info.id)).status, "empty")
    await second.collect(info.id)
    assert.equal((await db.query(`SELECT * FROM ${db.table("region_latency_daily")} WHERE region_key='us'`)).rowCount, 2)
    assert.equal(((await second.dataset(info.id)).data as RegionLatencyData).source, "https://other.test")
    assert.equal(((await app.dataset(info.id, { limit: 1000, until: "2000-01-01T00:00:00Z", since: "1999-01-01T00:00:00Z" })).data as RegionLatencyData).regions.length, 0)
  } finally { await provider.close() }
}))

test("429 is an honest failed run with no fake measurements or leaked provider error", () => withDatabase(async db => {
  const provider = await createProvider({ rateLimit: true })
  try {
    const app = services(db, context(provider.endpoint)), result = await app.collect(info.id)
    assert.equal(result.status, "failed"); assert.match(result.error!, /rate limit/)
    assert.equal((await db.query(`SELECT * FROM ${db.table("region_latency_samples")}`)).rowCount, 0)
    const response = await app.dataset(info.id)
    assert.equal(response.run?.status, "failed"); assert.equal(response.status, "empty"); assert.ok(response.error)
    assert.doesNotMatch(JSON.stringify(response), /private token/)
  } finally { await provider.close() }
}))

test("polling respects an abortable deadline", async () => {
  const provider = await createProvider({ pendingPolls: 100 })
  try {
    const ctx = context(provider.endpoint), options = regionOptions(ctx)
    const collection: CollectionContext = { ...ctx, signal: new AbortController().signal, runId: "test", fetch }
    const result = await measureRegion(collection, options, options.urls[0], options.regions[0], { pollIntervalMs: 5, measurementTimeoutMs: 40 })
    assert.equal(result.completed, false); assert.match(result.sample.error!, /timed out/)
    assert.equal(result.sample.ttfb_ms, undefined)
    const aborted = new AbortController(); aborted.abort()
    await assert.rejects(measureRegion({ ...collection, signal: aborted.signal }, options, options.urls[0], options.regions[0]))
  } finally { await provider.close() }
})

test("source-isolation migration preserves legacy aggregate callers and same-path sites", () => withDatabase(async db => {
  const row = { day: "2026-09-05", region_key: "us", page_path: "/", samples: 1, ok_samples: 1, error_samples: 0, ttfb_p50_ms: 100 }
  await insertTelemetry(db, "region_latency_daily", row, { upsert: true })
  await insertTelemetry(db, "region_latency_daily", { ...row, page_url: "https://one.test/" }, { upsert: true })
  await insertTelemetry(db, "region_latency_daily", { ...row, page_url: "https://two.test/", ttfb_p50_ms: 200 }, { upsert: true })
  await insertTelemetry(db, "region_latency_daily", { ...row, samples: 2, ok_samples: 2 }, { upsert: true })
  const rows = (await db.query(`SELECT page_url,samples,ttfb_p50_ms FROM ${db.table("region_latency_daily")} ORDER BY page_url`)).rows
  assert.equal(rows.length, 3); assert.equal(rows[0].page_url, ""); assert.equal(rows[0].samples, 2)
  assert.equal(rows[1].ttfb_p50_ms, 100); assert.equal(rows[2].ttfb_p50_ms, 200)
}))

test("daily aggregates use UTC midnight even with a non-UTC transaction timezone", () => withDatabase(async db => {
  const provider = await createProvider({ measuredAt: "2026-01-02T00:05:00.000Z" })
  try {
    const ctx = context(provider.endpoint, "https://timezone.test/")
    ctx.options.options.regions = [defaultRegions[0]]
    const base = { region_key: "us", region_label: "United States", page_url: "https://timezone.test/", page_path: "/", status: "ok" as const }
    await insertTelemetry(db, "region_latency_samples", { ...base, measured_at: "2026-01-01T23:59:00Z", ttfb_ms: 999 })
    await insertTelemetry(db, "region_latency_samples", { ...base, measured_at: "2026-01-02T00:01:00Z", ttfb_ms: 100 })
    const nonUtc: Database = { ...db, transaction: work => db.transaction(async tx => { await tx.query("SET LOCAL timezone='America/New_York'"); return work(tx) }) }
    assert.equal((await services(nonUtc, ctx).collect(info.id)).status, "succeeded")
    const day = (await db.query(`SELECT samples,ttfb_p50_ms FROM ${db.table("region_latency_daily")} WHERE day='2026-01-02'`)).rows[0]
    assert.equal(day.samples, 2); assert.equal(day.ttfb_p50_ms, 110)
  } finally { await provider.close() }
}))

test("query history uses exclusive timestamps and display limits do not change summary", () => withDatabase(async db => {
  const ctx = context(undefined, "https://range.test/")
  ctx.options.options.regions = [defaultRegions[0], defaultRegions[4]]
  const base = { page_url: "https://range.test/", page_path: "/", status: "ok" as const }
  await insertTelemetry(db, "region_latency_samples", { ...base, region_key: "us", region_label: "United States", measured_at: "2026-01-01T23:30:00Z", ttfb_ms: 100 })
  await insertTelemetry(db, "region_latency_samples", { ...base, region_key: "de", region_label: "Germany", measured_at: "2026-01-02T00:00:00Z", ttfb_ms: 200 })
  await insertTelemetry(db, "region_latency_samples", { ...base, region_key: "us", region_label: "United States", measured_at: "2026-01-02T00:30:00Z", ttfb_ms: 300 })
  const app = services(db, ctx)
  const beforeMidnight = (await app.dataset(info.id, { since: "2026-01-01T00:00:00Z", until: "2026-01-02T00:00:00Z", limit: 1000 })).data as RegionLatencyData
  assert.equal(beforeMidnight.history.length, 1); assert.equal(beforeMidnight.history[0].day, "2026-01-01"); assert.equal(beforeMidnight.history[0].medianMs, 100)
  const partialDay = (await app.dataset(info.id, { since: "2026-01-02T00:00:00Z", until: "2026-01-02T00:15:00Z", limit: 1000 })).data as RegionLatencyData
  assert.equal(partialDay.history.length, 1); assert.equal(partialDay.history[0].key, "de"); assert.equal(partialDay.history[0].medianMs, 200)
  const limited = (await app.dataset(info.id, { since: "2026-01-02T00:00:00Z", until: "2026-01-02T01:00:00Z", limit: 1 })).data as RegionLatencyData
  assert.equal(limited.regions.length, 1); assert.equal(limited.truncated, true); assert.equal(limited.totalMeasured, 2)
  assert.equal(limited.summary.responding, 2); assert.equal(limited.summary.medianTtfbMs, 250)
}))
