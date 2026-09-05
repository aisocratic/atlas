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
import { cardComponents } from "../cards/components"

// Manual public-source proof. No credentials, private histories, or production DB.
const connectionString = process.env.ATLAS_TEST_DATABASE_URL
if (!connectionString) throw new Error("Set ATLAS_TEST_DATABASE_URL to a disposable local test/roadmap database.")
const url = new URL(connectionString)
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/(test|roadmap)/.test(url.pathname)) throw new Error("Public verification requires a local test/roadmap database.")
const db = createDatabase({ connectionString, schema: `atlas_public_${randomUUID().replaceAll("-", "")}` })
try {
  await migrate(db)
  const config = resolveConfig({ siteUrl: "https://aisocratic.org/", repository: "vercel/next.js", collectorTimeoutMs: 60_000 }, {})
  const service = new CardServices({ registry: serverRegistry, config, env: { DATABASE_URL: connectionString }, database: () => db })
  const evidence = []
  for (const id of (process.argv.includes("--releases-only") ? ["releases"] : ["seo-audit", "releases"])) {
    const collection = await service.collect(id), envelope = await service.dataset(id, { limit: 100, since: new Date(Date.now() - 365 * 86400_000).toISOString() })
    const html = renderToStaticMarkup(createElement(cardComponents[id], { dataset: envelope }))
    evidence.push({ id, collection, envelope, renderedCharacters: html.length })
    console.log(JSON.stringify({ id, collection, status: envelope.status, data: envelope.data, renderedCharacters: html.length }, null, 2))
    if (collection.status !== "succeeded") process.exitCode = 1
  }
  await mkdir("test-results", { recursive: true })
  await writeFile("test-results/collectors-live.json", JSON.stringify({ verifiedAt: new Date().toISOString(), site: config.siteUrl, repository: config.repository, authentication: "No provider keys", evidence }, null, 2) + "\n")
} finally { try { await db.query(`DROP SCHEMA IF EXISTS "${db.schema}" CASCADE`) } finally { await db.close() } }
