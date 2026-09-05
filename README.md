# Atlas

**A self-hostable engineering and web-ops dashboard that measures your site and
your repo, and keeps the results itself.**

Atlas is a drag-to-arrange canvas of telemetry cards. It is not a BI viewer you
point at tables you already have: it ships its own collectors — Lighthouse and
Core Web Vitals, SEO audits, region latency probes, repo metrics, releases,
server errors, real-user monitoring — and owns the schema they write to. Point it
at any Postgres, run one command, and the cards fill in.

> **Status: early.** Atlas is being extracted from a private codebase where it
> has run in daily use. Phases land incrementally — see [the roadmap](#roadmap).
> Not yet ready to run.

## Why it exists

- **It measures, it doesn't just display.** Every card has a collector behind
  it. `pnpm collect region-latency` writes rows; the card reads them. No glue.
- **A card is one folder.** `cards/<id>/` holds the component, the dataset
  query, the collector and the explainer. Adding your own card is four files
  and one line of config — no route, no barrel, no anchor constant.
- **Zero keys on day one.** Region latency, SEO audits and releases need no API
  keys. Three datasets are live about ninety seconds after `pnpm setup`.
- **You own the data.** One Postgres *schema* (default `atlas`), plain SQL, no
  ORM, no vendor. `DROP SCHEMA atlas CASCADE` is a clean uninstall.

## Run the website

The runnable part of this repository is the static project website and dashboard
illustration in `site/`. The application, database, and collectors below describe
the intended product and are not implemented yet.

```bash
git clone https://github.com/aisocratic/atlas && cd atlas
python3 -m http.server 4175 --directory site
```

Open http://localhost:4175. No Node dependencies, database, or sibling repository
are needed. The dashboard preview uses illustrative data.

[Website](https://aisocratic.github.io/atlas/) ·
[Shared design](https://aisocratic.github.io/stoa/) ·
[Agora](https://aisocratic.github.io/agora/)

## Planned cards

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

## Planned configuration

`atlas.config.ts` at the repo root: your site URL, which cards are enabled, and
any overrides. The database is one variable, `DATABASE_URL`.

## Planned security model

Three auth adapters ship: open (the default, refuses to serve in production),
a shared password, and a trusted identity header for use behind Cloudflare
Access, oauth2-proxy, Authelia or Tailscale. Collectors are triggered with a
session or a bearer secret. See `docs/AUTH.md`.

## Roadmap

- [ ] **Phase 0** — scaffold, design substrate, one rendered card
- [ ] **Phase 1** — vendored UI substrate, fonts, tokens
- [ ] **Phase 2** — storage: pool, migrations, the seventeen tables
- [ ] **Phase 3** — the frame: canvas layout, cache, saved arrangements
- [ ] **Phase 4** — the card registry and the two generic routes
- [ ] **Phase 5** — first vertical slice: region latency
- [ ] **Phase 6** — the remaining cards
- [ ] **Phase 7** — demo mode, seed data, fixtures
- [ ] **Phase 8** — auth adapters and the setup screen
- [ ] **Phase 9** — packaging and `v0.1.0`

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
```

For a published release, use `node site/scripts/sync-design.mjs --version X.Y.Z`.
The checked-in stylesheet keeps a clean clone independent of package availability
and sibling checkouts. Commit the stylesheet and metadata together when updating.

Before a pull request, run the integrity check, serve `site/`, and check desktop
and mobile layouts, navigation, and the dark → light → system theme cycle.
The Pages workflow verifies integrity and deploys `site/` when changes reach
`main`. Application tests and database commands will arrive with their roadmap
phases; there are no `pnpm dev`, `pnpm setup`, or collector commands yet.

## License

MIT © AI Socratic. The design system is [`@aisocratic/design`](https://github.com/aisocratic/stoa).
Fonts are Space Grotesk, Newsreader and JetBrains Mono under the SIL Open Font
License 1.1, loaded by the website.
