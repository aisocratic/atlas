import type { AtlasConfig, CardConfig } from "../config"
import type { Queryable } from "../db/pool"
import type { CardInfo, DatasetQuery, Json, MissingRequirement } from "./types"

export interface CardContext {
  config: AtlasConfig
  options: CardConfig
  env: Readonly<Record<string, string | undefined>>
}
export interface DatasetContext extends CardContext { db: Queryable; query: DatasetQuery }
export interface CollectionContext extends CardContext { signal: AbortSignal; runId: string; fetch: typeof globalThis.fetch }
export interface DatasetResult<T extends Json = Json> { data: T | null; measuredAt?: string | null; empty?: boolean; reason?: string }
/** Collect first; publish only inside the execution layer's fenced transaction. */
export interface CollectionBatch { publish(tx: Queryable): Promise<{ rowsWritten: number }> }
export interface CardDefinition<T extends Json = Json> {
  info: CardInfo
  requirements?(context: CardContext): MissingRequirement[]
  targetKey?(context: CardContext): string
  cacheVersion?(context: DatasetContext): Promise<string>
  dataset(context: DatasetContext): Promise<DatasetResult<T>>
  collector?: { timeoutMs?: number; collect(context: CollectionContext): Promise<CollectionBatch> }
}
export function defineCard<T extends Json>(definition: CardDefinition<T>): CardDefinition<T> {
  const { info } = definition
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(info.id)) throw new Error("Card IDs must be lowercase kebab-case (1–64 characters).")
  if (!info.title.trim() || !info.category.trim() || !info.description.trim()) throw new Error("Card title, category and description are required.")
  if (!Number.isInteger(info.defaultLayout.width) || info.defaultLayout.width < 1 || info.defaultLayout.width > 12 || !Number.isInteger(info.defaultLayout.height) || info.defaultLayout.height < 1 || info.defaultLayout.height > 12) throw new Error("Card layout dimensions must be integers from 1 to 12.")
  if (!Number.isFinite(info.freshnessSeconds) || info.freshnessSeconds < 1 || info.freshnessSeconds > 604800) throw new Error("Card freshness must be 1 second to 7 days.")
  if (definition.collector?.timeoutMs !== undefined && (!Number.isInteger(definition.collector.timeoutMs) || definition.collector.timeoutMs < 1 || definition.collector.timeoutMs > 900_000)) throw new Error("Collector timeout must be 1–900000 milliseconds.")
  return definition
}
export function createRegistry(definitions: readonly CardDefinition[]): ReadonlyMap<string, CardDefinition> {
  const registry = new Map<string, CardDefinition>()
  for (const definition of definitions) {
    defineCard(definition)
    if (registry.has(definition.info.id)) throw new Error(`Duplicate card ID: ${definition.info.id}`)
    registry.set(definition.info.id, definition)
  }
  return registry
}
