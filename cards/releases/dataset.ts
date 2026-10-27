import type { DatasetContext, DatasetResult } from "../../lib/cards/define"
import type { TelemetryPresentation } from "../../lib/cards/presentation"
import type { ReleaseRecord } from "../../lib/charts/release-lanes"
import { measured, timeRange } from "../../lib/collectors/dataset"
export type ReleasesPresentation = TelemetryPresentation & { releases?: ReleaseRecord[] }
/** The timeline reaches back a year from the end of the range, so a line that began before it still shows whole. */
const TIMELINE_DAYS = 365
export async function dataset(context: DatasetContext): Promise<DatasetResult<ReleasesPresentation>> {
  const [since, until] = timeRange(context), rows = (await context.db.query(`SELECT * FROM ${context.db.table("releases")} WHERE repository=$1 AND published_at >= $2 AND published_at < $3 ORDER BY published_at DESC LIMIT $4`, [context.config.repository, since, until, context.query.limit])).rows
  const history = (await context.db.query(`SELECT tag, published_at, prerelease FROM ${context.db.table("releases")} WHERE repository=$1 AND published_at >= $2 AND published_at < $3 ORDER BY published_at DESC LIMIT 500`, [context.config.repository, new Date(Date.parse(until) - TIMELINE_DAYS * 86400_000).toISOString(), until])).rows
  const total = (await context.db.query(`SELECT count(*)::int AS count FROM ${context.db.table("releases")} WHERE repository=$1 AND published_at >= $2 AND published_at < $3`, [context.config.repository, since, until])).rows[0].count
  return { empty: !rows.length, measuredAt: measured(rows[0]?.collected_at), data: { source: context.config.repository!, description: `Published GitHub releases, including explicitly marked prereleases. Showing ${rows.length} of ${total} stored releases in range; up to 90 provider records per collection. These are not deployment events. The timeline shows release lines published in the 12 months to the end of the range.`, metrics: [{ label: "Published in range", value: String(total) }], columns: ["Published", "Tag", "Title", "Channel"], rows: rows.map(row => [measured(row.published_at), row.tag, row.title ?? row.tag, row.prerelease ? "Prerelease" : "Stable"]), links: rows.filter(row => row.github_url).slice(0, 10).map(row => ({ label: row.tag, href: row.github_url })), releases: history.map(row => ({ tag: row.tag, publishedAt: measured(row.published_at)!, prerelease: row.prerelease })) } }
}
