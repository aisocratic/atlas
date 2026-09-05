import assert from "node:assert/strict";
import { test } from "node:test";
import { schemaName, createDatabase, databaseOptionsFromEnv } from "../../lib/db/pool.js";
test("schema identifiers are strict and never accept SQL or shared/system schemas", () => {
  assert.equal(schemaName(), "atlas");
  assert.equal(schemaName("atlas_preview_42"), "atlas_preview_42");
  for (const invalid of ["public", "information_schema", "pg_temp", "Atlas", "atlas; DROP TABLE users", 'atlas"', "", "x".repeat(64)]) assert.throws(() => schemaName(invalid));
});
test("pool configuration is lazy, bounded, and TLS require verifies certificates", async () => {
  const env = { DATABASE_URL: "postgres://test@localhost/atlas_test", DATABASE_SSL: "require", DATABASE_POOL_MAX: "5" };
  assert.deepEqual(databaseOptionsFromEnv(env).ssl, { rejectUnauthorized: true });
  assert.equal(databaseOptionsFromEnv(env).max, 5);
  for (const value of ["0", "101", "NaN", "1.5"]) assert.throws(() => databaseOptionsFromEnv({ ...env, DATABASE_POOL_MAX: value }));
  assert.throws(() => databaseOptionsFromEnv({ ...env, DATABASE_SSL: "insecure" }));
  assert.throws(() => databaseOptionsFromEnv({}));
  const db = createDatabase(databaseOptionsFromEnv(env));
  assert.equal(db.table("web_vitals"), '"atlas"."web_vitals"');
  assert.throws(() => db.table("users" as never));
  await db.close();
});
