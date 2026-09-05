# Atlas roadmap completion contract

**Stopped at user request on 2026-09-05.** See [the checkpoint](CHECKPOINT.md) for unfinished work and verification limits.

Source: the ten numbered phases in `README.md` and `site/index.html`, plus the card, collector, registry, configuration, setup and auth examples on the site. The existing Pages canvas is a useful demo, but does not by itself satisfy the application and collector roadmap.

Each phase is assigned to a separate agent goal with evidence in `docs/phases/`. The parent manages dependency order, shared interfaces, integration and release checks.

| Phase | Dependencies | Required result | State |
|---|---|---|---|
| 0 | None | Runnable application scaffold using the shared design, with one rendered telemetry card | Complete — `docs/phases/phase-0.md` |
| 1 | 0 | Portable vendored Stoa UI substrate, licensed open fonts, warm light/dark tokens and consistent application chrome | Complete — `docs/phases/phase-1.md` |
| 2 | None; integrate 0 | PostgreSQL pool, safe configurable schema, append-only migrations and seventeen meaningful tables with real database tests | Complete — `docs/phases/phase-2.md` |
| 3 | 0, 1, 2 | App canvas frame, dataset cache and persisted independent named/resizeable/reorderable layouts | Complete — `docs/phases/phase-3.md` |
| 4 | 0, 2 | Card registry, generic dataset and collection routes, collector CLI/run locking, missing-requirement visibility and config enable/disable | Complete — `docs/phases/phase-4.md` |
| 5 | 2, 4 | Real region-latency vertical slice: Globalping request/poll, stored measurements, query, rendered data, freshness and failure states | Complete — `docs/phases/phase-5.md` |
| 6 | 2, 4, 5 contract | Remaining performance/CWV, SEO, code quality, releases, errors, real users, opt-in AI usage and derived anomalies groups, with real collectors/ingestion and views | In progress |
| 7 | 3, 4, 6 | Explicit demo mode, deterministic seeds and fixtures for all cards, useful empty/missing-config states | Pending |
| 8 | 0, 2; integrate all routes | Open/password/trusted-header auth, setup screen, secure sessions and collector bearer access; production open mode refuses telemetry access | Complete — `docs/phases/phase-8.md` |
| 9 | All | Reproducible self-host packaging/setup/collection commands, deployment docs, verified clean install and version 0.1.0 release artifacts | Pending |

## Integration gates

- A card is a folder with component, dataset query, collector and explainer; adding a card requires registry/config registration rather than new routes.
- `pnpm collect <id>`, `POST /api/collect/<id>` and documented cron usage use the same execution layer; run freshness is persisted and concurrent duplicate runs are prevented.
- No-key region latency, SEO and releases run with site/repo configuration. Optional requirements remain visibly explained. Never invent measurements or pass fixtures off as live data.
- RUM/error/page-view push ingestion is bounded and configured; AI usage reads only configured opt-in sources.
- One validated schema isolates Atlas from other tables. Migrations/setup/seed can be verified on an isolated real PostgreSQL database.
- Named layouts, resizing, drag/reorder and mobile/keyboard alternatives remain functional in the app and Pages demo, with the shared Stoa design.
- Full auth, storage, collectors, build, packaging and browser checks pass before marking the roadmap complete.
