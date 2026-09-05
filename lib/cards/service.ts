import { demoMode } from "../demo/mode"
import { demoDataset } from "../demo/dataset"
import { createHash } from "node:crypto"
import type { AtlasConfig, CardConfig } from "../config"
import { readCache, writeCache } from "../db/cache"
import { latestCollectorRun, type CollectorRun } from "../db/collectors"
import type { Database } from "../db/pool"
import type { CardContext, CardDefinition } from "./define"
import type { CardInfo, DatasetEnvelope, DatasetQuery, Json, MissingRequirement, RunSummary } from "./types"
import { executeCollection, type CollectionOutcome } from "../collectors/execute"

export interface CardServicesOptions {
  registry: ReadonlyMap<string, CardDefinition>
  config: AtlasConfig
  env: Readonly<Record<string, string | undefined>>
  database: () => Database
  fetch?: typeof globalThis.fetch
}
export interface AvailableCard extends CardInfo { enabled: boolean; missing: MissingRequirement[] }
export class CardNotFoundError extends Error {}
export function runSummary(run: CollectorRun | null): RunSummary | null {
  return run ? { id: run.id, status: run.status, startedAt: run.started_at.toISOString(), finishedAt: run.finished_at?.toISOString() ?? null, rowsWritten: run.rows_written, error: run.error } : null
}
export function cardContext(definition: CardDefinition, config: AtlasConfig, env: Readonly<Record<string, string | undefined>>): CardContext {
  const options: CardConfig = config.cards[definition.info.id] ?? { enabled: definition.info.defaultEnabled, optIn: false, options: {} }
  return { config, options, env }
}
export function missingRequirements(definition: CardDefinition, context: CardContext): MissingRequirement[] {
  const missing: MissingRequirement[] = []
  if (!context.env.DATABASE_URL) missing.push({ id: "database", reason: "Set DATABASE_URL and run pnpm run setup to store telemetry." })
  if (definition.info.requiresOptIn && !context.options.optIn) missing.push({ id: "opt-in", reason: `Explicitly opt in to ${definition.info.title} in atlas.config.ts before reading its sources.` })
  missing.push(...(definition.requirements?.(context) ?? []))
  return missing
}
export function targetKey(definition: CardDefinition, context: CardContext): string {
  const target = definition.targetKey?.(context) ?? context.config.siteUrl ?? context.config.repository ?? "default"
  if (!target || target.length > 2048) throw new Error("Collector target must contain 1–2048 characters.")
  return `target:${createHash("sha256").update(JSON.stringify({ target, options: context.options.options, siteUrl: context.config.siteUrl, repository: context.config.repository, repositoryPath: context.config.repositoryPath })).digest("hex")}`
}
export function emptyEnvelope(id: string): DatasetEnvelope {
  return { id, status: "empty", data: null, updatedAt: null, stale: false, run: null, cache: { hit: false, expiresAt: null } }
}
export function parseDatasetQuery(url: URL): DatasetQuery {
  const query: DatasetQuery = { limit: 1000 }
  for (const key of url.searchParams.keys()) if (!["since", "until", "limit"].includes(key)) throw new Error("Unknown dataset query parameter.")
  for (const key of ["since", "until", "limit"]) if (url.searchParams.getAll(key).length > 1) throw new Error("Dataset query parameters cannot be repeated.")
  for (const key of ["since", "until"] as const) {
    const value = url.searchParams.get(key)
    if (value !== null) {
      if (value.length > 32 || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Dataset dates must be valid ISO dates.")
      query[key] = new Date(value).toISOString()
    }
  }
  if (query.since && query.until && query.since >= query.until) throw new Error("Dataset since must precede until.")
  const limit = url.searchParams.get("limit")
  if (limit !== null) {
    if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 1000) throw new Error("Dataset limit must be 1–1000.")
    query.limit = Number(limit)
  }
  return query
}
export class CardServices {
  constructor(readonly dependencies: CardServicesOptions) {
    for (const id of Object.keys(dependencies.config.cards)) if (!dependencies.registry.has(id)) throw new Error(`Configured card is not registered: ${id}`)
  }
  private resolve(id: string) {
    const definition = this.dependencies.registry.get(id)
    if (!definition) throw new CardNotFoundError("Unknown card.")
    const context = cardContext(definition, this.dependencies.config, this.dependencies.env)
    return { definition, context }
  }
  list(): AvailableCard[] {
    return [...this.dependencies.registry.values()].map(definition => {
      const context = cardContext(definition, this.dependencies.config, this.dependencies.env)
      return { ...definition.info, enabled: context.options.enabled, missing: missingRequirements(definition, context) }
    })
  }
  async dataset(id: string, query: DatasetQuery = { limit: 1000 }): Promise<DatasetEnvelope> {
    const { definition, context } = this.resolve(id)
    const envelope = emptyEnvelope(id)
    if (!context.options.enabled) return { ...envelope, status: "disabled", reason: "This card is disabled in atlas.config.ts." }
    if (demoMode(this.dependencies.env)) return demoDataset(this.dependencies.database, id, query)
    const missing = missingRequirements(definition, context)
    if (missing.length) return { ...envelope, status: "missing-config", missing, reason: missing.map(item => item.reason).join(" ") }
    let cached: Awaited<ReturnType<typeof readCache<DatasetEnvelope>>> = null
    try {
      const db = this.dependencies.database()
      const target = targetKey(definition, context)
      const latest = await latestCollectorRun(db, id, target)
      const run = runSummary(latest)
      const latestSuccess = (await db.query<{ finished_at: Date }>(`SELECT finished_at FROM ${db.table("collector_runs")} WHERE collector_id = $1 AND target_key = $2 AND status = 'succeeded' ORDER BY finished_at DESC LIMIT 1`, [id, target])).rows[0]
      // Include success generation: a dataset read racing a successful collection
      // can only populate its old key after that collection invalidates the cache.
      const pushedVersion = await definition.cacheVersion?.({ ...context, db, query }) ?? null
      const cacheKey = `card:${id}:${createHash("sha256").update(JSON.stringify({ target, query, generation: latestSuccess?.finished_at.toISOString() ?? null, pushedVersion })).digest("hex")}`
      cached = await readCache<DatasetEnvelope>(db, cacheKey)
      const applyFreshness = (payload: DatasetEnvelope): DatasetEnvelope => {
        const updatedAt = payload.updatedAt ?? latestSuccess?.finished_at.toISOString() ?? null
        const stale = Boolean(updatedAt && Date.now() - Date.parse(updatedAt) > definition.info.freshnessSeconds * 1000) || latest?.status === "failed"
        return { ...payload, updatedAt, stale, run, ...(latest?.status === "failed" ? { error: latest.error ?? "The latest collection failed." } : {}) }
      }
      if (cached && !cached.stale) return applyFreshness({ ...cached.payload, cache: { hit: true, expiresAt: cached.expires_at.toISOString() } })
      const result = await definition.dataset({ ...context, db, query })
      const data = result.data
      // Match the JSON route boundary before putting values into persistent cache.
      const encoded = JSON.stringify(data)
      if (encoded === undefined || Buffer.byteLength(encoded) > 4_000_000) throw new Error("Dataset exceeded its JSON response budget.")
      if (result.measuredAt && !Number.isFinite(Date.parse(result.measuredAt))) throw new Error("Invalid dataset timestamp.")
      const payload = applyFreshness({ ...envelope, status: result.empty || data === null || (Array.isArray(data) && data.length === 0) ? "empty" : "ready", data: JSON.parse(encoded) as Json, updatedAt: result.measuredAt ?? null })
      if (payload.status === "empty") payload.reason = latest?.status === "failed" ? "No measurements are available; the latest collection failed." : result.reason?.slice(0, 500) ?? "No measurements yet. Run this card's collector to populate it."
      await writeCache(db, cacheKey, id, payload, context.config.cacheTtlSeconds)
      return { ...payload, cache: { hit: false, expiresAt: new Date(Date.now() + context.config.cacheTtlSeconds * 1000).toISOString() } }
    } catch {
      return { ...envelope, ...(cached ? { data: cached.payload.data, updatedAt: cached.payload.updatedAt, run: cached.payload.run, cache: { hit: true, expiresAt: cached.expires_at.toISOString() } } : {}), status: "error", stale: true, error: "The dataset could not be loaded. Check database setup and collector configuration." }
    }
  }
  async collect(id: string): Promise<CollectionOutcome> {
    const { definition, context } = this.resolve(id)
    return executeCollection({ definition, context, database: this.dependencies.database, fetch: this.dependencies.fetch })
  }
}
