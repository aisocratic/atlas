import type { CardContext, CollectionContext } from "../../lib/cards/define"
import { providerEndpoint, record, requestJson, textValue } from "../../lib/collectors/http"
import { CollectorError } from "../../lib/collectors/execute"
import { insertTelemetry, type TelemetryInputs } from "../../lib/db/telemetry"
export function requirements(context: CardContext) { return context.config.repository ? [] : [{ id: "repository", reason: "Set ATLAS_REPOSITORY to owner/name for published GitHub releases." }] }
export const collector = { async collect(context: CollectionContext) {
  const repository = context.config.repository!, releases: TelemetryInputs["releases"][] = []
  const base = providerEndpoint(context.env.GITHUB_API_URL, "https://api.github.com/")
  for (let page = 1; page <= 3; page++) {
    const endpoint = new URL(`repos/${repository}/releases`, base.href.endsWith("/") ? base : `${base.href}/`)
    endpoint.searchParams.set("per_page", "30"); endpoint.searchParams.set("page", String(page))
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Atlas-Telemetry" }
    if (context.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${context.env.GITHUB_TOKEN}`
    const result = await requestJson(context, endpoint, { headers })
    if (!Array.isArray(result) || result.length > 30) throw new CollectorError("GitHub returned an invalid releases page.")
    for (const value of result) {
      const row = record(value)
      if (row.draft === true || !row.published_at) continue
      if (typeof row.tag_name !== "string" || !row.tag_name || !Number.isFinite(Date.parse(String(row.published_at))) || typeof row.prerelease !== "boolean") throw new CollectorError("GitHub returned an invalid published release.")
      const href = typeof row.html_url === "string" && row.html_url.startsWith(`https://github.com/${repository}/releases/`) ? row.html_url : undefined
      releases.push({ run_id: context.runId, repository, provider_id: String(row.id), tag: row.tag_name.slice(0, 200), title: textValue(row.name, 300), summary: textValue(row.body, 2000), github_url: href, published_at: String(row.published_at), prerelease: row.prerelease, target_sha: textValue(row.target_commitish, 200) })
    }
    if (result.length < 30) break
  }
  return { async publish(tx: Parameters<typeof insertTelemetry>[0]) { for (const release of releases) await insertTelemetry(tx, "releases", release, { upsert: true }); return { rowsWritten: releases.length } } }
} }
