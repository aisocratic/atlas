import type { DatasetContext, DatasetResult } from "../../lib/cards/define"
import type { TelemetryPresentation } from "../../lib/cards/presentation"
import { timeRange, measured } from "../../lib/collectors/dataset"
import { sourceOrigin } from "../../lib/ingest/service"
export async function dataset(context: DatasetContext): Promise<DatasetResult<TelemetryPresentation>> {
  const [since, until] = timeRange(context), origin = sourceOrigin(context.config), args = [origin, since, until]
  const rows = (await context.db.query(`SELECT message, level, count(*)::int AS count, max(occurred_at) AS latest FROM ${context.db.table("error_logs")} WHERE source_origin=$1 AND occurred_at >= $2 AND occurred_at < $3 GROUP BY message,level ORDER BY count DESC,latest DESC LIMIT $4`, [...args, context.query.limit])).rows
  const summary = (await context.db.query(`SELECT count(*) FILTER (WHERE level='error')::int AS errors, count(*) FILTER (WHERE level='warn')::int AS warnings, max(occurred_at) AS latest FROM ${context.db.table("error_logs")} WHERE source_origin=$1 AND occurred_at >= $2 AND occurred_at < $3`, args)).rows[0]
  return { empty: !rows.length, reason: "No server error events in this time range. Configure the server-side sender to report events.", measuredAt: measured(summary.latest), data: { source: origin, description: "Deduplicated server error and warning events. No request denominator is supplied, so no error rate is inferred.", metrics: [{ label: "Errors", value: String(summary.errors) }, { label: "Warnings", value: String(summary.warnings) }], columns: ["Level", "Message", "Count", "Latest"], rows: rows.map(row => [row.level, row.message, row.count, measured(row.latest)]) } }
}
