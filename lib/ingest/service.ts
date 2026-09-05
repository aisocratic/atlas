import { demoMode } from "../demo/mode"
import { createHash, timingSafeEqual } from "node:crypto"
import type { AtlasConfig } from "../config"
import type { Database, Queryable } from "../db/pool"
import { invalidateCache } from "../db/cache"
import { insertTelemetry, type TelemetryInputs } from "../db/telemetry"
import type { DatasetContext } from "../cards/define"

type Env = Readonly<Record<string, string | undefined>>
export type IngestKind = "vitals" | "page-views" | "errors"
class IngestError extends Error { constructor(readonly status: number, message: string) { super(message) } }
const hash = (value: string) => createHash("sha256").update(value).digest("hex")
function equal(value: string | undefined, expected: string | undefined, minimum: number) { return Boolean(expected && expected.length >= minimum && value && value.length <= 1024 && timingSafeEqual(Buffer.from(hash(value)), Buffer.from(hash(expected)))) }
export function writeCredentialConfigured(env: Env, kind: "browser" | "server") {
  const name = kind === "browser" ? "ATLAS_RUM_WRITE_KEY" : "ATLAS_ERRORS_WRITE_TOKEN", value = env[name]
  return Boolean(value && value.length >= (kind === "browser" ? 16 : 32) && value.length <= 1024 && ["ATLAS_RUM_WRITE_KEY", "ATLAS_ERRORS_WRITE_TOKEN", "ATLAS_COLLECTOR_TOKEN", "ATLAS_PASSWORD", "ATLAS_SESSION_SECRET", "ATLAS_PROXY_SECRET"].filter(key => key !== name).every(key => !env[key] || env[key] !== value))
}
export function sourceOrigin(config: AtlasConfig) { if (!config.siteUrl) throw new IngestError(503, "Configure ATLAS_SITE_URL before ingestion."); return new URL(config.siteUrl).origin }
export function pushVersion(cardId: string) { return async (context: DatasetContext) => (await context.db.query<{ revision: string }>(`SELECT revision::text FROM ${context.db.table("ingest_versions")} WHERE card_id=$1 AND source_origin=$2`, [cardId, sourceOrigin(context.config)])).rows[0]?.revision ?? "0" }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new IngestError(400, "Expected a JSON object."); return value as Record<string, unknown> }
function keys(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).some(key => !allowed.includes(key))) throw new IngestError(400, "Unknown ingestion field.") }
function string(value: unknown, maximum: number): string { if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new IngestError(400, "Invalid ingestion text field."); return value }
function identifier(value: unknown) { const result = string(value, 120); if (!/^[a-zA-Z0-9_.:-]+$/.test(result)) throw new IngestError(400, "Invalid event identifier."); return result }
function path(value: unknown, origin: string) { const result = string(value, 500), url = new URL(result, origin); if (!result.startsWith("/") || result.startsWith("//") || url.origin !== origin || url.hash) throw new IngestError(400, "Event path must belong to the configured site."); return url.pathname }
function timestamp(value: unknown) { const time = value === undefined ? Date.now() : Date.parse(string(value, 32)); if (!Number.isFinite(time) || time < Date.now() - 86400_000 || time > Date.now() + 300_000) throw new IngestError(400, "Event time must be within the previous day."); return new Date(time).toISOString() }
async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 32_000) throw new IngestError(413, "Ingestion body exceeds 32 KB.")
  if (!request.body) throw new IngestError(400, "JSON body required.")
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0, timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new IngestError(408, "Ingestion body timed out.")), 3000) })
    while (true) { const next = await Promise.race([reader.read(), deadline]); if (next.done) break; bytes += next.value.byteLength; if (bytes > 32_000) throw new IngestError(413, "Ingestion body exceeds 32 KB."); chunks.push(next.value) }
    try { return object(JSON.parse(Buffer.concat(chunks).toString("utf8"))) } catch { throw new IngestError(400, "Invalid JSON body.") }
  } finally { clearTimeout(timer); void reader.cancel().catch(() => undefined) }
}
function vitals(value: unknown, origin: string): TelemetryInputs["web_vitals"] {
  const event = object(value); keys(event, ["id", "path", "name", "value", "rating", "navigationType", "timestamp"])
  const name = string(event.name, 10) as TelemetryInputs["web_vitals"]["metric_name"]
  if (!["LCP", "INP", "CLS", "FCP", "TTFB"].includes(name) || typeof event.value !== "number" || !Number.isFinite(event.value) || event.value < 0 || event.value > (name === "CLS" ? 100 : 3_600_000)) throw new IngestError(400, "Invalid metric name/value.")
  const rating = event.rating as TelemetryInputs["web_vitals"]["rating"]
  if (rating !== undefined && !["good", "needs-improvement", "poor"].includes(rating)) throw new IngestError(400, "Invalid metric rating.")
  const navigation = event.navigationType
  if (navigation !== undefined && !["navigate", "reload", "back-forward", "back-forward-cache", "prerender", "restore"].includes(String(navigation))) throw new IngestError(400, "Invalid navigation type.")
  return { source_origin: origin, event_key: `${name}:${identifier(event.id)}`, page_path: path(event.path, origin), metric_name: name, metric_value: event.value, rating, navigation_type: navigation as string | undefined, measured_at: timestamp(event.timestamp) }
}
function pageView(value: unknown, origin: string): TelemetryInputs["page_views"] { const event = object(value); keys(event, ["id", "path", "timestamp"]); return { source_origin: origin, event_key: identifier(event.id), path: path(event.path, origin), occurred_at: timestamp(event.timestamp) } }
function errorEvent(value: unknown, origin: string): TelemetryInputs["error_logs"] {
  const event = object(value); keys(event, ["id", "message", "level", "name", "path", "statusCode", "timestamp"])
  const message = string(event.message, 500).replace(/(?:Bearer\s+)[^\s]+/gi, "Bearer [redacted]").replace(/(?:https?:\/\/)[^\s]+/g, "[URL]")
  if (event.level !== "error" && event.level !== "warn") throw new IngestError(400, "Error level must be error or warn.")
  if (event.statusCode !== undefined && (typeof event.statusCode !== "number" || !Number.isInteger(event.statusCode) || event.statusCode < 100 || event.statusCode > 599)) throw new IngestError(400, "Invalid HTTP status.")
  return { source_origin: origin, event_key: identifier(event.id), message, level: event.level, fingerprint: hash(message), error_name: event.name === undefined ? undefined : identifier(event.name), route: event.path === undefined ? undefined : path(event.path, origin), status_code: event.statusCode as number | undefined, occurred_at: timestamp(event.timestamp) }
}
async function rate(tx: Queryable, scope: string, limit: number) {
  const result = await tx.query<{ requests: number }>(`INSERT INTO ${tx.table("ingest_rate_buckets")} (scope_key, minute, requests) VALUES ($1, date_trunc('minute', now()), 1) ON CONFLICT (scope_key, minute) DO UPDATE SET requests=ingest_rate_buckets.requests+1 RETURNING requests`, [scope])
  if (result.rows[0].requests > limit) throw new IngestError(429, "Source ingestion rate exceeded; retry next minute.")
  await tx.query(`DELETE FROM ${tx.table("ingest_rate_buckets")} WHERE minute < now() - interval '2 hours'`)
}
export function createIngestHandlers(dependencies: { config: AtlasConfig; env: Env; database: () => Database }) {
  function response(status: number, value: unknown, origin?: string) { return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}) } }) }
  return {
    options(request: Request) { try { const origin = sourceOrigin(dependencies.config); if (request.headers.get("origin") !== origin) return response(403, { error: "Origin not allowed." }); return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" } }) } catch { return response(503, { error: "Ingestion is not configured." }) } },
    async post(request: Request, kind: IngestKind) {
      if (demoMode(dependencies.env)) return response(403, { error: "Ingestion is disabled in demo mode." })
      let allowedOrigin: string | undefined
      try {
        const origin = sourceOrigin(dependencies.config), cardId = kind === "errors" ? "server-errors" : "real-users"
        if (dependencies.config.cards[cardId]?.enabled === false) throw new IngestError(403, "This ingestion card is disabled.")
        const { env } = dependencies
        if (kind === "errors") {
          const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1]
          if (!writeCredentialConfigured(env, "server")) throw new IngestError(503, "Configure a separate server error write token.")
          if (!equal(token, env.ATLAS_ERRORS_WRITE_TOKEN, 32)) throw new IngestError(401, "Server error write credential required.")
          if (request.headers.has("origin")) throw new IngestError(403, "Server error ingestion is for server clients.")
        } else {
          if (request.headers.get("origin") !== origin) throw new IngestError(403, "Origin not allowed.")
          allowedOrigin = origin
          if (!writeCredentialConfigured(env, "browser")) throw new IngestError(503, "Configure a separate public browser write key.")
        }
        const input = await body(request); keys(input, kind === "errors" ? ["events"] : ["writeKey", "events"])
        if (kind !== "errors" && !equal(typeof input.writeKey === "string" ? input.writeKey : undefined, env.ATLAS_RUM_WRITE_KEY, 16)) throw new IngestError(401, "Browser write key required.")
        if (!Array.isArray(input.events) || input.events.length < 1 || input.events.length > 20) throw new IngestError(400, "Send 1–20 events per request.")
        const rows = input.events.map(event => kind === "vitals" ? vitals(event, origin) : kind === "errors" ? errorEvent(event, origin) : pageView(event, origin))
        await dependencies.database().transaction(async tx => {
          await rate(tx, hash(`${origin}:${cardId}`), kind === "errors" ? 300 : 120)
          for (const row of rows) {
            if (kind === "vitals") {
              const vital = row as TelemetryInputs["web_vitals"]
              // Late older deliveries cannot overwrite final metric updates.
              await tx.query(`INSERT INTO ${tx.table("web_vitals")} (source_origin,event_key,page_path,metric_name,metric_value,rating,navigation_type,measured_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (source_origin,event_key) DO UPDATE SET metric_value=EXCLUDED.metric_value,rating=EXCLUDED.rating,measured_at=EXCLUDED.measured_at WHERE EXCLUDED.measured_at >= web_vitals.measured_at`, [origin,vital.event_key,vital.page_path,vital.metric_name,vital.metric_value,vital.rating,vital.navigation_type,vital.measured_at])
            } else if (kind === "errors") await insertTelemetry(tx, "error_logs", row as TelemetryInputs["error_logs"], { upsert: true })
            else await insertTelemetry(tx, "page_views", row as TelemetryInputs["page_views"], { upsert: true })
          }
          await tx.query(`INSERT INTO ${tx.table("ingest_versions")} (card_id,source_origin) VALUES ($1,$2) ON CONFLICT (card_id,source_origin) DO UPDATE SET revision=ingest_versions.revision+1`, [cardId, origin])
          await invalidateCache(tx, cardId)
        })
        return response(202, { accepted: rows.length }, allowedOrigin)
      } catch (error) { return response(error instanceof IngestError ? error.status : 503, { error: error instanceof IngestError ? error.message : "Ingestion could not be stored." }, allowedOrigin) }
    },
  }
}
