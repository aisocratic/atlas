import type { DatasetContext, DatasetResult } from "../../lib/cards/define"
import type { TelemetryPresentation } from "../../lib/cards/presentation"
import { sitePaths } from "../../lib/collectors/http"
import { display, measured, timeRange } from "../../lib/collectors/dataset"
export async function dataset(context: DatasetContext): Promise<DatasetResult<TelemetryPresentation>> {
  const urls = sitePaths(context).map(url => url.href), [since, until] = timeRange(context)
  const rows = (await context.db.query(`SELECT a.*, (SELECT string_agg(f.message, ' ' ORDER BY f.rule_id) FROM ${context.db.table("seo_findings")} f WHERE f.audit_id=a.id) AS findings FROM ${context.db.table("seo_audits")} a WHERE page_url=ANY($1::text[]) AND measured_at >= $2 AND measured_at < $3 ORDER BY measured_at DESC LIMIT $4`, [urls, since, until, context.query.limit])).rows
  return { empty: !rows.length, measuredAt: measured(rows[0]?.measured_at), data: { source: new URL(urls[0]).origin, description: "Seven equally weighted HTTP/HTML checks. Score = passed checks ÷ 7 × 100; this is a local audit, not a search-engine ranking.", metrics: [{ label: "Latest audit score", value: display(rows[0]?.score, " / 100") }], columns: ["Measured", "Path", "Score", "Findings"], rows: rows.map(row => [measured(row.measured_at), row.page_path, display(row.score), row.findings ?? "All seven checks passed"]) } }
}
