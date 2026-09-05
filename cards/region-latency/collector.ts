import type { CardContext, CollectionContext, CollectionBatch } from "../../lib/cards/define"
import type { MissingRequirement } from "../../lib/cards/types"
import { CollectorError } from "../../lib/collectors/execute"
import { insertTelemetry } from "../../lib/db/telemetry"
import { regionOptions } from "./options"
import { measureRegion } from "./provider"

export function requirements(context: CardContext): MissingRequirement[] {
  try { regionOptions(context); return [] } catch (error) { return [{ id: "region-configuration", reason: error instanceof CollectorError ? error.message : "Check the region latency configuration." }] }
}
export async function collect(context: CollectionContext): Promise<CollectionBatch> {
  const options = regionOptions(context)
  const jobs = options.urls.flatMap(url => options.regions.map(region => ({ url, region })))
  const results: Awaited<ReturnType<typeof measureRegion>>[] = new Array(jobs.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, async () => {
    for (;;) {
      context.signal.throwIfAborted()
      const index = next++
      if (index >= jobs.length) return
      results[index] = await measureRegion(context, options, jobs[index].url, jobs[index].region)
    }
  }))
  if (!results.some(result => result.completed)) throw new CollectorError(results[0]?.sample.error ?? "No Globalping measurements completed.")
  return { publish: async tx => {
    // Serialize refreshes across config keys and lock in URL order to avoid
    // deadlocks for overlapping path sets. Publication remains lease-fenced.
    for (const url of options.urls.map(url => url.href).sort()) await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", ["atlas/region-latency", url])
    for (const { sample } of results) await insertTelemetry(tx, "region_latency_samples", { ...sample, provider: "globalping", run_id: context.runId })
    const groups = new Map(results.map(({ sample }) => [`${sample.page_url}\n${sample.measured_at.slice(0, 10)}`, { url: sample.page_url, day: sample.measured_at.slice(0, 10) }]))
    for (const { url, day } of groups.values()) {
      await tx.query(`INSERT INTO ${tx.table("region_latency_daily")} (page_url, day, region_key, page_path, samples, ok_samples, error_samples, ttfb_p50_ms, ttfb_p95_ms, load_p50_ms, load_p95_ms)
        SELECT page_url, (measured_at AT TIME ZONE 'UTC')::date, region_key, page_path, count(*)::integer, count(*) FILTER (WHERE status='ok')::integer, count(*) FILTER (WHERE status='error')::integer,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY ttfb_ms) FILTER (WHERE status='ok'), percentile_cont(0.95) WITHIN GROUP (ORDER BY ttfb_ms) FILTER (WHERE status='ok'),
          percentile_cont(0.5) WITHIN GROUP (ORDER BY load_ms) FILTER (WHERE status='ok'), percentile_cont(0.95) WITHIN GROUP (ORDER BY load_ms) FILTER (WHERE status='ok')
        FROM ${tx.table("region_latency_samples")} WHERE page_url=$1 AND measured_at >= ($2::date::timestamp AT TIME ZONE 'UTC') AND measured_at < (($2::date + 1)::timestamp AT TIME ZONE 'UTC')
        GROUP BY page_url, (measured_at AT TIME ZONE 'UTC')::date, region_key, page_path
        ON CONFLICT (page_url, day, region_key, page_path) DO UPDATE SET samples=EXCLUDED.samples, ok_samples=EXCLUDED.ok_samples, error_samples=EXCLUDED.error_samples, ttfb_p50_ms=EXCLUDED.ttfb_p50_ms, ttfb_p95_ms=EXCLUDED.ttfb_p95_ms, load_p50_ms=EXCLUDED.load_p50_ms, load_p95_ms=EXCLUDED.load_p95_ms, updated_at=now()`, [url, day])
    }
    return { rowsWritten: results.length }
  } }
}
export const collector = { timeoutMs: 120_000, collect }
