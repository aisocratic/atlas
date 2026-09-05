import type { DatasetContext, DatasetResult } from "../../lib/cards/define"
import type { TelemetryPresentation } from "../../lib/cards/presentation"
import { measured, timeRange } from "../../lib/collectors/dataset"
export async function dataset(context: DatasetContext): Promise<DatasetResult<TelemetryPresentation>> {
  const [since, until] = timeRange(context), rows = (await context.db.query(`SELECT * FROM ${context.db.table("releases")} WHERE repository=$1 AND published_at >= $2 AND published_at < $3 ORDER BY published_at DESC LIMIT $4`, [context.config.repository, since, until, context.query.limit])).rows
  const total = (await context.db.query(`SELECT count(*)::int AS count FROM ${context.db.table("releases")} WHERE repository=$1 AND published_at >= $2 AND published_at < $3`, [context.config.repository, since, until])).rows[0].count
  return { empty: !rows.length, measuredAt: measured(rows[0]?.collected_at), data: { source: context.config.repository!, description: `Published GitHub releases, including explicitly marked prereleases. Showing ${rows.length} of ${total} stored releases in range; up to 90 provider records per collection. These are not deployment events.`, metrics: [{ label: "Published in range", value: String(total) }], columns: ["Published", "Tag", "Title", "Channel"], rows: rows.map(row => [measured(row.published_at), row.tag, row.title ?? row.tag, row.prerelease ? "Prerelease" : "Stable"]), links: rows.filter(row => row.github_url).slice(0, 10).map(row => ({ label: row.tag, href: row.github_url })) } }
}
