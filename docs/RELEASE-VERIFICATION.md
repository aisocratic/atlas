# Atlas v0.1.0 release verification

All ten phases are implemented and verified. The roadmap merged through
[PR #1](https://github.com/aisocratic/atlas/pull/1), commit `cd57425`, on 2026-09-05.
The [v0.1.0 release](https://github.com/aisocratic/atlas/releases/tag/v0.1.0)
provides the source archive and SHA256SUMS generated from its tagged commit.

## Requirement audit

| Requirement | Acceptance evidence |
| --- | --- |
| Scaffold and shared design | Clean CI install, vendored package/font integrity, typecheck, lint and production build. Phase 0/1 reports document both consumers. |
| PostgreSQL storage | Ten real storage tests verify isolated schemas, migrations/checksums/transactions and stored telemetry; migrations are append-only. |
| Named independent canvas layouts | Seven model/API tests and twelve production canvas browser cases verify persisted independent layouts, resize/reorder, mobile/keyboard controls and cache behavior. |
| Generic cards and collectors | Eleven card registry/execution tests verify configuration, generic routes, persisted run status, freshness, execution locks and missing requirements. |
| Regional latency | Eight provider/database tests plus recorded bounded public Globalping verification exercise measured request/poll/store/query/render behavior. |
| Remaining telemetry families | Thirteen collector tests and desktop/mobile production browsers cover all nine registered families, local HTTP providers, bounded repository/AI fixtures, scoped ingestion, cache invalidation and derived anomalies. Public provider observations are in phase 6 evidence. |
| Demo and seeds | Three database tests plus desktop/mobile production browsers cover deterministic fixtures for all nine cards, reserved schema isolation, synthetic provenance, detail pages, empty ranges, no live collection/ingestion and auth preservation. |
| Auth and setup | Eleven auth tests and six production auth browser cases verify password/header/bearer scopes, signed sessions, CSRF, setup and production refusal of open telemetry access. Four app browser cases verify authenticated rendering and responsive layout. |
| Self-host packaging | Clean extracted archive install/build/package smoke; non-root Docker image and Compose setup/seed/runtime verified against real PostgreSQL. Tests exercise idempotent migrations, SEO fixture writes, synthetic seed, login, datasets and static assets. |
| Process lifecycle | Consecutive source and Linux-container package tests reuse the same port and prove shutdown; occupied-port regression rejects unrelated listeners before database access. Container SIGTERM exits promptly. |
| Public documentation and Pages | README, contributor/setup/deployment docs, collector copy and roadmap status match delivered behavior. Roadmap completion labels were visually checked at desktop and 390px widths; the release stylesheet URL refreshes cached styles. |
| Release artifacts | `pnpm release:pack` generates the source archive and checksum from a clean committed tree. Repeated packing produces the same SHA-256; release assets identify the tagged source. |

## Complete CI

[Final implementation CI](https://github.com/aisocratic/atlas/actions/runs/33962514476)
passed with Node 24 and real PostgreSQL 14:

- Design/font integrity, typecheck, lint, production build and eleven static state tests.
- 63 backend tests across storage, cards, regional latency, demo, collectors, auth and canvas.
- Repeated source package smoke, occupied-port regression, Docker build and container package smoke.
- 34 production/static browser cases across Pages, auth, app, canvas, collectors and demo.
  Two static browser cases are intentional device-specific skips with complementary touch/pointer coverage.

The [Actions history](https://github.com/aisocratic/atlas/actions) records checks on
main and Pages publication. The public [Pages canvas](https://aisocratic.github.io/atlas/)
is synthetic; no private hosted database or application service is provisioned by
this release. Source and Docker/Compose deployments use the same collector/setup
commands. Docker base tags receive upstream updates; pin resolved digests when a
byte-identical container rebuild is required.
