# Synthetic demo workspace

Set up PostgreSQL and authentication as described in [AUTH.md](AUTH.md). Demo uses the same password/trusted-header protections as live mode. Production still refuses open access. A monitored site, repository, provider keys, and AI opt-in files are unnecessary for demo fixtures.

Add these values to `.env.local` alongside `DATABASE_URL` and your authentication settings:

```dotenv
ATLAS_DEMO=true
ATLAS_DEMO_SCHEMA=atlas_demo_preview
```

Then run:

```sh
pnpm seed
pnpm dev
```

`seed` applies the normal append-only migrations before installing all nine card fixtures. Sign in, choose **New dashboard**, and create a dashboard; it includes all nine cards. Arrange, resize, rename and save dashboards normally. Card detail pages also show the demo banner and synthetic provenance.

For a production build, keep these environment values when starting the server and use the normal authenticated setup. Demo does not relax authentication. `ATLAS_SITE_URL` is required in live mode only.

## Isolation and repeatability

- `ATLAS_DEMO` accepts only `true` or `false`; omission means live mode. Live mode uses `ATLAS_SCHEMA` (default `atlas`). Demo ignores it and uses `ATLAS_DEMO_SCHEMA` (default `atlas_demo_preview`). The `atlas_demo_` prefix is reserved and rejected for live `ATLAS_SCHEMA`.
- All nine fixtures are fixed examples dated **2026-09-05 12:00 UTC**, stored as versioned generic dataset envelopes in the demo schema's `dataset_cache`, with no expiration. They never enter measurement tables, collector runs or ingestion storage. Re-running `pnpm seed` restores the same fixture payloads and timestamps without deleting dashboard edits.
- The normal generic `/api/datasets/<id>` route and card components serve the fixtures. Every envelope carries `provenance: "synthetic"`; cards say “synthetic fixture” and “fixed sample dates” rather than claiming fresh measurements. Synthetic probes include a timeout; dependencies/costs demonstrate unknown values; alerts include active and resolved findings.
- A missing fixture produces an actionable seed message. Unavailable demo storage produces a demo setup error. Neither case invokes a live query or collector. Date ranges excluding the fixed snapshot produce an explicitly synthetic empty state. `limit` truncates displayed rows/regions; the fixture is a fixed snapshot, not a time-series query engine.
- Collection through the API or CLI is disabled in demo mode. All push ingestion is refused. No provider calls, local checkout scans or AI usage files are read. Disabled card configuration remains respected.
- To use live measurements, stop the server, set `ATLAS_DEMO=false`, configure the actual site/repository and optional sources, run `pnpm run setup`, and restart. Demo dashboards stay in their isolated schema; live dashboards and measurements are unchanged.

The [Pages canvas](https://aisocratic.github.io/atlas/) is a separate static synthetic demonstration. The application demo exercises PostgreSQL-backed dashboard persistence and the same authenticated dataset routes as the live app.

## Verification

```sh
ATLAS_TEST_DATABASE_URL=postgres://user:password@127.0.0.1:5432/roadmap_test pnpm test:demo
ATLAS_TEST_DATABASE_URL=postgres://user:password@127.0.0.1:5432/roadmap_test pnpm test:e2e:demo
```

Tests require an explicitly local test/roadmap database, create unique schemas, and remove only those schemas afterward. Install Playwright Chromium for browser tests, or use `PLAYWRIGHT_CHANNEL=chrome` if Chrome is already installed. The browser suite verifies authentication, all nine detail pages, synthetic labels, disabled collection, responsive widths, persisted dashboard creation and empty ranges on desktop and mobile.
