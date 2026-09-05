import { CollectorError } from "./execute"
import type { CardContext, CollectionContext } from "../cards/define"
export function assertOptions(context: CardContext, allowed: string[]) { if (Object.keys(context.options.options).some(key => !allowed.includes(key))) throw new CollectorError("This card has an unknown option. Check the documented card settings.") }

export function providerEndpoint(value: string | undefined, fallback: string): URL {
  const url = new URL(value ?? fallback)
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:")) || url.username || url.password || url.search || url.hash) throw new CollectorError("Provider endpoint must use HTTPS (HTTP is allowed only for loopback tests).")
  return url
}
export function sitePaths(context: CardContext, maximum = 5): URL[] {
  if (!context.config.siteUrl) throw new CollectorError("Set ATLAS_SITE_URL before collecting this card.")
  const site = new URL(context.config.siteUrl)
  const paths = context.options.options.paths ?? [site.pathname + site.search]
  if (!Array.isArray(paths) || !paths.length || paths.length > maximum || paths.some(path => typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.length > 1024)) throw new CollectorError(`Configure 1–${maximum} same-site paths.`)
  return [...new Set(paths)].map(path => {
    const url = new URL(path as string, site)
    if (url.origin !== site.origin || url.hash || url.username || url.password) throw new CollectorError("Only configured same-origin paths are allowed.")
    return url
  })
}
export async function boundedText(response: Response, maximum = 2_000_000): Promise<string> {
  if (Number(response.headers.get("content-length")) > maximum) throw new CollectorError("Provider response exceeded the size limit.")
  if (!response.body) return ""
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break
      length += next.value.byteLength
      if (length > maximum) throw new CollectorError("Provider response exceeded the size limit.")
      chunks.push(next.value)
    }
  } finally { await reader.cancel().catch(() => undefined) }
  return Buffer.concat(chunks).toString("utf8")
}
export async function requestText(context: Pick<CollectionContext, "fetch" | "signal">, url: URL, options: { headers?: Record<string, string>; sameOriginRedirects?: boolean; timeoutMs?: number; maximum?: number; allowHttpErrors?: boolean } = {}) {
  const signal = AbortSignal.any([context.signal, AbortSignal.timeout(options.timeoutMs ?? 20_000)])
  let target = url
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await context.fetch(target, { headers: options.headers, signal, redirect: "manual" })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        const location = response.headers.get("location")
        if (!options.sameOriginRedirects || !location || redirects === 3) throw new CollectorError("Provider redirect was not accepted.")
        const next = new URL(location, target)
        if (next.origin !== url.origin || next.username || next.password) throw new CollectorError("Cross-origin redirects are not allowed.")
        target = next; continue
      }
      if (!options.allowHttpErrors && !response.ok) {
        await response.body?.cancel()
        throw new CollectorError(response.status === 429 || response.status === 403 ? "Provider rate limit or access restriction; try later or configure credentials." : "Provider request failed.")
      }
      return { response, text: await boundedText(response, options.maximum), url: target }
    }
  } catch (error) {
    if (error instanceof CollectorError) throw error
    throw new CollectorError(signal.aborted ? "Provider request exceeded its deadline or was cancelled." : "Provider request could not be completed.")
  }
  throw new CollectorError("Provider redirect limit exceeded.")
}
export async function requestJson(context: Pick<CollectionContext, "fetch" | "signal">, url: URL, options?: Parameters<typeof requestText>[2]): Promise<unknown> {
  const result = await requestText(context, url, options)
  try { return JSON.parse(result.text) } catch { throw new CollectorError("Provider returned invalid JSON.") }
}
export function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {} }
export function numeric(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined }
export function textValue(value: unknown, maximum = 500): string | undefined { return typeof value === "string" ? value.slice(0, maximum) : undefined }
