# Phase 6 — remaining collector families

Verified 2026-09-05. Source settings, measurement definitions, supported formats,
ingestion contracts and bounds are in [`../COLLECTORS.md`](../COLLECTORS.md).

## Delivered

- Nine real registered card families: existing regional latency plus
  Lighthouse, SEO audit, releases, repository metrics, opt-in AI usage,
  real users, server errors, and derived anomalies. Each folder supplies
  metadata, collector, dataset, and view; client registries contain no server
  source/credential imports. Missing configuration stays visible.
- Pull collectors share bounded HTTP helpers and the existing generic
  authenticated routes/CLI. External I/O precedes fenced publication.
  Lighthouse preserves lab LCP/CLS/TBT semantics; SEO reports seven measured
  checks and findings; GitHub releases preserve draft/prerelease distinctions.
- Repository collection inspects only the explicit checkout and supported
  JS/TS sources, excluding credentials, VCS, dependencies, builds and symlink
  escapes. It runs no repository commands/scripts. Registry health preserves
  unknown responses and distinguishes declared range, wanted, and latest.
- AI collection requires opt-in plus explicit bounded JSON/JSONL files before
  any read. Claude message/result deduplication and Codex cumulative-counter
  handling preserve reported usage. Cost is only a supplied source estimate.
  Import snapshots are idempotent; no prompts or user's real logs were read.
- Browser field metrics use the maintained `web-vitals` package and a bundled
  sample beacon. Public origin-scoped write keys cannot authorize reads,
  collection, or administration. Separate privileged server error tokens
  reject browser requests. Credential reuse with authentication secrets is
  rejected. Payloads, fields, timestamps, metrics and per-source rates are
  bounded; rates use PostgreSQL rather than process-local state.
- Append-only migration `0003_ingest_sources.sql` adds origin identity to
  field metrics, page views, errors, and anomalies; legacy callers retain
  empty-origin defaults. It adds ingestion rate/version tables. The canonical
  schema snapshot was regenerated from a unique migrated local schema.
- Push writes, version increments and cache invalidation commit atomically.
  `CardDefinition.cacheVersion` ensures a read racing ingestion cannot
  repopulate the active cache with old data. Field p75 and error counts use
  complete source/time filters; display limits do not change aggregate totals.
- Regional anomalies require real baseline history, publish/resolve measured
  threshold findings, and link to authenticated `/cards/region-latency`.
  Generic `/cards/[id]` pages also provide readable detailed card views.

## Real public-source evidence

The manual script used unique local PostgreSQL schemas, no provider keys, and
bounded configured public requests. Each successful result was stored, queried,
and rendered through its actual card component. Schemas were removed afterward.

| Source | Observed outcome |
| --- | --- |
| `https://aisocratic.org/` | SEO measured at `2026-09-05T10:04:47.634Z`: all seven checks passed, 100/100. Run `6e266157-4a26-4a86-a990-2d014031759d`, one audit row, ready dataset, 1,492 rendered HTML characters. |
| `jsdelivr/globalping` | GitHub returned zero published releases. Run `59f16735-cdc5-4122-b6a3-b0cea1a98716` succeeded with zero rows and an empty dataset. Tags were not fabricated into release events. |
| `vercel/next.js` | Three bounded pages yielded 90 published release rows. Run `f1c86978-89fb-4cd7-b5c7-0e184d00d23a`, verified `2026-09-05T10:05:22.871Z`, ready dataset, 24,940 rendered HTML characters. Latest observed entry: `v16.4.0-canary.18`, explicitly marked prerelease; stable entries were also present. |

The observed values describe those runs only. Public verification is excluded
from CI. `test-results/collectors-live.json` retains the last public result;
the table above preserves the earlier SEO/empty-source observations.

## Verification

- All **57** combined backend tests passed: storage, auth, registry/execution,
  canvas model/API, regional provider, and remaining collectors. The **10**
  dedicated collector tests exercise actual local HTTP provider transport and
  real PostgreSQL publication/query, repository/file fixtures, AI opt-in and
  deduplication, scoped ingestion and final metric updates, rate limits,
  credential scope/reuse, source isolation, ingestion-cache races, and anomaly
  insufficient/breached/recovered history.
- The production Next build and both **desktop/mobile** committed collector
  browser tests passed. They assert all nine registry cards, UI collection of
  Lighthouse/SEO/releases through HTTP → PostgreSQL → rendered measurements,
  actual bundled `web-vitals` execution on the configured origin through CORS
  ingestion, privileged server error ingestion, protected card detail pages,
  and disabled collection for unconfigured AI sources.
- Desktop/mobile full-page screenshots were visually inspected under
  `test-results/collectors-browser/collectors-registered-sour-7fb36-dashboard-on-desktop-mobile-{desktop,mobile}/collected-card-families.png`.
  Layouts have no horizontal page overflow, and card contents retain bounded
  scrolling and readable text/table equivalents.
- Typechecking, application lint, shared design/font integrity and existing
  static canvas verification are included in `pnpm verify`.

CI commands added to the manifest are `pnpm test:collectors` and
`pnpm test:e2e:collectors`, with the explicit local test database URL. Browser
tests use only committed provider fixtures and unique test schemas. No
production database, real private history, deployment, commit, or push occurred.
