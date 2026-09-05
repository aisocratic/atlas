# Atlas

**A self-hostable engineering and web-ops dashboard that measures your site and
your repo, and keeps the results itself.**

Atlas is a drag-to-arrange canvas of telemetry cards. It is not a BI viewer you
point at tables you already have: it ships its own collectors — Lighthouse and
Core Web Vitals, SEO audits, region latency probes, repo metrics, releases,
server errors, real-user monitoring — and owns the schema they write to. Point it
at any Postgres, run one command, and the cards fill in.

> **Status: v0.1.0.** The Next.js application, PostgreSQL storage,
> authentication, and generic card/collector framework are implemented and tested.
> The public GitHub Pages canvas uses sample data. Follow the
> [phase evidence](docs/ROADMAP.md) for implementation evidence and [deployment instructions](docs/DEPLOYMENT.md) for source and Docker installation.

## Why it exists

- **It measures, it doesn't just display.** Every card has a collector behind
  it. `pnpm collect region-latency` writes rows; the card reads them. No glue.
- **A card is one folder.** `cards/<id>/` holds the component, dataset query,
  collector and explainer. Register its metadata, view and server definition;
  the existing generic routes handle it. See [the card contract](docs/CARDS.md).
- **Zero keys on day one.** Region latency, SEO audits and releases need no API
  keys. Configure the monitored site/repository, run `pnpm run setup`, then run
  the collectors. Collection time and availability depend on each provider.
- **You own the data.** One Postgres *schema* (default `atlas`), plain SQL, no
  ORM, no vendor. `DROP SCHEMA atlas CASCADE` is a clean uninstall.

## Run the website

The public project website and interactive demo canvas are in `site/`. Create
named dashboard tabs, drag and resize cards, and return to your saved layouts.
Metrics are sample data; the demo does not connect to the application database.

```bash
git clone https://github.com/aisocratic/atlas && cd atlas
python3 -m http.server 4175 --directory site
```

Open http://localhost:4175. No Node dependencies, database, or sibling repository
are needed. Serve over HTTP as shown so the browser can load JavaScript modules.
The dashboard uses illustrative data.

## Run the application

