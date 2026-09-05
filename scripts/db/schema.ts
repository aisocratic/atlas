import "../env";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { schemaName } from "../../lib/db/pool";
const schema = schemaName(process.env.ATLAS_SCHEMA);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to inspect the schema.");
const binary = process.env.PG_DUMP_BIN || "pg_dump";
const args = ["--schema-only", "--no-owner", "--no-privileges", `--schema=${schema}`];
// libpq does not expand a connection URI stored in PGDATABASE. Split it into
// private environment fields; credentials never appear in command arguments.
const url = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must be a PostgreSQL URI.");
const env: NodeJS.ProcessEnv = { ...process.env, PGHOST: url.hostname.replace(/^\[|\]$/g, ""), PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1)) };
if (url.username) env.PGUSER = decodeURIComponent(url.username);
if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
const parameters: Record<string, string> = { sslmode: "PGSSLMODE", sslrootcert: "PGSSLROOTCERT", sslcert: "PGSSLCERT", sslkey: "PGSSLKEY", connect_timeout: "PGCONNECT_TIMEOUT" };
for (const [key, target] of Object.entries(parameters)) if (url.searchParams.has(key)) env[target] = url.searchParams.get(key)!;
if (process.env.DATABASE_SSL === "require" || env.PGSSLMODE === "require") env.PGSSLMODE = "verify-full";
if (process.env.DATABASE_SSL === "disable") env.PGSSLMODE = "disable";
const child = spawn(binary, args, { env, stdio: ["ignore", "pipe", "pipe"] });
let sql = ""; let error = "";
child.stdout.on("data", (chunk) => { sql += chunk; });
child.stderr.on("data", (chunk) => { error += chunk; });
child.on("error", () => { console.error("pg_dump could not start. Install PostgreSQL client tools or set PG_DUMP_BIN."); process.exitCode = 1; });
child.on("close", async (code) => {
  if (code !== 0) { console.error(error.trim() || "Schema export failed."); process.exitCode = 1; return; }
  if (!sql.includes("CREATE TABLE")) { console.error("No Atlas tables found. Run pnpm run setup first."); process.exitCode = 1; return; }
  if (process.argv.includes("--stdout")) process.stdout.write(sql);
  else { await writeFile(fileURLToPath(new URL("../../db/schema.sql", import.meta.url)), sql); console.log(`Exported ${schema} schema to db/schema.sql.`); }
});
