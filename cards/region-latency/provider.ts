import { setTimeout as delay } from "node:timers/promises"
import type { CollectionContext } from "../../lib/cards/define"
import { CollectorError } from "../../lib/collectors/execute"
import type { Region, RegionOptions } from "./options"

export type LatencySample = {
  region_key: string; region_label: string; probe_country?: string; probe_city?: string
  page_path: string; page_url: string; measured_at: string; measurement_id?: string
  status: "ok" | "error"; status_code?: number; error?: string
  dns_ms?: number; connect_ms?: number; tls_ms?: number; ttfb_ms?: number; load_ms?: number
}
type ProviderOptions = { pollIntervalMs?: number; measurementTimeoutMs?: number; requestTimeoutMs?: number }
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const timing = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 3_600_000 ? value : undefined
const text = (value: unknown, limit: number): string | undefined => typeof value === "string" ? value.slice(0, limit) : undefined

export function measurementRequest(url: URL, region: Region, protocol: RegionOptions["protocol"]) {
  return {
    type: "http", target: url.hostname.replace(/^\[|\]$/g, ""), timeout: 10,
    locations: [{ country: region.country, ...(region.city ? { city: region.city } : {}), limit: 1 }],
    measurementOptions: { protocol, port: Number(url.port || (url.protocol === "https:" ? 443 : 80)), request: { method: "HEAD", path: url.pathname, ...(url.search ? { query: url.search.slice(1) } : {}) } },
  }
}
export function normalizeMeasurement(payload: unknown, url: URL, region: Region, measurementId: string): LatencySample {
  const response = record(payload)
  const base: LatencySample = { region_key: region.key, region_label: region.label, page_path: url.pathname + url.search, page_url: url.href, measured_at: new Date().toISOString(), measurement_id: measurementId, status: "error" }
  if (typeof response.createdAt === "string" && Number.isFinite(Date.parse(response.createdAt))) base.measured_at = new Date(response.createdAt).toISOString()
  if (response.status !== "finished" || response.type !== "http" || response.target !== url.hostname.replace(/^\[|\]$/g, "")) return { ...base, error: "Globalping returned an unexpected measurement." }
  if (!Array.isArray(response.results) || response.results.length !== 1) return { ...base, error: "No single probe result was available in this region." }
  const item = record(response.results[0]), probe = record(item.probe), result = record(item.result)
  base.probe_country = text(probe.country, 2); base.probe_city = text(probe.city, 80)
  if (base.probe_country !== region.country) return { ...base, error: "The returned probe was outside the requested country." }
  if (result.status !== "finished") return { ...base, error: result.status === "offline" ? "The probe was offline." : "The probe could not complete the HTTP request." }
  const times = record(result.timings)
  const dns = timing(times.dns), tcp = timing(times.tcp), tls = timing(times.tls), wait = timing(times.firstByte)
  base.dns_ms = dns; base.connect_ms = tcp; base.tls_ms = tls; base.load_ms = timing(times.total)
  const status = typeof result.statusCode === "number" && Number.isInteger(result.statusCode) && result.statusCode >= 100 && result.statusCode <= 599 ? result.statusCode : undefined
  base.status_code = status
  // firstByte is post-connection wait. Preserve null phases; HTTP has no TLS.
  if (dns !== undefined && tcp !== undefined && wait !== undefined && (url.protocol === "http:" || tls !== undefined)) base.ttfb_ms = dns + tcp + (url.protocol === "https:" ? tls! : 0) + wait
  if (status === undefined) return { ...base, error: "The probe returned no HTTP status." }
  if (status >= 400) return { ...base, error: `HTTP ${status} response.` }
  if (base.ttfb_ms === undefined) return { ...base, error: "Complete TTFB timings were unavailable." }
  return { ...base, status: "ok" }
}
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new CollectorError("Globalping returned an empty response.")
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > 256_000) throw new CollectorError("Globalping returned an oversized response.")
      chunks.push(next.value)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) } catch { throw new CollectorError("Globalping returned invalid JSON.") }
  } finally { void reader.cancel().catch(() => {}) }
}
export async function measureRegion(context: CollectionContext, options: RegionOptions, url: URL, region: Region, tuning: ProviderOptions = {}): Promise<{ sample: LatencySample; completed: boolean }> {
  const signal = AbortSignal.any([context.signal, AbortSignal.timeout(tuning.measurementTimeoutMs ?? 45_000)])
  const sample: LatencySample = { region_key: region.key, region_label: region.label, page_path: url.pathname + url.search, page_url: url.href, measured_at: new Date().toISOString(), status: "error" }
  const headers = { "Content-Type": "application/json", ...(context.env.GLOBALPING_TOKEN ? { Authorization: `Bearer ${context.env.GLOBALPING_TOKEN}` } : {}) }
  const request = async (path: string, init: RequestInit) => {
    const response = await context.fetch(new URL(path, options.apiBase), { ...init, headers, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(tuning.requestTimeoutMs ?? 10_000)]) })
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      if (response.status === 429) throw new CollectorError("Globalping rate limit reached. Retry collection later.")
      if (response.status === 401 || response.status === 403) throw new CollectorError("Globalping rejected the configured credentials.")
      if (response.status === 422) throw new CollectorError("Globalping could not schedule a probe for this target or region.")
      throw new CollectorError(`Globalping request failed (HTTP ${response.status}).`)
    }
    return boundedJson(response)
  }
  try {
    const created = record(await request("measurements", { method: "POST", body: JSON.stringify(measurementRequest(url, region, options.protocol)) }))
    if (typeof created.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(created.id)) throw new CollectorError("Globalping returned an invalid measurement ID.")
    sample.measurement_id = created.id
    for (let poll = 0; poll < 60; poll++) {
      signal.throwIfAborted()
      const result = record(await request(`measurements/${created.id}`, { method: "GET" }))
      if (result.id !== created.id) throw new CollectorError("Globalping returned an unexpected measurement ID.")
      if (result.status === "finished") {
        if (result.type !== "http" || result.target !== url.hostname.replace(/^\[|\]$/g, "")) throw new CollectorError("Globalping returned a mismatched measurement target or type.")
        return { sample: normalizeMeasurement(result, url, region, created.id), completed: true }
      }
      if (result.status !== "in-progress") throw new CollectorError("Globalping returned an unknown measurement status.")
      await delay(tuning.pollIntervalMs ?? 1000, undefined, { signal })
    }
    throw new CollectorError("Globalping polling limit reached before completion.")
  } catch (error) {
    context.signal.throwIfAborted()
    return { sample: { ...sample, error: signal.aborted ? "Globalping measurement timed out." : error instanceof CollectorError ? error.message : "Globalping could not be reached." }, completed: false }
  }
}
