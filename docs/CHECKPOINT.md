# Roadmap checkpoint — resumed

Work resumed at user request on 2026-09-05. This branch is not yet a finished release.

- Phases 0–8 have completed implementation and verification evidence in `docs/phases/`.
- Phase 6 final integration audit passed: 60 combined backend tests (including 13 collector tests), production desktop/mobile collector browser tests, and `pnpm verify`. Focused regressions cover bounded short/growing file reads, mixed AI source/session exports, and atomic preservation of source snapshots after invalid imports. See `docs/phases/phase-6.md`.
- Phase 7 explicit demo mode and deterministic seeds are complete: nine synthetic fixtures in an isolated reserved schema, no measurement writes, production auth preserved, 3 demo backend tests and desktop/mobile production browser acceptance passed. See `docs/phases/phase-7.md`. Phase 9 packaging and local clean-install/container verification are complete; final publication remains pending. See `docs/phases/phase-9.md`.
- The root CI workflow includes storage/auth/registry/region/collector/canvas checks and their browser suites. Clean extracted archive and Docker package smoke checks passed. Full release CI and deployment verification remain release gates.
- Complete final CI, merge to main, verify deployed Pages, then regenerate and publish the 0.1.0 source archive and checksums with the release.
- No production deployment is part of this checkpoint. The already-published Pages version stays on main.

The resumed phase 6 checks used generated fixtures and isolated schemas in a disposable local PostgreSQL database. No real private AI histories or production database were accessed.
