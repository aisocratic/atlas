import { runtimeSchema } from "../demo/mode";
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

export const TABLES = ["dashboards", "dashboard_layouts", "dataset_cache", "collector_runs", "lighthouse_reports", "web_vitals", "seo_audits", "seo_findings", "region_latency_samples", "region_latency_daily", "repo_metrics", "dependency_health", "releases", "error_logs", "page_views", "ai_usage", "anomalies", "schema_migrations", "ingest_rate_buckets", "ingest_versions"] as const;
export type TableName = (typeof TABLES)[number];
export function schemaName(value = "atlas"): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value) || value === "public" || value === "information_schema" || value.startsWith("pg_")) throw new Error("ATLAS_SCHEMA must be a private lowercase identifier (1–63 letters, digits, underscores); public and system schemas are forbidden.");
  return value;
}
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
  table(name: TableName): string;
  readonly schema: string;
}
export interface Database extends Queryable {
  transaction<T>(work: (transaction: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export interface DatabaseOptions {
  connectionString: string;
  schema?: string;
  max?: number;
  ssl?: PoolConfig["ssl"];
  statementTimeoutMs?: number;
}
export function databaseOptionsFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): DatabaseOptions {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required. Configure Postgres, then run pnpm run setup.");
  const max = Number(env.DATABASE_POOL_MAX ?? 10);
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error("DATABASE_POOL_MAX must be an integer from 1 to 100.");
  const mode = env.DATABASE_SSL;
  if (mode && mode !== "require" && mode !== "disable") throw new Error("DATABASE_SSL must be require or disable.");
  return { connectionString: env.DATABASE_URL, schema: runtimeSchema(env), max, ssl: mode === "require" ? { rejectUnauthorized: true } : mode === "disable" ? false : undefined };
}
export function createDatabase(options: DatabaseOptions): Database {
  const schema = schemaName(options.schema);
  const url = new URL(options.connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("DATABASE_URL must use postgres:// or postgresql://.");
  // pg's connection-string parser otherwise overrides an explicit strict SSL
  // configuration with sslmode=require's permissive certificate behavior.
  let ssl = options.ssl;
  const urlMode = url.searchParams.get("sslmode");
  if (urlMode && ["require", "verify-ca", "verify-full"].includes(urlMode) && ssl === undefined) ssl = { rejectUnauthorized: true };
  if (ssl !== undefined && urlMode) url.searchParams.delete("sslmode");
  const pool = new Pool({ connectionString: url.toString(), max: options.max ?? 10, ssl, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: options.statementTimeoutMs ?? 30000, application_name: "atlas", options: "-c timezone=UTC" });
  // Idle-client errors must not crash a server process; failed queries still reject normally.
  pool.on("error", () => { /* pg removes the failed idle client; the next request reconnects. */ });
  const table = (name: TableName) => {
    if (!(TABLES as readonly string[]).includes(name)) throw new Error("Unknown Atlas table.");
    return `"${schema}"."${name}"`;
  };
  const scoped = (client: PoolClient): Queryable => ({ schema, table, query: (sql, values) => client.query(sql, values) });
  return {
    schema, table,
    query: (sql, values) => pool.query(sql, values),
    async transaction(work) {
      const client = await pool.connect();
      let released = false;
      try {
        await client.query("BEGIN");
        const result = await work(scoped(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try { await client.query("ROLLBACK"); } catch { client.release(true); released = true; throw error; }
        throw error;
      } finally {
        // `release(true)` above already disposed of a broken connection.
        if (!released) client.release();
      }
    },
    close: () => pool.end(),
  };
}
let singleton: Database | undefined;
/** Lazy: importing card modules during a static build does not require a database. */
export function getDatabase(): Database {
  if (!singleton) {
    singleton = createDatabase(databaseOptionsFromEnv());
  }
  return singleton;
}
export async function closeDatabase(): Promise<void> { const current = singleton; singleton = undefined; await current?.close(); }
