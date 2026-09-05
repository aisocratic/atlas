import type { Json } from "./cards/types"

export interface CardConfig { enabled: boolean; optIn: boolean; options: Record<string, Json> }
export interface AtlasConfig {
  siteUrl?: string
  repository?: string
  repositoryPath?: string
  cacheTtlSeconds: number
  collectorTimeoutMs: number
  cards: Record<string, CardConfig>
}
export interface AtlasConfigInput {
  siteUrl?: string
  repository?: string
  repositoryPath?: string
  cacheTtlSeconds?: number
  collectorTimeoutMs?: number
  cards?: Record<string, boolean | { enabled?: boolean; optIn?: boolean; options?: Record<string, Json> }>
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object.`)
  return value as Record<string, unknown>
}
function keys(value: Record<string, unknown>, allowed: string[], name: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${name} contains an unknown setting.`)
}
function positive(value: unknown, fallback: number, maximum: number, name: string): number {
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${name} must be an integer from 1 to ${maximum}.`)
  return value
}
function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === "") return undefined
  if (typeof value !== "string" || value.length > 2048 || !value.trim()) throw new Error(`${name} must be a nonempty string.`)
  return value.trim()
}
export function defineConfig(input: AtlasConfigInput): AtlasConfigInput { return input }
export function resolveConfig(input: unknown, env: Readonly<Record<string, string | undefined>> = process.env): AtlasConfig {
  const raw = object(input, "Atlas config")
  keys(raw, ["siteUrl", "repository", "repositoryPath", "cacheTtlSeconds", "collectorTimeoutMs", "cards"], "Atlas config")
  const siteUrl = optionalString(env.ATLAS_SITE_URL ?? raw.siteUrl, "siteUrl")
  if (siteUrl) {
    let url: URL
    try { url = new URL(siteUrl) } catch { throw new Error("siteUrl must be an absolute HTTP(S) URL.") }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("siteUrl must be HTTP(S), without credentials or a fragment.")
  }
  const repository = optionalString(env.ATLAS_REPOSITORY ?? raw.repository, "repository")
  if (repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error("repository must use owner/name syntax.")
  const cards: Record<string, CardConfig> = Object.create(null)
  for (const [id, setting] of Object.entries(raw.cards === undefined ? {} : object(raw.cards, "cards"))) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new Error("Invalid card configuration ID.")
    const card = typeof setting === "boolean" ? { enabled: setting } : object(setting, "Card config")
    keys(card, ["enabled", "optIn", "options"], "Card config")
    if (card.enabled !== undefined && typeof card.enabled !== "boolean") throw new Error("Card enabled must be boolean.")
    if (card.optIn !== undefined && typeof card.optIn !== "boolean") throw new Error("Card optIn must be boolean.")
    const options = card.options === undefined ? {} : object(card.options, "Card options")
    const serialized = JSON.stringify(options)
    if (serialized.length > 64_000 || JSON.parse(serialized) === null) throw new Error("Card options must be bounded JSON.")
    // Reject functions/undefined/nonfinite numbers instead of silently dropping them.
    const validateJson = (value: unknown): boolean => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (Array.isArray(value) && value.every(validateJson)) || (typeof value === "object" && value !== null && Object.values(value).every(validateJson))
    if (!validateJson(options)) throw new Error("Card options must contain only JSON values.")
    cards[id] = { enabled: card.enabled ?? true, optIn: card.optIn ?? false, options: JSON.parse(serialized) }
  }
  return {
    siteUrl, repository, repositoryPath: optionalString(env.ATLAS_REPOSITORY_PATH ?? raw.repositoryPath, "repositoryPath"),
    cacheTtlSeconds: positive(raw.cacheTtlSeconds, 60, 604800, "cacheTtlSeconds"),
    collectorTimeoutMs: positive(raw.collectorTimeoutMs, 120_000, 900_000, "collectorTimeoutMs"),
    cards,
  }
}
