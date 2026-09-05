import { execFileSync } from "node:child_process"
import { createDatabase } from "../../lib/db/pool"
export default async function setup() {
  const connectionString = process.env.ATLAS_TEST_DATABASE_URL!
  if (!connectionString || !["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname) || !/(test|roadmap)/.test(new URL(connectionString).pathname)) throw new Error("Use a local test database.")
  const schema = process.env.ATLAS_DEMO_TEST_SCHEMA!
  execFileSync("pnpm", ["seed"], { env: { ...process.env, DATABASE_URL: connectionString, ATLAS_DEMO: "true", ATLAS_DEMO_SCHEMA: schema }, stdio: "pipe" })
  return async () => { const db = createDatabase({ connectionString, schema }); try { await db.query(`DROP SCHEMA "${db.schema}" CASCADE`) } finally { await db.close() } }
}
