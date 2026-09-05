import type { DatasetContext, DatasetResult } from "../../lib/cards/define"
import type { TelemetryPresentation } from "../../lib/cards/presentation"
import { sitePaths } from "../../lib/collectors/http"
import { display, measured, timeRange } from "../../lib/collectors/dataset"
import { strategy } from "./collector"
export async function dataset(context: DatasetContext): Promise<DatasetResult<TelemetryPresentation>> {
  const urls = sitePaths(context).map(url => url.href), selected = strategy(context), [since, until] = timeRange(context)
  const rows = (await context.db.query(`SELECT * FROM ${context.db.table("lighthouse_reports")} WHERE page_url=ANY($1::text[]) AND strategy=$2 AND measured_at >= $3 AND measured_at < $4 ORDER BY measured_at DESC LIMIT $5`, [urls, selected, since, until, context.query.limit])).rows
  const latest = rows[0]
  return { empty: !latest, measuredAt: measured(latest?.measured_at), data: { source: new URL(urls[0]).origin, description: `${selected} Lighthouse laboratory measurements. TBT measures lab blocking; field INP belongs to Real users.`, metrics: [{ label: "Performance", value: display(latest?.performance_score, " / 100") }, { label: "Lab LCP", value: display(latest?.lcp_ms, " ms") }, { label: "Lab CLS", value: display(latest?.cls) }, { label: "Lab TBT", value: display(latest?.tbt_ms, " ms") }], columns: ["Measured", "Path", "Performance", "Accessibility", "SEO"], rows: rows.map(row => [measured(row.measured_at), row.page_path, row.performance_score, row.accessibility_score, row.seo_score]) } }
}
