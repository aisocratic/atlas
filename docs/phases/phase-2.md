# Phase 2 — PostgreSQL storage

Status: implemented and verified against isolated PostgreSQL 14.17.

## Scope and provenance

Atlas owns a private, configurable schema, default `atlas`. It does not require
extensions, an ORM, Supabase, the AI Socratic website, or its users table.
The migration contains **17 application tables**, plus `schema_migrations` for
migration bookkeeping. `db/schema.sql` is the generated PostgreSQL 14 snapshot;
`db/migrations/*.sql` remains the authoritative, append-only source.

The telemetry shapes were derived read-only from the website's
`lib/db/schema.sql`, `lib/db/region-latency.ts`, and migrations for Lighthouse,
web vitals, SEO audits, region latency, repo metrics, releases, errors, page
views, CLI usage, and dashboard layouts. Atlas separates metadata from layout
revisions, SEO findings from audit runs, and package health from repo snapshots.
There are no copied website data, credentials, auth-provider IDs, or production
connections.

| Table | Purpose |
|---|---|
| dashboards | Owner-scoped names, order, creation and update times |
| dashboard_layouts | Independent JSON canvas per dashboard, optimistic revision |
| dataset_cache | Query-result JSON with stored/expiry timestamps for stale revalidation |
| collector_runs | Collection history, freshness, status, fenced leases, row counts/errors |
| lighthouse_reports | Per-route/device lab scores, vitals, bytes, raw diagnostics |
| web_vitals | Field LCP/INP/CLS/FCP/TTFB samples and optional deduplication key |
| seo_audits | Per-page SEO score and metadata/check history |
| seo_findings | Named rules and severity under an audit, cascading with its parent |
| region_latency_samples | Successful and failed regional probes with timing breakdown |
| region_latency_daily | Per-day/region/route counts and percentile rollups |
| repo_metrics | Timestamped repository size, quality, complexity and test metrics |
| dependency_health | Per-package version/vulnerability health under a repo snapshot |
| releases | Repository/tag release history with idempotent natural key |
| error_logs | Fingerprinted server warnings/errors, route, status and context |
| page_views | Minimal first-party RUM page/session/device observations |
| ai_usage | Explicitly opted-in daily tool/model usage; exact bigint token counts |
| anomalies | Card-linked deviations with baseline, observation and evidence |

Indexes cover owner/order, natural keys, freshness, time series and parent
relations. Foreign keys prevent orphan child rows; checks constrain scores,
counts, statuses and opt-in usage. `pg` intentionally returns bigint/numeric
values as strings: consumers must not silently coerce values beyond JS's safe
integer range.

## Commands and configuration

```bash
# Set DATABASE_URL for your Atlas database in the shell or hosting environment.
pnpm run setup
pnpm db:migrate
pnpm db:schema
# Print SQL instead of replacing db/schema.sql:
pnpm db:schema --stdout
```

Use **`pnpm run setup`**, not `pnpm setup`: the latter is pnpm's unrelated
built-in shell/environment installer. Atlas database scripts do not load another
repository's `.env` files, change shell profiles, or auto-connect at import time.

- `DATABASE_URL`: PostgreSQL connection URI; required when storage is accessed.
- `ATLAS_SCHEMA`: default `atlas`; lowercase identifier, 1–63 characters.
  `public`, `information_schema`, `pg_*`, and arbitrary SQL are rejected.
- `DATABASE_POOL_MAX`: default 10, integer 1–100.
- `DATABASE_SSL=require`: enable TLS with certificate verification; `disable`
  explicitly disables TLS. No implicit `rejectUnauthorized: false` setting.
  A URL's `sslmode=require` is also hardened to certificate verification.
- `PG_DUMP_BIN`: optional PostgreSQL `pg_dump` path for schema export; otherwise
  uses the installed command. Use a client matching the deployment's supported
  PostgreSQL version when generating the checked-in snapshot.

