import type { Database } from "../db/pool"
import type { DatasetEnvelope, DatasetQuery } from "../cards/types"
import { demoFixtures, FIXTURE_DATE, FIXTURE_VERSION } from "./fixtures"
export function fixtureKey(id: string) { return `demo:${FIXTURE_VERSION}:${id}` }
export async function seedDemo(db: Database) {
  if (!db.schema.startsWith("atlas_demo_")) throw new Error("Demo seed requires a reserved atlas_demo_ schema.")
  await db.transaction(async tx => {
    for (const [id, payload] of Object.entries(demoFixtures)) await tx.query(`INSERT INTO ${tx.table("dataset_cache")} (cache_key,card_id,payload,stored_at,expires_at) VALUES ($1,$2,$3::jsonb,$4,'infinity') ON CONFLICT (cache_key) DO UPDATE SET payload=EXCLUDED.payload,stored_at=EXCLUDED.stored_at,expires_at=EXCLUDED.expires_at`, [fixtureKey(id), id, JSON.stringify(payload), FIXTURE_DATE])
  })
  return Object.keys(demoFixtures).length
}
/** Demo never calls a live collector/query or falls back after a missing seed. */
export async function demoDataset(database: () => Database, id: string, query: DatasetQuery): Promise<DatasetEnvelope> {
  const empty: DatasetEnvelope = { id, provenance: "synthetic", status: "empty", data: null, updatedAt: null, stale: false, run: null, cache: { hit: false, expiresAt: null } }
  try {
    const db = database()
    if (!db.schema.startsWith("atlas_demo_")) throw new Error("Demo requires its isolated schema.")
    const stored = (await db.query<{ payload: DatasetEnvelope }>(`SELECT payload FROM ${db.table("dataset_cache")} WHERE cache_key=$1`, [fixtureKey(id)])).rows[0]?.payload
    if (!stored) return { ...empty, reason: "Demo fixtures are not seeded. Run ATLAS_DEMO=true pnpm seed with the same database and demo schema, then reload." }
    if ((query.since && query.since > FIXTURE_DATE) || (query.until && query.until <= FIXTURE_DATE)) return { ...empty, reason: "No synthetic fixture in this range. Demo examples are fixed at September 5, 2026, 12:00 UTC." }
    const result = structuredClone(stored)
    if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
      if (Array.isArray(result.data.rows)) result.data.rows = result.data.rows.slice(0, query.limit)
      if (Array.isArray(result.data.regions)) { result.data.truncated = result.data.regions.length > query.limit; result.data.regions = result.data.regions.slice(0, query.limit) }
    }
    return { ...result, provenance: "synthetic", stale: false, run: null, cache: { hit: true, expiresAt: null } }
  } catch { return { ...empty, status: "error", error: "Demo workspace unavailable. Configure DATABASE_URL, then run ATLAS_DEMO=true pnpm setup and ATLAS_DEMO=true pnpm seed." } }
}
