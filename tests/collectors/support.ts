import { randomUUID } from "node:crypto"
import { createDatabase, type Database } from "../../lib/db/pool"
import { migrate } from "../../lib/db/migrate"
import { CardServices } from "../../lib/cards/service"
import { serverRegistry } from "../../cards/server"
import { resolveConfig, type AtlasConfigInput } from "../../lib/config"
export const connectionString = process.env.ATLAS_TEST_DATABASE_URL
if (!connectionString) throw new Error("Set ATLAS_TEST_DATABASE_URL to a local test database.")
const url = new URL(connectionString)
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/(test|roadmap)/.test(url.pathname)) throw new Error("Collector tests require a local test/roadmap database.")
export async function withDatabase(work: (db: Database) => Promise<void>) {
  const db = createDatabase({ connectionString: connectionString!, schema: `atlas_collectors_${randomUUID().replaceAll("-", "")}` })
  try { await migrate(db); await work(db) } finally { try { await db.query(`DROP SCHEMA IF EXISTS "${db.schema}" CASCADE`) } finally { await db.close() } }
}
export function services(db: Database, config: AtlasConfigInput, env: Record<string, string> = {}) {
  return new CardServices({ registry: serverRegistry, config: resolveConfig(config, {}), env: { DATABASE_URL: connectionString, ...env }, database: () => db })
}
