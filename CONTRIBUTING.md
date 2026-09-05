# Contributing to Atlas

Atlas includes a Next.js application, PostgreSQL storage, authenticated dashboards, nine telemetry cards and collectors, plus a separate static Pages demonstration. See [README.md](README.md) for local setup and [deployment](docs/DEPLOYMENT.md) for the production package.

Use Node 24 and pnpm 9.8.0. Install with `pnpm install --frozen-lockfile`, configure `.env.local` from `.env.example`, run `pnpm run setup`, then `pnpm dev`. Application tests require a local disposable PostgreSQL database with `test` or `roadmap` in its name; set `ATLAS_TEST_DATABASE_URL`. Each database suite creates and removes its own schemas.

Before opening a pull request:

```sh
pnpm verify
pnpm test:storage
pnpm test:cards
pnpm test:region
pnpm test:collectors
pnpm test:demo
pnpm test:auth
pnpm test:canvas
pnpm build
pnpm test:package
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:auth
pnpm test:e2e:app
pnpm test:e2e:canvas
pnpm test:e2e:collectors
pnpm test:e2e:demo
```

Run browser suites sequentially because they share the Next build directory. `PLAYWRIGHT_CHANNEL=chrome` uses installed Chrome. CI also verifies Docker packaging. Exercise desktop/mobile layouts, light/dark/system themes, independent dashboard tabs, naming, drag/drop, keyboard and pointer resizing, undo and persistence. Keep canvas state changes immutable.

A card follows [CARDS.md](docs/CARDS.md); provider contracts and source requirements are in [COLLECTORS.md](docs/COLLECTORS.md). Add append-only SQL migrations rather than changing applied files. Never label synthetic fixtures as live telemetry. Preserve the auth/CSRF and demo isolation contracts.

Keep shared appearance in [`@aisocratic/design`](https://github.com/aisocratic/stoa). The vendored package and stylesheet make a clean clone independent of sibling repositories. `pnpm design:check` checks integrity; consult [DESIGN.md](docs/DESIGN.md) before refreshing the vendor files. For static-only work, `python3 -m http.server 4175 --directory site` serves the public demo.

Report security issues through [SECURITY.md](SECURITY.md), not public issues. Contributions are accepted under MIT.
