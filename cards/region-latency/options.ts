import type { CardContext } from "../../lib/cards/define"
import { CollectorError } from "../../lib/collectors/execute"

export type Region = { key: string; label: string; country: string; city?: string }
export const defaultRegions: Region[] = [
  { key: "us", label: "United States", country: "US" },
  { key: "ca", label: "Canada", country: "CA" },
  { key: "br", label: "Brazil", country: "BR" },
  { key: "gb", label: "United Kingdom", country: "GB" },
  { key: "de", label: "Germany", country: "DE" },
  { key: "fr", label: "France", country: "FR" },
  { key: "za", label: "South Africa", country: "ZA" },
  { key: "ae", label: "United Arab Emirates", country: "AE" },
  { key: "in", label: "India", country: "IN" },
  { key: "sg", label: "Singapore", country: "SG" },
  { key: "jp", label: "Japan", country: "JP" },
  { key: "au", label: "Australia", country: "AU" },
]
export type RegionOptions = { urls: URL[]; regions: Region[]; protocol: "HTTP" | "HTTPS" | "HTTP2"; apiBase: URL }
export function regionOptions(context: CardContext): RegionOptions {
  if (!context.config.siteUrl) throw new CollectorError("Set ATLAS_SITE_URL or siteUrl to measure your site.")
  const site = new URL(context.config.siteUrl), options = context.options.options
  if (Object.keys(options).some(key => !["paths", "regions", "protocol"].includes(key))) throw new CollectorError("Region latency options support paths, regions, and protocol.")
  const paths = options.paths ?? [site.pathname + site.search]
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 3 || paths.some(path => typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || path.length > 2048 || path.includes("#"))) throw new CollectorError("Region latency paths must contain 1–3 same-site paths beginning with a single slash.")
  const urls = [...new Set(paths as string[])].map(path => new URL(path, site.origin))
  if (urls.some(url => url.origin !== site.origin)) throw new CollectorError("Region latency paths must stay on the configured site.")
  const values = options.regions ?? defaultRegions
  if (!Array.isArray(values) || values.length < 1 || values.length > 12) throw new CollectorError("Configure between 1 and 12 probe regions.")
  const regions = values.map(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new CollectorError("Each region needs key, label, country, and optional city.")
    const region = value as Record<string, unknown>
    if (Object.keys(region).some(key => !["key", "label", "country", "city"].includes(key)) || typeof region.key !== "string" || !/^[a-z0-9-]{1,40}$/.test(region.key) || typeof region.label !== "string" || !region.label.trim() || region.label.length > 80 || typeof region.country !== "string" || !/^[A-Z]{2}$/.test(region.country) || (region.city !== undefined && (typeof region.city !== "string" || !region.city.trim() || region.city.length > 80))) throw new CollectorError("Region keys, labels, ISO country codes, and optional city names must be valid.")
    return { key: region.key, label: region.label, country: region.country, ...(region.city ? { city: region.city as string } : {}) }
  })
  if (new Set(regions.map(region => region.key)).size !== regions.length) throw new CollectorError("Region keys must be unique.")
  const protocol = options.protocol ?? (site.protocol === "https:" ? "HTTPS" : "HTTP")
  if (!["HTTP", "HTTPS", "HTTP2"].includes(protocol as string) || (site.protocol === "http:") !== (protocol === "HTTP")) throw new CollectorError("Use HTTP for http sites, or HTTPS/HTTP2 for https sites.")
  let apiBase: URL
  try { apiBase = new URL(context.env.GLOBALPING_API_URL ?? "https://api.globalping.io/v1/") } catch { throw new CollectorError("GLOBALPING_API_URL must be an absolute HTTP(S) endpoint.") }
  if (!["http:", "https:"].includes(apiBase.protocol) || apiBase.username || apiBase.password || apiBase.search || apiBase.hash) throw new CollectorError("GLOBALPING_API_URL must be HTTP(S), without credentials, query, or fragment.")
  if (apiBase.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(apiBase.hostname)) throw new CollectorError("GLOBALPING_API_URL must use HTTPS except for a loopback test server.")
  if (!apiBase.pathname.endsWith("/")) apiBase.pathname += "/"
  return { urls, regions, protocol: protocol as RegionOptions["protocol"], apiBase }
}
