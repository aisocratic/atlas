# Phase 7 — explicit demo mode and deterministic seeds

Completed 2026-09-05 on the roadmap checkpoint branch.

## Delivered

- `ATLAS_DEMO=true` selects an isolated reserved `atlas_demo_` schema, never the live `ATLAS_SCHEMA`. The reserved namespace is rejected for live configuration; malformed mode/schema settings fail closed. Authentication remains unchanged, including production refusal of open access. Demo no longer requires a monitored site.
- `pnpm seed` runs the real append-only migration path and transactionally installs nine versioned, deterministic dataset fixtures into the isolated schema. It refuses live mode. Fixture timestamps and payloads remain identical on repeated seed runs, and dashboard edits are preserved.
- All nine card families use the existing generic dataset route and existing components. Fixture storage deliberately uses `dataset_cache`, with fixed versioned keys and no expiry; no synthetic rows enter measurement tables. The fixture model is an explicit fixed snapshot, not a simulation of live collectors.
- Dashboard and detail pages show a synthetic banner. Every demo dataset carries synthetic provenance; cards and their footers identify fixed sample dates rather than fresh measurements. The region fixture includes successful probes and a timeout; other fixtures include warnings, missing dependency/cost values, a prerelease, and active/resolved findings.
- API/CLI collection and all push ingestion are disabled in demo mode. No provider request, checkout scan or private AI file read occurs. Missing fixtures show the seed command; unavailable storage gives a demo setup message; excluded date ranges return explicitly synthetic empty state. None falls back to live data. Existing actionable live missing-config/opt-in states are preserved.
- Added [operator instructions](../DEMO.md), environment examples, seed and test scripts, and both demo suites to root CI.

## Verification

- `pnpm verify` passed (design/font checks, typecheck, lint, 11 dashboard model tests); production build passed.
- Real PostgreSQL at a disposable local `atlas_roadmap` database: `pnpm test:demo` passed all 3 tests. Tests prove nine-family registry coverage, idempotent seed payloads/timestamps, private schema separation, untouched live marker data, zero collector/measurement writes, collection/ingestion refusal, date/limit behavior, missing-seed behavior, and production-open auth refusal.
- Combined auth/cards/collectors/demo backend run passed 37 tests before the additional explicit production-demo auth regression; that additional regression and the other demo tests passed on the final code. Existing live ingestion, collectors, auth, missing requirements, lease locking and cache races remained green.
- `PLAYWRIGHT_CHANNEL=chrome ATLAS_TEST_DATABASE_URL=… pnpm test:e2e:demo` passed **2/2**, desktop 1440×1100 and mobile 390×844, against a fresh production build. The suite invokes the seed CLI on a unique PostgreSQL schema, signs in, creates/reloads a persisted dashboard, renders all nine detail pages, verifies labels, checks no horizontal overflow, checks synthetic empty ranges, and verifies unauthenticated read refusal plus collection/ingestion refusal.
- Browser skill visual review in Chrome confirmed the desktop and mobile canvas, readable demo banner, disabled collection controls, all nine headings, mobile regional detail with the synthetic timeout and fixed fixture timestamp. At 390px the page's scroll width was 390px. Temporary viewport override was reset and the review tab closed.
- The initial browser test iterations exposed test-only mistakes: a nonexistent dashboard selector and a Node HTTP request context that omitted the browser's Secure loopback cookie. The final test uses the actual tab selector and same-origin browser fetch; production cookie policy was preserved.

## Handoff

Phase 9 remains: reproducible packaging/clean install, README/site roadmap claim refresh, release artifacts, complete release CI, deployment checks and v0.1.0 release. This phase does not publish production telemetry or merge main. The static Pages demo remains its own synthetic canvas.
