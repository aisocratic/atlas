/** Client-safe contracts: no configuration, database, collector or secret imports. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export interface CardInfo {
  id: string
  title: string
  category: string
  description: string
  defaultLayout: { width: number; height: number }
  defaultEnabled: boolean
  requiresOptIn?: boolean
  freshnessSeconds: number
}
export interface MissingRequirement { id: string; reason: string }
export interface RunSummary {
  id: string
  status: "running" | "succeeded" | "failed"
  startedAt: string
  finishedAt: string | null
  rowsWritten: number
  error: string | null
}
export interface DatasetEnvelope<T = Json> {
  provenance?: "synthetic"
  id: string
  status: "ready" | "empty" | "missing-config" | "error" | "disabled"
  data: T | null
  updatedAt: string | null
  stale: boolean
  reason?: string
  error?: string
  missing?: MissingRequirement[]
  run: RunSummary | null
  cache: { hit: boolean; expiresAt: string | null }
}
export interface CardProps<T = Json> { dataset: DatasetEnvelope<T> }
export interface DatasetQuery { since?: string; until?: string; limit: number }
