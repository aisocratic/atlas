import type { CardContext, CollectionContext } from "../../lib/cards/define"
import { CollectorError } from "../../lib/collectors/execute"
import { numeric, providerEndpoint, record, requestJson, sitePaths, assertOptions } from "../../lib/collectors/http"
import { insertTelemetry, type TelemetryInputs } from "../../lib/db/telemetry"

export function requirements(context: CardContext) {
  try { assertOptions(context, ["paths", "strategy"]); sitePaths(context); strategy(context); return [] } catch { return [{ id: "site-options", reason: "Set ATLAS_SITE_URL and valid Lighthouse paths/strategy (mobile or desktop); remove unknown options." }] }
}
export function strategy(context: CardContext): "mobile" | "desktop" {
  const value = context.options.options.strategy ?? "mobile"
  if (value !== "mobile" && value !== "desktop") throw new CollectorError("Lighthouse strategy must be mobile or desktop.")
  return value
}
export function parseLighthouse(value: unknown, url: URL, selected: "mobile" | "desktop", runId: string): TelemetryInputs["lighthouse_reports"] {
  const result = record(record(value).lighthouseResult), audits = record(result.audits), categories = record(result.categories)
  if (Object.keys(record(result.runtimeError)).length || !result.fetchTime || !Number.isFinite(Date.parse(String(result.fetchTime))) || result.requestedUrl !== url.href) throw new CollectorError("Lighthouse did not return a valid report for the configured URL.")
  const score = (key: string) => { const value = numeric(record(categories[key]).score); return value !== undefined && value <= 1 ? value * 100 : undefined }
  const audit = (key: string) => numeric(record(audits[key]).numericValue)
  if (score("performance") === undefined) throw new CollectorError("Lighthouse performance data is unavailable.")
  return { run_id: runId, measured_at: String(result.fetchTime), page_url: url.href, page_path: url.pathname + url.search, strategy: selected,
    performance_score: score("performance"), accessibility_score: score("accessibility"), seo_score: score("seo"), best_practices_score: score("best-practices"),
    lcp_ms: audit("largest-contentful-paint"), cls: audit("cumulative-layout-shift"), tbt_ms: audit("total-blocking-time"), fcp_ms: audit("first-contentful-paint"), ttfb_ms: audit("server-response-time"), total_byte_weight: audit("total-byte-weight") }
}
export const collector = { timeoutMs: 180_000, async collect(context: CollectionContext) {
  const rows: TelemetryInputs["lighthouse_reports"][] = [], selected = strategy(context)
  for (const url of sitePaths(context)) {
    const endpoint = providerEndpoint(context.env.PAGESPEED_API_URL, "https://www.googleapis.com/pagespeedonline/v5/runPagespeed")
    endpoint.searchParams.set("url", url.href); endpoint.searchParams.set("strategy", selected)
    for (const category of ["performance", "accessibility", "seo", "best-practices"]) endpoint.searchParams.append("category", category)
    if (context.env.PAGESPEED_API_KEY) endpoint.searchParams.set("key", context.env.PAGESPEED_API_KEY)
    rows.push(parseLighthouse(await requestJson(context, endpoint, { timeoutMs: 60_000, maximum: 8_000_000 }), url, selected, context.runId))
  }
  return { async publish(tx: Parameters<typeof insertTelemetry>[0]) { for (const row of rows) await insertTelemetry(tx, "lighthouse_reports", row); return { rowsWritten: rows.length } } }
} }
