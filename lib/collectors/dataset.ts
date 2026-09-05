import type { DatasetContext } from "../cards/define"
export function timeRange(context: DatasetContext) {
  return [context.query.since ?? new Date(Date.now() - 30 * 86400_000).toISOString(), context.query.until ?? new Date().toISOString()] as const
}
export function display(value: unknown, unit = ""): string { return value === null || value === undefined ? "Unknown" : typeof value === "string" && /^\d+$/.test(value) ? `${BigInt(value).toLocaleString("en-US")}${unit}` : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit}` }
export function measured(value: unknown): string | null { return value instanceof Date ? value.toISOString() : typeof value === "string" ? value : null }
