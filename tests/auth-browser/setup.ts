import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../../lib/db/pool";
export default async function setup() {
  const connectionString = process.env.ATLAS_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Set ATLAS_TEST_DATABASE_URL to an isolated local test PostgreSQL database.");
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !/test|roadmap/.test(url.pathname)) throw new Error("Auth browser tests require a loopback database with test or roadmap in its name.");
  const schema = process.env.ATLAS_AUTH_TEST_SCHEMA!;
  const fixture = await mkdtemp(join(tmpdir(), "atlas-auth-setup-"));
  try {
    // Exercise real setup and .env.local loading without creating or reading user configuration.
    await writeFile(join(fixture, ".env.local"), `ATLAS_SCHEMA=${schema}\n`);
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: connectionString };
    delete env.ATLAS_SCHEMA; delete env.__NEXT_PROCESSED_ENV;
    execFileSync(process.execPath, [fileURLToPath(new URL("dist/cli.mjs", import.meta.resolve("tsx/package.json"))), fileURLToPath(new URL("../../scripts/db/setup.ts", import.meta.url))], { cwd: fixture, env, stdio: "pipe" });
  } finally { await rm(fixture, { recursive: true, force: true }); }
  const db = createDatabase({ connectionString, schema });
  await db.query(`SELECT 1 FROM ${db.table("schema_migrations")} LIMIT 1`);
  await db.close();
  return async () => {
    const cleanup = createDatabase({ connectionString, schema });
    await cleanup.query(`DROP SCHEMA "${cleanup.schema}" CASCADE`);
    await cleanup.close();
  };
}
