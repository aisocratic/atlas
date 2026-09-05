import { createHash } from "node:crypto"
import type { CardContext, CollectionContext } from "../../lib/cards/define"
import type { Queryable } from "../../lib/db/pool"
import { insertTelemetry } from "../../lib/db/telemetry"
import { sourceOrigin } from "../../lib/ingest/service"
import { regionOptions } from "../region-latency/options"

export function requirements(context: CardContext) { return context.config.siteUrl ? [] : [{ id: "site", reason: "Set ATLAS_SITE_URL and collect at least five historical regional samples before deriving anomalies." }] }
export async function comparisons(db: Queryable, context: CardContext) {
  const options = regionOptions({ ...context, options: context.config.cards["region-latency"] ?? { enabled: true, optIn: false, options: {} } })
  const result = await db.query<{ url: string; region: string; baseline: number; observed: number; samples: number; measured_at: Date }>(`WITH baseline AS (
    SELECT page_url, region_key, count(*)::int AS samples, percentile_cont(0.5) WITHIN GROUP (ORDER BY ttfb_ms) AS baseline
    FROM ${db.table("region_latency_samples")} WHERE page_url=ANY($1::text[]) AND region_key=ANY($2::text[]) AND status='ok' AND ttfb_ms IS NOT NULL AND measured_at >= now()-interval '8 days' AND measured_at < now()-interval '1 day' GROUP BY page_url,region_key HAVING count(*)>=5
  ), latest AS (
    SELECT DISTINCT ON(page_url,region_key) page_url,region_key,ttfb_ms,measured_at FROM ${db.table("region_latency_samples")} WHERE page_url=ANY($1::text[]) AND region_key=ANY($2::text[]) AND status='ok' AND ttfb_ms IS NOT NULL AND measured_at >= now()-interval '1 day' ORDER BY page_url,region_key,measured_at DESC
  ) SELECT b.page_url AS url,b.region_key AS region,b.baseline,b.samples,l.ttfb_ms AS observed,l.measured_at FROM baseline b JOIN latest l USING(page_url,region_key)`, [options.urls.map(url => url.href), options.regions.map(region => region.key)])
  return result.rows
}
export const collector = { async collect(context: CollectionContext) { return { async publish(tx: Queryable) {
  const checks = await comparisons(tx, context), origin = sourceOrigin(context.config)
  await tx.query(`UPDATE ${tx.table("anomalies")} SET resolved_at=now() WHERE source_origin=$1 AND card_id='region-latency' AND resolved_at IS NULL`, [origin])
  let rowsWritten = 0
  for (const check of checks) if (check.observed > check.baseline * 1.5 && check.observed > check.baseline + 100) {
    await insertTelemetry(tx, "anomalies", { source_origin: origin, card_id: "region-latency", fingerprint: createHash("sha256").update(`${origin}:${check.url}:${check.region}:ttfb`).digest("hex"), severity: "warning", title: `${check.region}: overall TTFB increased`, description: "Latest 24-hour reading exceeds the previous seven-day median by both 50% and 100 ms; baseline needs five samples.", baseline_value: check.baseline, observed_value: check.observed, evidence: { pageUrl: check.url, region: check.region, baselineSamples: check.samples, measuredAt: check.measured_at.toISOString() }, resolved_at: null }, { upsert: true }); rowsWritten++
  }
  return { rowsWritten }
} } } }
