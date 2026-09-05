import { demoMode } from "../demo/mode"
import { startCollectorRun, heartbeatCollectorRun, completeCollectorRun, failCollectorRun, type CollectorLease } from "../db/collectors"
import { invalidateCache } from "../db/cache"
import type { Database } from "../db/pool"
import type { CardContext, CardDefinition } from "../cards/define"
import { missingRequirements, targetKey } from "../cards/service"
import type { MissingRequirement } from "../cards/types"

export interface CollectionOutcome {
  id: string
  status: "succeeded" | "already-running" | "missing-config" | "disabled" | "unsupported" | "failed" | "timeout"
  runId?: string
  rowsWritten?: number
  error?: string
  reason?: string
  missing?: MissingRequirement[]
}
/** Only deliberately public failure messages may leave a collector boundary. */
export class CollectorError extends Error {}
export async function executeCollection({ definition, context, database, fetch: transport = globalThis.fetch }: {
  definition: CardDefinition; context: CardContext; database: () => Database; fetch?: typeof globalThis.fetch
}): Promise<CollectionOutcome> {
  const id = definition.info.id
  if (demoMode(context.env)) return { id, status: "unsupported", reason: "Demo mode contains synthetic fixtures. Collection is disabled." }
  if (!context.options.enabled) return { id, status: "disabled", reason: "This card is disabled in atlas.config.ts." }
  const missing = missingRequirements(definition, context)
  if (missing.length) return { id, status: "missing-config", missing, reason: missing.map(item => item.reason).join(" ") }
  if (!definition.collector) return { id, status: "unsupported", reason: "This card has no pull collector configured." }
  const timeoutMs = Math.min(definition.collector.timeoutMs ?? context.config.collectorTimeoutMs, context.config.collectorTimeoutMs)
  const leaseSeconds = Math.ceil(timeoutMs / 1000) + 30
  let db: Database | undefined
  let lease: CollectorLease | null = null
  const controller = new AbortController()
  let timedOut = false
  let timeout: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let heartbeatBusy = false
  try {
    db = database()
    lease = await startCollectorRun(db, id, targetKey(definition, context), leaseSeconds)
    if (!lease) return { id, status: "already-running", reason: "A collection is already running for this card and target." }
    const activeLease = lease
    const activeDb = db
    const interrupted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true })
      timeout = setTimeout(() => { timedOut = true; controller.abort(new CollectorError("The collector exceeded its time limit.")) }, timeoutMs)
      heartbeat = setInterval(() => {
        if (heartbeatBusy || controller.signal.aborted) return
        heartbeatBusy = true
        void heartbeatCollectorRun(activeDb, activeLease, leaseSeconds).then(valid => {
          if (!valid) controller.abort(new CollectorError("The collector lost its active lease."))
        }).catch(() => controller.abort(new CollectorError("The collector could not renew its lease."))).finally(() => { heartbeatBusy = false })
      }, Math.min(30_000, Math.max(25, Math.floor(timeoutMs / 3))))
    })
    const batch = await Promise.race([
      definition.collector.collect({ ...context, runId: activeLease.id, signal: controller.signal, fetch: transport }),
      interrupted,
    ])
    controller.signal.throwIfAborted()
    // Once publication begins, await its atomic outcome. Racing COMMIT against
    // an HTTP deadline could report failure after telemetry actually committed.
    // PostgreSQL connection/statement timeouts bound the database operations.
    if (timeout) clearTimeout(timeout)
    const rowsWritten = await completeCollectorRun(activeDb, activeLease, async tx => {
      controller.signal.throwIfAborted()
      const result = await batch.publish(tx)
      controller.signal.throwIfAborted()
      await invalidateCache(tx, id)
      return { value: result.rowsWritten, rowsWritten: result.rowsWritten }
    })
    return { id, status: "succeeded", runId: lease.id, rowsWritten }
  } catch (error) {
    const message = error instanceof CollectorError ? error.message.slice(0, 500) : "Collection failed. Check database setup and collector configuration."
    if (db && lease) {
      try { await failCollectorRun(db, lease, message) } catch { /* Lease expiry permits recovery if Postgres is unavailable. */ }
    }
    return { id, status: timedOut ? "timeout" : "failed", ...(lease ? { runId: lease.id } : {}), error: message }
  } finally {
    if (timeout) clearTimeout(timeout)
    if (heartbeat) clearInterval(heartbeat)
  }
}
