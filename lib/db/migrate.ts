import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "./pool";

export const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../db/migrations", import.meta.url));
export interface Migration { filename: string; checksum: string; sql: string }
export async function readMigrations(directory = MIGRATIONS_DIRECTORY): Promise<Migration[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  if (names.some((name) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(name))) throw new Error("Migration filenames must be NNNN_description.sql.");
  if (new Set(names.map((name) => name.slice(0, 4))).size !== names.length) throw new Error("Migration sequence numbers must be unique.");
  return Promise.all(names.map(async (filename) => {
    const sql = await readFile(resolve(directory, filename), "utf8");
    return { filename, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }));
}
/** One transaction + database-scoped advisory lock protects concurrent setup processes. */
export async function migrate(db: Database, directory = MIGRATIONS_DIRECTORY): Promise<string[]> {
  const migrations = await readMigrations(directory);
  return db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", ["atlas/migrations", db.schema]);
    await tx.query(`CREATE SCHEMA IF NOT EXISTS "${db.schema}"`);
    await tx.query(`CREATE TABLE IF NOT EXISTS ${tx.table("schema_migrations")} (filename text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows: applied } = await tx.query<{ filename: string; checksum: string }>(`SELECT filename, checksum FROM ${tx.table("schema_migrations")} ORDER BY filename`);
    for (const previous of applied) {
      const source = migrations.find((migration) => migration.filename === previous.filename);
      if (!source || source.checksum !== previous.checksum) throw new Error(`Applied migration ${previous.filename} is missing or changed. Migrations are append-only.`);
    }
    const names = new Set(applied.map(({ filename }) => filename));
    const pending = migrations.filter(({ filename }) => !names.has(filename));
    if (pending.some(({ filename }) => applied.some((previous) => previous.filename > filename))) throw new Error("New migrations must be appended after all applied migrations.");
    // Only this trusted schema and pg_catalog are available to migration SQL.
    await tx.query("SELECT set_config('search_path', $1, true)", [`"${db.schema}", pg_catalog`]);
    for (const migration of pending) {
      await tx.query(migration.sql);
      await tx.query(`INSERT INTO ${tx.table("schema_migrations")} (filename, checksum) VALUES ($1, $2)`, [migration.filename, migration.checksum]);
    }
    return pending.map(({ filename }) => filename);
  });
}
