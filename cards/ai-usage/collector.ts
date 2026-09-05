import { createHash } from "node:crypto"
import { stat } from "node:fs/promises"
import { isAbsolute } from "node:path"
import type { CardContext, CollectionContext } from "../../lib/cards/define"
import { CollectorError } from "../../lib/collectors/execute"
import { numeric, record, assertOptions } from "../../lib/collectors/http"
import { safeFile } from "../repo-metrics/collector"
import { insertTelemetry, type TelemetryInputs } from "../../lib/db/telemetry"

export function sourcePaths(context: CardContext): string[] {
  assertOptions(context, ["sourcePaths"])
  const paths = context.options.options.sourcePaths
  if (!context.options.optIn || !Array.isArray(paths) || !paths.length || paths.length > 5 || paths.some(path => typeof path !== "string" || !isAbsolute(path) || path.length > 2048 || !/\.jsonl?$/.test(path))) throw new CollectorError("Opt in and configure 1–5 explicit absolute JSON/JSONL sourcePaths; no history discovery is performed.")
  return [...new Set(paths)] as string[]
}
export const sourceKey = (path: string) => createHash("sha256").update(path).digest("hex")
export function requirements(context: CardContext) { try { sourcePaths(context); return [] } catch { return [{ id: "sources", reason: "AI usage requires explicit optIn and 1–5 absolute JSON/JSONL sourcePaths in atlas.config.ts." }] } }
type Usage = { day: string; tool: string; model: string; input: number; output: number; read: number; creation: number; cost?: number }
const count = (value: unknown) => { const result = numeric(value); return result !== undefined && Number.isSafeInteger(result) ? result : 0 }
const modelName = (value: unknown) => typeof value === "string" && /^[a-zA-Z0-9_.:/-]{1,100}$/.test(value) ? value : "unknown"
export function parseUsage(text: string, fallbackDay: string): Usage[] {
  let events: Record<string, unknown>[]
  try { const value = JSON.parse(text); events = Array.isArray(value) ? value.map(record) : [record(value)] } catch {
    const lines = text.split(/\r?\n/).filter(line => line.trim())
    if (lines.length > 50_000 || lines.some(line => Buffer.byteLength(line) > 1_000_000)) throw new CollectorError("AI usage source exceeds the record budget.")
    try { events = lines.map(line => record(JSON.parse(line))) } catch { throw new CollectorError("AI source contains invalid JSON; export a complete file before collecting.") }
  }
  if (events.length > 50_000) throw new CollectorError("AI usage source exceeds the record budget.")
  const results: Usage[] = [], assistants = new Map<string, { usage: Usage; session?: string }>(), resultIds = new Set<string>(), coveredMessages = new Set<string>(); let model = "unknown", previous: Record<string, unknown> = {}, hasClaudeResult = false, hasUnscopedResult = false
  const usable = (usage: Record<string, unknown>) => Number.isSafeInteger(numeric(usage.input_tokens)) && Number.isSafeInteger(numeric(usage.output_tokens))
  const day = (event: Record<string, unknown>) => typeof event.timestamp === "string" && Number.isFinite(Date.parse(event.timestamp)) ? new Date(event.timestamp).toISOString().slice(0, 10) : fallbackDay
  for (const event of events) {
    const rawSession = event.session_id ?? event.sessionId, session = typeof rawSession === "string" && rawSession.length <= 200 ? rawSession : undefined
    const payload = record(event.payload)
    if (event.type === "turn_context") model = modelName(payload.model)
    if (event.type === "event_msg" && payload.type === "token_count") {
      const total = record(record(payload.info).total_token_usage)
      if (!usable(total)) continue
      if (count(total.input_tokens) < count(previous.input_tokens) || count(total.output_tokens) < count(previous.output_tokens)) previous = {}
      const delta = (key: string) => Math.max(0, count(total[key]) - count(previous[key]))
      const value: Usage = { day: day(event), tool: "codex", model, input: delta("input_tokens"), output: delta("output_tokens"), read: delta("cached_input_tokens"), creation: 0 }
      previous = total
      if (value.input || value.output || value.read) results.push(value)
    } else if (event.type === "turn.completed") {
      const usage = record(event.usage)
      if (!usable(usage)) continue
      results.push({ day: day(event), tool: "codex", model, input: count(usage.input_tokens), output: count(usage.output_tokens), read: count(usage.cached_input_tokens), creation: 0 })
    } else if (event.type === "result" && Object.keys(record(event.usage)).length) {
      const usage = record(event.usage)
      if (!usable(usage)) continue
      if (typeof event.uuid === "string") { if (resultIds.has(event.uuid)) continue; resultIds.add(event.uuid) }
      hasClaudeResult = true
      if (!session) hasUnscopedResult = true
      // A result covers only prior steps in its own session/call segment.
      // Other sessions and later steps remain independently counted.
      if (session) for (const [key, pending] of assistants) if (pending.session === session) { assistants.delete(key); coveredMessages.add(key) }
      results.push({ day: day(event), tool: "claude", model: "mixed", input: count(usage.input_tokens), output: count(usage.output_tokens), read: count(usage.cache_read_input_tokens), creation: count(usage.cache_creation_input_tokens), cost: numeric(event.total_cost_usd) })
    } else if (event.type === "assistant") {
      const message = record(event.message), usage = record(message.usage)
      if (typeof message.id !== "string" || !usable(usage)) continue
      const key = `${session ?? "unknown"}\0${message.id}`
      if (coveredMessages.has(key)) continue
      const prior = assistants.get(key)?.usage
      assistants.set(key, { session, usage: { day: day(event), tool: "claude", model: modelName(message.model), input: Math.max(prior?.input ?? 0, count(usage.input_tokens)), output: Math.max(prior?.output ?? 0, count(usage.output_tokens)), read: Math.max(prior?.read ?? 0, count(usage.cache_read_input_tokens)), creation: Math.max(prior?.creation ?? 0, count(usage.cache_creation_input_tokens)) } })
    }
  }
  if (hasClaudeResult && assistants.size && (hasUnscopedResult || [...assistants.values()].some(value => !value.session))) throw new CollectorError("Mixed Claude assistant/result exports require session IDs. Export one unambiguous source format or retain session IDs.")
  results.push(...[...assistants.values()].map(value => value.usage))
  return results
}
export const collector = { async collect(context: CollectionContext) {
  // Defense in depth: direct calls also require opt-in before any filesystem read.
  const paths = sourcePaths(context), rows: TelemetryInputs["ai_usage"][] = []
  for (const path of paths) {
    context.signal.throwIfAborted()
    const text = await safeFile(path, 5_000_000), fallbackDay = (await stat(path)).mtime.toISOString().slice(0, 10), groups = new Map<string, Usage>()
    const parsed = parseUsage(text, fallbackDay)
    if (!parsed.length) throw new CollectorError("Each configured AI file must contain supported usage records. No source snapshots were replaced.")
    for (const usage of parsed) {
      const key = `${usage.day}:${usage.tool}:${usage.model}`, group = groups.get(key)
      if (!group) groups.set(key, { ...usage })
      else { group.input += usage.input; group.output += usage.output; group.read += usage.read; group.creation += usage.creation; group.cost = group.cost !== undefined && usage.cost !== undefined ? group.cost + usage.cost : undefined }
    }
    for (const group of groups.values()) {
      if (![group.input, group.output, group.read, group.creation].every(Number.isSafeInteger)) throw new CollectorError("AI usage totals exceed the supported exact integer range.")
      rows.push({ run_id: context.runId, day: group.day, tool: group.tool, model: group.model, source_key: sourceKey(path), opted_in: true, input_tokens: group.input, output_tokens: group.output, cache_read_tokens: group.read, cache_creation_tokens: group.creation, cost_usd: group.cost })
    }
  }
  if (!rows.length) throw new CollectorError("Configured AI files contain no supported usage records.")
  return { async publish(tx: Parameters<typeof insertTelemetry>[0]) {
    // Replace only the explicitly selected source snapshots, making repeated imports idempotent.
    await tx.query(`DELETE FROM ${tx.table("ai_usage")} WHERE source_key=ANY($1::text[])`, [paths.map(sourceKey)])
    for (const row of rows) await insertTelemetry(tx, "ai_usage", row)
    return { rowsWritten: rows.length }
  } }
} }
