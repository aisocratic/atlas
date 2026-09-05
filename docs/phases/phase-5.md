# Phase 5 — regional HTTP latency

Completed 2026-09-05. Configuration and
measurement semantics are documented in
[`../REGION-LATENCY.md`](../REGION-LATENCY.md).

## Delivered

- The regional card now has a real Globalping collector, typed dataset,
  accessible Stoa-based component, and metadata. It uses the shared generic
  dataset/collect routes and CLI execution path.
- Configurable 1–12 regions and 1–3 same-origin paths map hostname, protocol,
  port, path, and query into documented HTTP measurements. External work has
  bounded concurrency, response sizes, request deadlines, polling, and aborts.
  Failed probes and missing timings remain unavailable; provider-wide failure
  records a failed run without fabricated measurements or raw error leakage.
- Overall TTFB adds DNS, TCP, HTTPS TLS, and post-connection first-byte wait.
  The card explicitly identifies HEAD measurements and milliseconds. Region
  text accompanies bars, history uses a semantic expandable table, heading IDs
  are unique per instance, and content remains scrollable inside canvas sizing.
- Sample publication and UTC aggregate refresh use the shared fenced
  transaction. Append-only migration `0002_region_daily_source.sql` adds full
  URL identity to aggregate primary keys, preserving legacy callers through
  the empty-string default. The generated schema snapshot was refreshed from
  an isolated migrated database.
- Reads filter configured URLs and region keys. History uses exactly the same
  `[since, until)` bounds as samples, including partial days. Summary counts
  and median cover all configured checks before applying a display limit;
  truncation is explicit. Cache and lease identity include target/options.

## Public provider evidence

`scripts/verify-region-live.ts` made one bounded no-key collection against
`https://aisocratic.org/` on 2026-09-05, using three real probes and a unique
local PostgreSQL schema. It completed successfully at
`2026-09-05T09:32:29.985Z`, published three rows, queried a ready dataset with
three responding regions, and rendered the actual dataset through the card.
The overall median was **346 ms**:

| Region | Overall TTFB | Globalping measurement ID |
| --- | ---: | --- |
| Japan | 711 ms | `2I1YINM2l2EIhFi4C000214we` |
| United Kingdom | 83 ms | `2b7xlB3zOW6rC0DsU000214we` |
| United States | 346 ms | `2dbzduMc37ZOcasVI000214we` |

Run ID: `9a7e093b-c503-4008-b280-0a4dd62c857a`. The verification script wrote
JSON and rendered HTML under `test-results/` and removed its isolated schema.
These are observed results from that run, not promises of future availability
or fixture data. Public calls are excluded from CI.

## Verification

- `pnpm typecheck` passed.
- `ATLAS_TEST_DATABASE_URL=postgres://roadmap@127.0.0.1:55672/atlas_roadmap pnpm test:region`
  passed all **8** tests. They exercise a real local HTTP provider and real
  PostgreSQL: request mapping, nullable timings, failed probes, rate limits,
  bounded polling/abort, fenced storage/query/card rendering, source isolation,
  legacy aggregate compatibility, New York transaction timezone around UTC
  midnight, exact history windows, and display-limit summary correctness.
- The storage suite passed all **10** tests with the two-migration ledger.
- `pnpm lint` and `git diff --check` passed.
- The integrated production Next build passed. The committed canvas browser
  suite passed all **12** desktop/mobile cases, including authenticated
  Collect now → local HTTP provider → PostgreSQL → dataset → rendered
  **120 ms** and **Unavailable** values, periodic refresh, and recovery after
  a transient refresh failure. Test fixtures are explicit local endpoints.
  Desktop/mobile screenshots under
  `test-results/canvas/canvas-real-collection-pub-8e667-ders-honest-missing-regions-{desktop,mobile}/collected-region-latency.png`
  were visually inspected for card layout, readable measurement status, and
  persistent collection controls.

The tests use isolated local schemas and test-only provider fixtures. No
production database, deployment, commit, or push occurred.
