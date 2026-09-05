import { load } from "cheerio"
import type { CardContext, CollectionContext } from "../../lib/cards/define"
import { sitePaths, requestText, assertOptions } from "../../lib/collectors/http"
import { insertTelemetry } from "../../lib/db/telemetry"

export function requirements(context: CardContext) { try { assertOptions(context, ["paths"]); sitePaths(context); return [] } catch { return [{ id: "site", reason: "Set ATLAS_SITE_URL and 1–5 same-site SEO paths; remove unknown options." }] } }
export function auditHtml(html: string, url: URL, status: number, robotsHeader = "") {
  const $ = load(html), title = $("title").first().text().trim().slice(0, 500), description = $("meta[name='description']").attr("content")?.trim().slice(0, 1000) ?? ""
  let canonical: string | undefined
  try { const raw = $("link[rel='canonical']").attr("href"); if (raw) { const value = new URL(raw, url); if (["http:", "https:"].includes(value.protocol) && !value.username && !value.password) canonical = value.href } } catch { /* Invalid canonical becomes an explicit finding. */ }
  const robots = `${robotsHeader} ${$("meta[name='robots']").attr("content") ?? ""}`, indexable = !/\b(noindex|none)\b/i.test(robots)
  const checks = [
    { rule: "http", ok: status >= 200 && status < 300, message: "Page returns a successful HTTP status." },
    { rule: "title", ok: title.length >= 10 && title.length <= 70, message: "Title contains 10–70 characters." },
    { rule: "description", ok: description.length >= 50 && description.length <= 180, message: "Meta description contains 50–180 characters." },
    { rule: "canonical", ok: Boolean(canonical && new URL(canonical).origin === url.origin), message: "Canonical URL is valid and belongs to this site." },
    { rule: "indexable", ok: indexable, message: "Robots directives permit indexing." },
    { rule: "h1", ok: $("h1").length === 1, message: "Page contains exactly one H1 heading." },
    { rule: "og", ok: Boolean($("meta[property='og:title']").attr("content") && $("meta[property='og:description']").attr("content")), message: "Open Graph title and description are present." },
  ]
  return { title, description, canonical, indexable, checks, score: 100 * checks.filter(check => check.ok).length / checks.length }
}
export const collector = { async collect(context: CollectionContext) {
  const results: { url: URL; status: number; audit: ReturnType<typeof auditHtml> }[] = []
  for (const url of sitePaths(context)) {
    const response = await requestText(context, url, { sameOriginRedirects: true, allowHttpErrors: true, headers: { "User-Agent": "Atlas-SEO/1.0", Accept: "text/html" } })
    const audit = auditHtml(response.text, url, response.response.status, response.response.headers.get("x-robots-tag") ?? "")
    results.push({ url, status: response.response.status, audit })
  }
  return { async publish(tx: Parameters<typeof insertTelemetry>[0]) {
    let rowsWritten = 0
    for (const { url, status, audit } of results) {
      const row = await insertTelemetry(tx, "seo_audits", { run_id: context.runId, page_path: url.pathname + url.search, page_url: url.href, status_code: status, score: audit.score, title: audit.title, description: audit.description, canonical_url: audit.canonical, indexable: audit.indexable, has_og: audit.checks.find(check => check.rule === "og")!.ok, checks: { rules: audit.checks } }); rowsWritten++
      for (const check of audit.checks.filter(check => !check.ok)) { await insertTelemetry(tx, "seo_findings", { audit_id: row.id, rule_id: check.rule, severity: ["http", "indexable"].includes(check.rule) ? "error" : "warning", message: check.message }); rowsWritten++ }
    }
    return { rowsWritten }
  } }
} }
