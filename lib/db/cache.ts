import type { Queryable } from "./pool";
export interface CacheEntry<T> { payload: T; stored_at: Date; expires_at: Date; stale: boolean }
export async function readCache<T = unknown>(db: Queryable, key: string): Promise<CacheEntry<T> | null> {
  return (await db.query<CacheEntry<T>>(`SELECT payload, stored_at, expires_at, expires_at <= now() AS stale FROM ${db.table("dataset_cache")} WHERE cache_key = $1`, [key])).rows[0] ?? null;
}
export async function writeCache(db: Queryable, key: string, cardId: string, payload: unknown, ttlSeconds: number): Promise<void> {
  if (!key || !cardId || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 604800) throw new Error("Cache key, card ID, and a TTL of 1 second to 7 days are required.");
  const json = JSON.stringify(payload);
  if (json === undefined || Buffer.byteLength(json) > 5_000_000) throw new Error("Cache payload must be JSON no larger than 5 MB.");
  await db.query(`INSERT INTO ${db.table("dataset_cache")} (cache_key, card_id, payload, stored_at, expires_at) VALUES ($1, $2, $3::jsonb, now(), now() + $4 * interval '1 second') ON CONFLICT (cache_key) DO UPDATE SET card_id = EXCLUDED.card_id, payload = EXCLUDED.payload, stored_at = EXCLUDED.stored_at, expires_at = EXCLUDED.expires_at`, [key, cardId, json, ttlSeconds]);
}
export async function invalidateCache(db: Queryable, cardId: string): Promise<number> {
  return (await db.query(`DELETE FROM ${db.table("dataset_cache")} WHERE card_id = $1`, [cardId])).rowCount ?? 0;
}
export async function pruneCache(db: Queryable): Promise<number> {
  return (await db.query(`DELETE FROM ${db.table("dataset_cache")} WHERE expires_at <= now()`)).rowCount ?? 0;
}
