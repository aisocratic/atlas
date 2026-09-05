# Phase 0 — application scaffold

Completed 2026-09-05.

Atlas now has a Next.js 16.3 / React 19 App Router application alongside the
existing standalone Pages website. The application renders a semantic region
latency card using the shared Stoa `MetricCard` and `cardSurface`. Its data is
explicitly labeled as illustrative; no database or external service is needed
to open the application.

## Run

Requires Node.js 22.6 or newer and the package-manager version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
# http://localhost:3000
pnpm build
pnpm start
```

The current build also emits `.next/standalone` for the packaging phase. Next
prints a standalone-output notice with `pnpm start`; the normal local production
server was verified. Container assembly and its standalone entry point belong
to Phase 9.

The static website keeps its independent workflow:

```sh
python3 -m http.server 4175 --directory site
```

## Foundation and handoff

- `app/layout.tsx`, `app/page.tsx`, and `app/globals.css` define the initial app.
- `components/telemetry-card.tsx` is a server-rendered sample with a named
  section, heading, metric, definition list, and plain-language explanation.
- `@aisocratic/design` comes from the checked-in
  `vendor/aisocratic-design-0.2.0.tgz`, packed from the built Stoa checkout.
  `vendor/design.json` records source revision and archive SHA-256. A clean
  installation has no sibling repository dependency.
- `pnpm design:check` checks both the application archive and the existing
  static CSS. `pnpm design:sync /path/to/built/stoa` refreshes the application
  archive and installation; the existing `site/scripts/sync-design.mjs` remains
  the explicit static stylesheet refresh command.
- Tailwind v4 consumes the shared theme and scans its component classes.
  Phase 1 owns local font loading, theme controls, and substrate refinement.
- Strict TypeScript uses the `@/*` alias and bundler module resolution. The
  manifest provides `pg`, `@types/pg`, and `tsx` plus the Phase 2 setup,
  migration, schema, and storage-test entry points.
- Phase 3 can replace the initial page content with the canvas. The `site/`
  canvas, state/storage adapters, static tests, and Pages deployment remain
  intact.

## Verification evidence

- `pnpm install --frozen-lockfile` passed.
- `pnpm verify` passed: both design integrity checks, generated Next route
  types, strict TypeScript, ESLint, and 11 canvas state/storage tests.
- `pnpm build` passed, prerendering `/` and `/_not-found`.
- A production server on `127.0.0.1:4180` returned HTTP 200. A headless Chrome
  smoke check at 1440px and 390px verified the named region, `184 ms` metric,
  computed shared card background/radius, no horizontal overflow, and no
  JavaScript errors.
- `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e` passed: 8 tests, 2 intentional
  device-specific skips. The default bundled Chromium was absent locally;
  installed Chrome was used via the repository's documented channel option.

No deployment or production database access was performed.
