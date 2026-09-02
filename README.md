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

## Quick start

```bash
git clone https://github.com/aisocratic/atlas && cd atlas
pnpm install
docker compose up -d db        # or set DATABASE_URL to any Postgres 14+
pnpm setup                     # creates the schema, migrates
pnpm collect region-latency seo-audit releases
pnpm dev
```

Open http://localhost:3000. Prefer to look before you install? `pnpm demo`
renders every card against fixture data and never opens a database connection.

## The cards

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

## Security model

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

## Development

```bash
pnpm verify      # typecheck + lint + unit tests
pnpm test:e2e    # Playwright
```

Stack: Next.js 16, React 19, Tailwind v4, Recharts, `pg` with hand-written SQL,
Postgres 14+.

## License

MIT © AI Socratic. Fonts are Geist and Geist Mono under the SIL Open Font
License 1.1, self-hosted at build time.