Pool access is lazy with a five-second connection timeout and thirty-second
statement timeout. Explicit `createDatabase()` also accepts pool/SSL/timeout
options. SQL values are parameterized; identifiers are derived from a fixed
Atlas table registry and the validated schema. Application SQL uses qualified
table names and never relies on `public` search path.

## Migration guarantees

`migrate(db)` loads ordered `NNNN_description.sql` files, then runs schema
creation, ledger validation, pending DDL, and ledger writes within one
transaction. A transaction-scoped PostgreSQL advisory lock serializes concurrent
migrators for the same database/schema. Failures roll back both DDL and history.
SHA-256 checksums reject changed or removed applied migrations; newly introduced
files cannot precede the last applied version. Migration files must contain
transaction-compatible SQL and leave transaction ownership to the runner.
No migration is applied merely by importing server modules.

## Handoff contracts

All APIs are exported from `lib/db/index.ts`:

- `getDatabase()` lazily reads environment configuration; `createDatabase()` is
  injectable for tests and explicit deployments. `closeDatabase()` closes the
  singleton; `db.close()` closes an injected pool.
- `db.query<T>(sql, parameters)` and `db.transaction(async tx => ...)` provide
  ordinary parameterized SQL. `db.table("region_latency_samples")` returns a
  safely qualified, allowlisted identifier. A transaction's `tx` has the same
  `query` and `table` methods.
- `createDashboard(db, ownerKey, name, layout)`, `listDashboards`,
  `renameDashboard`, `readLayout`, `saveLayout`, and `deleteDashboard` always
  scope by a server-derived owner key. The auth adapter must provide that key;
  never trust a client-supplied owner. `saveLayout` requires the expected revision
  and throws `LayoutConflictError` on a stale/missing/unauthorized target.
- `readCache<T>` returns payload, timestamps and a `stale` flag, retaining expired
  payloads for revalidation. `writeCache`, `invalidateCache(cardId)` and
  `pruneCache` support the frame and registry. Cache keys must include the card's
  complete query parameters and any relevant access scope.
- `startCollectorRun(db, collectorId, targetKey, leaseSeconds)` returns a lease or
  `null` if already running. `heartbeatCollectorRun` renews only a live lease.
  Collect external data **outside** a database transaction. Then call
  `completeCollectorRun(db, lease, async tx => ({ value, rowsWritten }))` to publish
  data and success atomically. The publisher checks and locks the live lease
  before writing. Stale/replaced workers cannot publish. `failCollectorRun`
  records failure; `latestCollectorRun` supplies latest-attempt freshness.
- `insertTelemetry(dbOrTx, table, typedInput, { upsert })` and `readTelemetry`
  cover all 13 telemetry tables. Natural-key families support explicit upsert;
  snapshots remain append-only. Bounded, parameterized filters/time windows are
  available. Specialized aggregations can use `db.query` directly.

## Verification evidence

Executed on an isolated loopback PostgreSQL **14.17** database named
`atlas_roadmap`, never a website or production database:

```bash
ATLAS_TEST_DATABASE_URL=postgres://roadmap@127.0.0.1:55672/atlas_roadmap pnpm test:storage
pnpm exec tsc --noEmit
pnpm exec eslint lib/db scripts/db tests/storage
```

The tests create random private schemas and remove only those schemas. They
require an explicit loopback test/roadmap URL and fail without one. **10 tests
passed**, covering schema table count, idempotency, concurrent advisory locks,
transactional DDL rollback, checksum drift, owner isolation, revision conflicts,
cascades, stale/expired cache behavior, collector races/expiry/fenced publication,
partial-write rollback, all telemetry families, idempotent releases, literal SQL
injection payloads, score/opt-in constraints, and exact bigint round trips.

`pnpm run setup` applied the real initial migration; rerunning `pnpm db:migrate`
reported up to date. `pnpm db:schema` successfully exported the live schema.
No website files or production database scripts were executed or modified.
