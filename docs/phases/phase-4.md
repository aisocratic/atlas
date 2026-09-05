# Phase 4 — card registry and generic execution

Completed 2026-09-05. The extension contract is documented in
[`../CARDS.md`](../CARDS.md).

## Delivered

- `lib/cards/types.ts` defines client-safe metadata, layout defaults, view props,
  missing requirements, freshness/run summaries, and the dataset envelope.
  `cards/registry.ts` and `cards/components.ts` contain browser-safe metadata
  and views; `cards/server.ts` separately registers datasets and collectors.
- `defineCard` validates IDs, required metadata, layout bounds, freshness, and
  collector deadlines. Duplicate registrations and unknown configured cards
  are rejected. `atlas.config.ts` supports validated enabled/disabled,
  explicit opt-in, bounded JSON options, source settings, and environment
  overrides. Missing requirements remain visible without initializing Postgres
  or invoking a collector.
- `GET /api/datasets/[id]` serves honest `ready`, `empty`, `missing-config`,
  `disabled`, and `error` envelopes with source freshness, sanitized latest-run
  status, stale indicators, and database TTL-cache metadata. ISO dates and
  limits are validated; payloads are bounded. HTTP responses are private and
  non-cacheable by shared proxies.
- `POST /api/collect/[id]` and `pnpm collect <id>` call the same execution layer.
  It acquires a real database lease, renews it during external work, rejects
  duplicates, applies an abortable deadline, and publishes through the fenced
  completion transaction. Telemetry, success, and cache invalidation commit
  atomically. Failure rolls publication back, records a bounded public error,
  and leaves stale successful data usable. Late provider work cannot publish.
- Lease/cache identity hashes the target and configured source/options. Cache
  generation includes the latest successful run so a read racing collection
  cannot repopulate the active cache with pre-collection data.
- The generic route handlers call the Phase 8 `authorizeRequest` seam with
  `read` or `collect` before configuration/DB access. Tests inject authorization
  and a local collector; deployed routes use the actual centralized auth.
- The region card folder has component/dataset/collector-requirements/info
  files. Its dataset is intentionally empty and no provider collector is
  registered; Phase 5 supplies actual Globalping measurements. No fixture is
  represented as live data.

## Verification

- `ATLAS_TEST_DATABASE_URL=postgres://roadmap@127.0.0.1:55672/atlas_roadmap pnpm test:cards`
  passed all 11 tests, using unique test schemas that were removed afterward.
  Coverage includes TTL/cache states, run freshness, successful invalidation,
  concurrency exclusion, transactional rollback, error redaction, deadlines,
  late work, stale-lease recovery, real heartbeat renewal, cache-generation
  races, generic handler authorization/query/ID checks, shared CLI execution,
  configuration validation, opt-in, and visible missing requirements.
- `pnpm typecheck` passed. Application lint passed with no errors; temporary
  warnings in concurrently developed auth UI were outside this phase. A
  focused lint check of all Phase 4 implementation/tests passed cleanly.
- `pnpm build` passed with dynamic `/api/datasets/[id]` and
  `/api/collect/[id]`, alongside the concurrently added auth routes.
- Design/font integrity, all 11 existing canvas unit tests, and frozen-lockfile
  installation passed.
- `pnpm collect region-latency` without configuration returned explicit
  database/site requirements and exit code 1, without accessing a provider.

## Handoff

App-reachable TypeScript uses extensionless imports. Import database modules
directly (`lib/db/pool`, `cache`, `collectors`, `telemetry`): the CLI-oriented
`lib/db/index` barrel also exports migration asset handling and should not be
pulled into the application bundle.

External collection obeys the configured abortable deadline. Once publication
starts, execution waits for the database's atomic outcome under pool
connection/statement timeouts; card publishers must contain only bounded
database work. Phase 9 owns standalone packaging/environment-file bootstrap.

The Pages site, dashboard canvas, database implementation, and auth ownership
were preserved. No production database, deployment, commit, or push occurred.