Use Node 22.6+ and the pnpm version declared in `package.json`:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Configure your PostgreSQL URL, monitored site and authentication secrets.
pnpm run setup
pnpm dev
```

Open http://127.0.0.1:3000. The setup screen explains incomplete configuration.
The development server binds to loopback. For production, configure password
or trusted-proxy authentication and the canonical dashboard origin before
building; open authentication refuses production access. See
[authentication and setup](docs/AUTH.md), [storage implementation](docs/phases/phase-2.md), and
[card development](docs/CARDS.md).

[Website](https://aisocratic.github.io/atlas/) ·
[Shared design](https://aisocratic.github.io/stoa/) ·
[Agora](https://aisocratic.github.io/agora/)

## Dashboard controls

- **New dashboard** creates and selects an independent layout with the sample cards.
- **Rename** changes the active dashboard name without changing its layout.
- **Edit layout** exposes Move handles, size controls, and resize corners. On a
  desktop, cards move on a 12-column grid; occupied cards move down to make room.
- Drag a Move handle or use its arrow keys. The ↑ / ↓ buttons change reading
  order without dragging. On small screens, cards form a single column and
  dragging changes their order; desktop widths are retained.
- Drag a resize corner or use its arrow keys. Width/height menus provide the
  same controls without dragging; mobile layouts use full available width.
- **Undo** (also Ctrl/⌘+Z while editing) reverses the last change. **Tidy layout**
  fills empty spaces. **Done** hides editing controls.

Layouts, names, and the active tab save to this browser's local storage. They
survive reloads on the same origin but do not sync across devices or users.
Storage errors are shown in the toolbar; in that case edits remain in memory.
Unreadable old saves are preserved rather than overwritten. The storage adapter
in `site/dashboard/storage.mjs` is separate from the canvas state model.

## Cards

| group | what it shows | collector |
|---|---|---|
| Performance | Lighthouse scores, Core Web Vitals per route | `lighthouse` |
| Real users | field LCP / INP / CLS from a tiny beacon | push-ingested |
| SEO | per-page audit findings and score history | `seo-audit` |
| Region latency | TTFB from a dozen regions, via Globalping | `region-latency` |
| Code quality | duplication, complexity, dependency health | `repo-metrics` |
| Releases | deploy cadence and what shipped when | `releases` |
| Errors | server error rate and top messages | push-ingested |
| AI usage | token spend across coding-agent CLIs | `ai-usage` (opt-in) |
| Anomalies | what changed, deep-linked to the card that saw it | derived |

Cards you don't need are one line in `atlas.config.ts` to disable. A card whose
requirements aren't met stays on the grid and says why, rather than vanishing.

## Configuration

`atlas.config.ts` at the repo root: your site URL, which cards are enabled, and
any overrides. The database is one variable, `DATABASE_URL`.

## Security

Three auth adapters are available: loopback development only, a shared password,
and a trusted identity header plus a proxy secret. Browser sessions require CSRF
validation for writes. Optional bearer credentials permit collection only.
See [authentication](docs/AUTH.md) and [security policy](SECURITY.md).

## Roadmap

- [x] **Phase 0** — scaffold, design substrate, one rendered card
- [x] **Phase 1** — vendored UI substrate, fonts, tokens
- [x] **Phase 2** — storage: pool, migrations, the seventeen tables
- [x] **Phase 3** — the frame: canvas layout, cache, saved arrangements
- [x] **Phase 4** — the card registry and the two generic routes
- [x] **Phase 5** — first vertical slice: region latency
- [x] **Phase 6** — the remaining cards
- [x] **Phase 7** — demo mode, seed data, fixtures
- [x] **Phase 8** — auth adapters and the setup screen
- [x] **Phase 9** — packaging and `v0.1.0`

## Design and development

The site imports `@aisocratic/design` from the
[Stoa repository](https://github.com/aisocratic/stoa). `site/vendor/design.css`
is an exact copy of the generated `dist/css/site.css`, including tokens,
typography, shared header, mobile menu, hero, buttons, and footer. Atlas-specific
preview and content styles live in `site/styles.css`.

The package version and SHA-256 are recorded in `site/vendor/design.json`.
Refresh an unpublished local build and verify the checked-in dependency:

```bash
# In a Stoa checkout: pnpm install && pnpm build
node site/scripts/sync-design.mjs ../stoa
node site/scripts/sync-design.mjs --check
node --test tests/dashboard.test.mjs
```

For a published release, use `node site/scripts/sync-design.mjs --version X.Y.Z`.
The checked-in stylesheet keeps a clean clone independent of package availability
and sibling checkouts. Commit the stylesheet and metadata together when updating.

Browser regression tests use Playwright as a development-only dependency:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
```

The suite starts its own static server and covers desktop and mobile input.
To use an installed Chrome instead of downloading Chromium, run
`PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`.

Before a pull request, run the integrity check, serve `site/`, and check desktop
and mobile layouts, navigation, and the dark → light → system theme cycle.
The Pages workflow runs the canvas/state/storage tests, verifies design integrity,
and deploys `site/` when changes reach `main`. The tests cover independent boards,
collision handling, resize bounds, keyboard/button ordering, persistence, and
storage failures. Browser checks cover actual tab, dialog, drag, resize, theme,
and mobile interactions. The application CI separately verifies real PostgreSQL
storage, card execution, authentication and production browser workflows.

## License

MIT © AI Socratic. The design system is [`@aisocratic/design`](https://github.com/aisocratic/stoa).
Fonts are Space Grotesk, Newsreader and JetBrains Mono under the SIL Open Font
License 1.1, loaded by the website.

### Application demo

For an authenticated PostgreSQL-backed workspace with all nine synthetic cards, see [Demo setup and isolation](docs/DEMO.md). Enable `ATLAS_DEMO=true` and run `pnpm seed`; fixtures and dashboard changes stay in a reserved demo schema.
