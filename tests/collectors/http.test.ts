import assert from "node:assert/strict"
import { createServer } from "node:http"
import { test } from "node:test"
import { once } from "node:events"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { withDatabase, services } from "./support"
import { cardComponents } from "../../cards/components"
import { parseLighthouse } from "../../cards/lighthouse/collector"
import { auditHtml } from "../../cards/seo-audit/collector"
import { providerEndpoint } from "../../lib/collectors/http"
import type { TelemetryPresentation } from "../../lib/cards/presentation"

async function provider() {
  const requests: URL[] = []; let failure = false
  const server = createServer((req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`); requests.push(url)
    if (failure) { res.writeHead(429); res.end("secret-provider-token"); return }
    if (url.pathname === "/redirect") { res.writeHead(302, { location: "https://other.test/" }); res.end(); return }
    if (url.pathname === "/seo") { res.writeHead(200, { "content-type": "text/html" }); res.end(`<title>Atlas search test</title><meta name="description" content="A sufficiently descriptive page summary for the local SEO audit test."><link rel="canonical" href="${url.href}"><h1>Atlas</h1><meta property="og:title" content="Atlas"><meta property="og:description" content="Telemetry">`); return }
    if (url.pathname === "/pagespeed") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ lighthouseResult: { requestedUrl: url.searchParams.get("url"), fetchTime: new Date().toISOString(), categories: Object.fromEntries(["performance", "accessibility", "seo", "best-practices"].map(name => [name, { score: 0.92 }])), audits: { "largest-contentful-paint": { numericValue: 1200 }, "cumulative-layout-shift": { numericValue: 0.04 }, "total-blocking-time": { numericValue: 80 } } } })); return }
    if (url.pathname.includes("/releases")) { const page = Number(url.searchParams.get("page")), rows = Array.from({ length: page === 1 ? 30 : 2 }, (_, i) => ({ id: page * 100 + i, tag_name: `v${page}.${i}`, name: "Published release", published_at: new Date().toISOString(), draft: page === 2 && i === 1, prerelease: i === 2, html_url: `https://github.com/atlas/test/releases/tag/v${page}.${i}`, body: "Actual provider schema" })); res.setHeader("content-type", "application/json"); res.end(JSON.stringify(rows)); return }
    res.writeHead(404); res.end("Missing")
  })
  server.listen(0, "127.0.0.1"); await once(server, "listening")
  const address = server.address(); assert.ok(address && typeof address !== "string")
  return { origin: `http://127.0.0.1:${address.port}`, requests, fail: () => { failure = true }, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}
test("three real HTTP collectors publish to PostgreSQL, query by source, and render measured values", () => withDatabase(async db => {
  const source = await provider()
  try {
    const app = services(db, { siteUrl: `${source.origin}/seo`, repository: "atlas/test" }, { PAGESPEED_API_URL: `${source.origin}/pagespeed`, GITHUB_API_URL: `${source.origin}/` })
    for (const id of ["lighthouse", "seo-audit", "releases"]) {
      assert.equal((await app.dataset(id)).status, "empty")
      assert.equal((await app.collect(id)).status, "succeeded", id)
      const envelope = await app.dataset(id)
      assert.equal(envelope.status, "ready", id)
      assert.ok((envelope.data as TelemetryPresentation).rows.length)
      const html = renderToStaticMarkup(createElement(cardComponents[id], { dataset: envelope }))
      assert.match(html, /<table/); assert.doesNotMatch(html, /secret-provider-token/)
    }
    const lighthouse = (await app.dataset("lighthouse")).data as TelemetryPresentation
    assert.equal(lighthouse.metrics.find(metric => metric.label === "Lab LCP")?.value, "1,200 ms")
    assert.equal(lighthouse.metrics.some(metric => metric.label.includes("INP")), false)
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${db.table("releases")}`)).rows[0].n, 31)
    const limited = (await app.dataset("releases", { limit: 1 })).data as TelemetryPresentation
    assert.equal(limited.rows.length, 1); assert.equal(limited.metrics[0].value, "31")
    assert.ok(source.requests.some(url => url.searchParams.get("page") === "2"))
    assert.equal((await app.collect("releases")).status, "succeeded")
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${db.table("releases")}`)).rows[0].n, 31)
    const other = services(db, { siteUrl: "https://other.test/", repository: "other/repo" })
    for (const id of ["lighthouse", "seo-audit", "releases"]) assert.equal((await other.dataset(id)).status, "empty")
    source.fail()
    for (const id of ["lighthouse", "releases"]) { const outcome = await app.collect(id); assert.equal(outcome.status, "failed"); assert.doesNotMatch(JSON.stringify(outcome), /secret-provider-token/) }
  } finally { await source.close() }
}))
test("SEO findings correspond to measured checks and reject cross-origin redirects", () => withDatabase(async db => {
  const audit = auditHtml("<title>x</title><meta name='robots' content='noindex'><h1>a</h1><h1>b</h1>", new URL("https://example.test/"), 503)
  assert.equal(audit.score, 0); assert.equal(audit.indexable, false); assert.equal(audit.checks.length, 7)
  const source = await provider()
  try { const result = await services(db, { siteUrl: `${source.origin}/redirect` }).collect("seo-audit"); assert.equal(result.status, "failed"); assert.equal((await db.query(`SELECT * FROM ${db.table("seo_audits")}`)).rowCount, 0) } finally { await source.close() }
}))
test("Lighthouse null/error reports and insecure credential endpoints stay unavailable", () => {
  assert.throws(() => parseLighthouse({ lighthouseResult: { runtimeError: { message: "secret" } } }, new URL("https://example.test/"), "mobile", "run"), /valid report/)
  assert.throws(() => providerEndpoint("http://remote.example/", "https://example.test/"), /HTTPS/)
})
