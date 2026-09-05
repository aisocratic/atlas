# Phase 9 — self-host packaging and 0.1.0 artifacts

Implementation and local package verification completed on 2026-09-05. Publishing the final tag/release, merging main, final CI and checking deployed Pages are parent-managed release gates; this report does not claim those have already happened.

## Delivered

- Package version `0.1.0`, locked pnpm dependencies and a source archive containing the vendored design/fonts, migrations, CLI collectors and synthetic fixtures. No sibling repository is required.
- `pnpm start` launches Next's standalone production server with built static assets, loads runtime environment configuration, forwards termination signals, defaults to loopback, and preserves `--hostname`/`--port` flags used by acceptance suites. `atlas.config.ts` changes require rebuilding; environment changes require restarting.
- A non-root Node 24 Docker image includes the CLI runtime and prepared pnpm cache. Compose supplies persistent PostgreSQL 17 storage, a health dependency, runtime secrets and loopback-only application publishing. The database is not published.
- [DEPLOYMENT.md](../DEPLOYMENT.md) documents verified source and container commands, configuration, TLS/auth, scheduling, backups, upgrades, collector requirements and demo isolation. Contributor and website status claims now describe the implemented application.
- `pnpm release:pack` archives the committed tree deterministically with a versioned directory and generates SHA256SUMS. [Release notes](../releases/v0.1.0.md) describe capabilities, requirements and limits. Generated files live in ignored `dist/` and should be regenerated from the final release commit before publication.
- `pnpm test:package` exercises repeatable setup, real PostgreSQL writes from SEO collection against a local HTTP fixture, demo seed, production startup, rejected anonymous reads, password login, authenticated synthetic dataset responses and all static assets referenced by the login page. It checks explicit launcher port flags override environment values. All test schemas are unique and dropped afterward. CI performs this check for source and Docker, in addition to existing application/browser suites.

## Local verification evidence

- `pnpm verify` passed design integrity, type generation/typecheck, lint and state tests; `pnpm build` passed.
- Source package smoke passed against local PostgreSQL (`atlas_roadmap`): setup applied all three migrations, second setup applied none, `pnpm collect seo-audit` succeeded with four rows written, `pnpm seed` installed nine fixtures, and authenticated production/static checks passed. Generated schema examples: `atlas_package_6acab59c75c8`, `atlas_demo_package_6acab59c75c8` (removed).
- Extracted the committed archive to `/tmp/atlas-clean-release.njptpi/atlas-0.1.0`, with no `.git`, node_modules, build directory or sibling design checkout. `pnpm install --frozen-lockfile`, `pnpm build` and `pnpm test:package` all passed. Generated schemas `atlas_package_2f0da929c390` and `atlas_demo_package_2f0da929c390` were removed.
- Docker Engine 28.0.1 built `atlas:phase9` from `Dockerfile`. The image ran `pnpm test:package` as its non-root runtime user, sharing networking with a disposable PostgreSQL 17 container, and passed the same setup/collector/demo/auth/static checks. The rebuilt image contains its own pnpm cache and starts without a runtime pnpm download.
- Compose configuration was exercised from the clean archive with an override selecting the already-built `atlas:phase9` image: `run --rm atlas pnpm run setup`, `run --rm atlas pnpm seed`, and `up -d --no-build` succeeded. Anonymous dataset reads returned 401; password login and authenticated synthetic dataset reads returned 200. The disposable project containers, network and test volume were removed afterward.
- Focused launcher compatibility check used `--port 4296` with conflicting `PORT=4297`; authenticated package smoke passed on port 4296.

## Final publication gates

Run complete CI on the final branch/merge commit, publish Pages, generate the source archive and checksum from the final release commit, attach them to `v0.1.0`, and inspect the release/deployed site. Only then mark the whole release roadmap complete. Source archives are reproducible for a given committed tree; Docker base tags can receive security updates, so deployments requiring byte-identical images must pin the resolved image digests.

## CI process-lifecycle correction

Final CI exposed an orphaned server after source smoke: terminating only the pnpm wrapper allowed Docker's subsequent test on port 4295 to reach the old password session configuration. The production launcher now imports Next in its own process, and the Docker entrypoint invokes Node directly. The smoke harness uses an isolated process group for pnpm/shell/Node, terminates that whole group, awaits exit, and verifies the listening socket is released. It refuses occupied ports before migrations and detects early startup failure.

Regression evidence: two consecutive source smoke tests and two consecutive Linux Docker smoke tests passed on the same port 4295; each confirmed the socket was free after shutdown. `node scripts/verify-package-port.mjs` proved an occupied port fails before database access. The default Docker entrypoint served setup and stopped promptly with exit 143 on SIGTERM, without forced SIGKILL. CI now repeats source smoke and runs the occupied-port regression before its Docker smoke. `pnpm lint` passed.
