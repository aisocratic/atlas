import type { DatasetContext, DatasetResult } from "../../lib/cards/define"
import { regionOptions } from "./options"
import type { RegionLatencyData, RegionReading, RegionHistory } from "./types"

export async function dataset(context: DatasetContext): Promise<DatasetResult<RegionLatencyData>> {
  const options = regionOptions(context), { db, query } = context
  const urls = options.urls.map(url => url.href), keys = options.regions.map(region => region.key)
  const since = query.since ?? new Date(Date.now() - 30 * 86400_000).toISOString()
  const until = query.until ?? new Date().toISOString()
  const latest = await db.query<RegionReading>(`SELECT * FROM (
    SELECT DISTINCT ON (page_url, region_key) region_key AS key, region_label AS label, page_path AS path, page_url AS url,
      probe_country AS country, probe_city AS city, to_char(measured_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "measuredAt",
      measurement_id AS "measurementId", status, status_code AS "statusCode", ttfb_ms AS "ttfbMs", load_ms AS "totalMs", error
    FROM ${db.table("region_latency_samples")} WHERE page_url=ANY($1::text[]) AND region_key=ANY($2::text[]) AND measured_at >= $3::timestamptz AND measured_at < $4::timestamptz
    ORDER BY page_url, region_key, measured_at DESC, id DESC
  ) samples ORDER BY path, label`, [urls, keys, since, until])
  // Timestamp-filter before grouping so boundary-day buckets cannot include
  // measurements outside the requested [since, until) range.
  const history = await db.query<RegionHistory>(`SELECT to_char((measured_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS day, region_key AS key, page_path AS path,
      count(*)::integer AS samples, count(*) FILTER (WHERE status='error')::integer AS errors,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ttfb_ms) FILTER (WHERE status='ok') AS "medianMs",
      percentile_cont(0.95) WITHIN GROUP (ORDER BY ttfb_ms) FILTER (WHERE status='ok') AS "p95Ms"
    FROM ${db.table("region_latency_samples")} WHERE page_url=ANY($1::text[]) AND region_key=ANY($2::text[]) AND measured_at >= $3::timestamptz AND measured_at < $4::timestamptz
    GROUP BY (measured_at AT TIME ZONE 'UTC')::date, region_key, page_path
    ORDER BY day DESC, region_key, page_path LIMIT 1000`, [urls, keys, since, until])
  const successful = latest.rows.filter(row => row.status === "ok" && row.ttfbMs !== null).map(row => row.ttfbMs!).sort((a, b) => a - b)
  const middle = Math.floor(successful.length / 2)
  const median = successful.length ? successful.length % 2 ? successful[middle] : (successful[middle - 1] + successful[middle]) / 2 : null
  const measuredAt = latest.rows.map(row => row.measuredAt).sort().at(-1) ?? null
  return {
    data: { source: new URL(context.config.siteUrl!).origin, paths: options.urls.map(url => url.pathname + url.search), unit: "ms", range: { since, until }, truncated: latest.rows.length > query.limit, totalMeasured: latest.rows.length, summary: { medianTtfbMs: median, responding: successful.length, regions: urls.length * keys.length, failed: latest.rows.filter(row => row.status === "error").length }, regions: latest.rows.slice(0, query.limit), history: history.rows },
    empty: latest.rows.length === 0, measuredAt,
  }
}
