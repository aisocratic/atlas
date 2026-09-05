import "./env"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { createDatabase } from "../lib/db/pool"
import { migrate } from "../lib/db/migrate"
import { resolveConfig } from "../lib/config"
import { CardServices } from "../lib/cards/service"
import { serverRegistry } from "../cards/server"
import { defaultRegions } from "../cards/region-latency/options"
import { RegionLatencyCard } from "../cards/region-latency/component"
import type { RegionLatencyData } from "../cards/region-latency/types"

// Explicit manual verification only: never part of automated provider tests.
const connectionString = process.env.ATLAS_TEST_DATABASE_URL
if (!connectionString) throw new Error("Set ATLAS_TEST_DATABASE_URL to a disposable loopback test/roadmap database.")
const url = new URL(connectionString)
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/(test|roadmap)/.test(url.pathname)) throw new Error("Live verification requires a disposable loopback test/roadmap database.")
const db = createDatabase({ connectionString, schema: `atlas_live_${randomUUID().replaceAll("-", "")}` })
try {
  await migrate(db)
  const config = resolveConfig({ siteUrl: "https://aisocratic.org/", collectorTimeoutMs: 60_000, cards: { "region-latency": { options: { regions: [defaultRegions[0], defaultRegions[3], defaultRegions[10]] } } } }, {})
  const services = new CardServices({ registry: serverRegistry, config, env: { DATABASE_URL: connectionString, GLOBALPING_API_URL: "https://api.globalping.io/v1/" }, database: () => db })
  const collection = await services.collect("region-latency")
  const envelope = await services.dataset("region-latency")
  const data = envelope.data as RegionLatencyData | null
  const html = renderToStaticMarkup(createElement(RegionLatencyCard, { dataset: envelope }))
  const evidence = { verifiedAt: new Date().toISOString(), source: config.siteUrl, authentication: "No Globalping API key", requestedProbes: 3, collection, envelope, renderedCharacters: html.length }
  await mkdir("test-results", { recursive: true })
  await writeFile("test-results/region-live.json", JSON.stringify(evidence, null, 2) + "\n")
  await writeFile("test-results/region-live.html", html)
  console.log(JSON.stringify({ verifiedAt: evidence.verifiedAt, collection, status: envelope.status, summary: data?.summary, measurements: data?.regions.map(region => ({ region: region.label, status: region.status, ttfbMs: region.ttfbMs, measurementId: region.measurementId, error: region.error })), renderedCharacters: html.length }, null, 2))
  if (collection.status !== "succeeded") process.exitCode = 1
} finally { try { await db.query(`DROP SCHEMA IF EXISTS "${db.schema}" CASCADE`) } finally { await db.close() } }
