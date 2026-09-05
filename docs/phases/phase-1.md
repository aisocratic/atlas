# Phase 1 — portable UI substrate

Completed 2026-09-05. Design contracts and maintenance instructions are in
[`../DESIGN.md`](../DESIGN.md).

## Delivered

- Direct use of the vendored Stoa `SiteHeader`, `PageHeader`,
  `SegmentedControl`, `Button`, brand `LogoMark`, `MetricCard`, and `cardSurface`.
  The package remains portable through the Phase 0 checked-in archive.
- `next/font/local` fills all three root `html` slots. Space Grotesk,
  Newsreader normal/italic, and JetBrains Mono are vendored with their original
  OFL-1.1 notices and a pinned source revision/URL/SHA-256 manifest. There is no
  font-provider dependency at build or runtime and no Sentient asset.
- The body now uses `font-body`, ensuring the shared font slot takes precedence
  over Tailwind's generic sans family. Shared warm light/dark tokens are used
  without a parallel application palette.
- Shared header, page title, compact footer actions, consistent `page-shell`
  gutters, and a keyboard skip link. The card/sample data and Pages canvas are
  unchanged.
- Light, Dark, and System preferences use an accessible shared segmented
  control and the `atlas-theme` storage key. System follows the OS; explicit
  choices remain selected across reloads.
- `pnpm design:check` now verifies all font and license asset hashes in addition
  to the existing application archive/static stylesheet checks.
- A separate reusable app Playwright configuration and
  `tests/app/substrate.spec.mjs`; run via `pnpm test:e2e:app`.

## Verification

- `pnpm verify` passed: archive/static/font integrity, route type generation,
  strict TypeScript, lint, and 11 existing canvas unit tests.
- `pnpm build` and `pnpm install --frozen-lockfile` passed.
- `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e:app` passed all 4 cases across desktop
  (1440px) and mobile (390px). Tests prove the shared header/footer/semantic
  card render; root font slots match computed body/display/code families;
  fonts load locally; no browser errors or external requests occur; there is
  no horizontal overflow; and system, explicit, persisted, and keyboard theme
  interactions behave correctly.
- Desktop/mobile screenshots from the passing suite were visually inspected
  for aligned gutters, legible typography, card surface, controls, and footer.
- The new test/config files also passed ESLint directly.

The browser check uses installed Chrome because bundled Chromium is absent in
the local environment. No deployment, database, collector, or canvas changes
were performed in this phase.
