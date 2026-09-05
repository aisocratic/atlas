import type { Database, Queryable } from "./pool";
export interface CollectorLease { id: string; lease_token: string; collector_id: string; target_key: string; lease_expires_at: Date; started_at: Date }
export interface CollectorRun extends CollectorLease { status: "running" | "succeeded" | "failed"; finished_at: Date | null; rows_written: number; error: string | null; metadata: Record<string, unknown> }
function leaseDuration(seconds: number): number { if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) throw new Error("Collector leases must last 1–3600 seconds."); return seconds; }
/** A unique partial index arbitrates races; expiry recovery makes crashed workers retryable. */
export async function startCollectorRun(db: Database, collectorId: string, targetKey = "default", leaseSeconds = 900): Promise<CollectorLease | null> {
  if (!collectorId.trim() || !targetKey.trim()) throw new Error("Collector and target identifiers are required.");
  leaseDuration(leaseSeconds);
  return db.transaction(async (tx) => {
    await tx.query(`UPDATE ${tx.table("collector_runs")} SET status = 'failed', finished_at = now(), error = 'Collector lease expired' WHERE collector_id = $1 AND target_key = $2 AND status = 'running' AND lease_expires_at <= now()`, [collectorId, targetKey]);
    return (await tx.query<CollectorLease>(`INSERT INTO ${tx.table("collector_runs")} (collector_id, target_key, lease_expires_at) VALUES ($1, $2, now() + $3 * interval '1 second') ON CONFLICT (collector_id, target_key) WHERE status = 'running' DO NOTHING RETURNING *`, [collectorId, targetKey, leaseSeconds])).rows[0] ?? null;
  });
}
export async function heartbeatCollectorRun(db: Queryable, lease: Pick<CollectorLease, "id" | "lease_token">, leaseSeconds = 900): Promise<boolean> {
  return (await db.query(`UPDATE ${db.table("collector_runs")} SET lease_expires_at = now() + $3 * interval '1 second' WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_expires_at > now()`, [lease.id, lease.lease_token, leaseDuration(leaseSeconds)])).rowCount === 1;
}
/** Publish rows and success together; stale workers can never publish over a newer lease. */
export async function completeCollectorRun<T>(db: Database, lease: Pick<CollectorLease, "id" | "lease_token">, write: (tx: Queryable) => Promise<{ value: T; rowsWritten: number }>): Promise<T> {
  return db.transaction(async (tx) => {
    const active = await tx.query(`SELECT id FROM ${tx.table("collector_runs")} WHERE id = $1 AND lease_token = $2 AND status = 'running' AND lease_expires_at > now() FOR UPDATE`, [lease.id, lease.lease_token]);
    if (!active.rowCount) throw new Error("Collector lease expired or was replaced.");
    const result = await write(tx);
    if (!Number.isInteger(result.rowsWritten) || result.rowsWritten < 0) throw new Error("Collector row count must be a nonnegative integer.");
    await tx.query(`UPDATE ${tx.table("collector_runs")} SET status = 'succeeded', finished_at = now(), rows_written = $3 WHERE id = $1 AND lease_token = $2`, [lease.id, lease.lease_token, result.rowsWritten]);
    return result.value;
  });
}
export async function failCollectorRun(db: Queryable, lease: Pick<CollectorLease, "id" | "lease_token">, message: string): Promise<boolean> {
  return (await db.query(`UPDATE ${db.table("collector_runs")} SET status = 'failed', finished_at = now(), error = $3 WHERE id = $1 AND lease_token = $2 AND status = 'running'`, [lease.id, lease.lease_token, message.slice(0, 4000)])).rowCount === 1;
}
export async function latestCollectorRun(db: Queryable, collectorId: string, targetKey = "default"): Promise<CollectorRun | null> {
  return (await db.query<CollectorRun>(`SELECT * FROM ${db.table("collector_runs")} WHERE collector_id = $1 AND target_key = $2 ORDER BY started_at DESC, id DESC LIMIT 1`, [collectorId, targetKey])).rows[0] ?? null;
}
