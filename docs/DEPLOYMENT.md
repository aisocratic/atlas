# Self-host Atlas 0.1.0

The release source archive contains the application, collectors, SQL migrations, synthetic fixtures, licensed fonts and the vendored design package. It requires no sibling checkout. Supported runtime: Node 24, pnpm 9.8.0 and PostgreSQL 14 or newer. The lockfile pins JavaScript dependencies. Container base image tags receive upstream security updates; record image digests in your own deployment for byte-identical container rebuilds.

## Source deployment

Download `atlas-0.1.0-source.tar.gz` and `SHA256SUMS` from the GitHub release. Verify with `sha256sum -c SHA256SUMS` (macOS: `shasum -a 256 -c SHA256SUMS`), extract the archive and enter its directory.

```sh
corepack enable
corepack prepare pnpm@9.8.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
# Fill DATABASE_URL, ATLAS_SITE_URL, ATLAS_APP_URL and independent auth secrets.
pnpm run setup
pnpm build
pnpm start
```

`pnpm run setup` is the Atlas migration command; `pnpm setup` is an unrelated pnpm built-in. Setup is repeatable and uses transactional, append-only migrations. The production launcher serves Next's standalone server and copies built static assets, including fonts. It loads `.env.local`, defaults to `127.0.0.1:3000`, and accepts `PORT` and `ATLAS_HOST`. Keep the installed dependencies and application sources: the CLI uses TypeScript at runtime. A `.next` directory alone is not the release package.

Environment variables are read at runtime, so database credentials, authentication, demo mode and monitored site can change without rebuilding. `atlas.config.ts` is compiled into the server: rebuild after changing card configuration, and restart the server and collectors together to keep their settings consistent. Repository metrics and AI usage require explicitly mounted local inputs; see [collector configuration](COLLECTORS.md). Do not mount a checkout or usage logs unless those collectors are intended.

Put a TLS reverse proxy in front of the loopback port, set `ATLAS_APP_URL=https://atlas.example.com`, and configure password or trusted-header authentication as described in [AUTH.md](AUTH.md). Open mode deliberately refuses production telemetry access. Run the server under a service manager, with automatic restart and the project directory as its working directory. `/login` is a liveness endpoint, not a database readiness check. Verify an authenticated dataset request after setup to check database access.

## Docker Compose

Docker Engine and the Compose v2 plugin are required. From the extracted source directory:

```sh
cp .env.example .env
# Edit .env: fill auth secrets/site/origin and add POSTGRES_PASSWORD.
# Use an alphanumeric/hex database password so the generated URL needs no escaping.
docker compose build
docker compose run --rm atlas pnpm run setup
# Optional: set ATLAS_DEMO=true in .env, then seed its isolated schema.
# docker compose run --rm atlas pnpm seed
docker compose up -d
```

Compose waits for PostgreSQL health and persists data in `atlas-data`; the database has no published port. The app runs as the non-root `node` user and publishes only loopback port 3000. Use an HTTPS proxy and the matching canonical origin for remote access. The image includes the same setup/seed/collector commands as source deployment. No credentials or `.env` files are copied into the image. Compose injects `.env` at runtime and overrides `DATABASE_URL` to its database service. For an existing PostgreSQL server, run the image directly with `--env-file .env.local` and a reachable `DATABASE_URL` instead.

After changing image or configuration, run `docker compose run --rm atlas pnpm run setup` and `docker compose up -d --build`. Configuration changes in `atlas.config.ts` require rebuilding. Logs: `docker compose logs -f atlas`. Stop without removing data: `docker compose down`.

## Collect and schedule

In live mode, after configuring the monitored site/repository:

```sh
pnpm collect seo-audit
pnpm collect region-latency
pnpm collect releases
# Container equivalent:
docker compose run --rm atlas pnpm collect seo-audit
```

Collectors persist run history, hold a database lock against duplicate execution and return a nonzero exit status on failure (3 means already running). Optional collectors explain missing keys or inputs; [COLLECTORS.md](COLLECTORS.md) lists their exact requirements. Demo mode refuses collection and ingestion. [DEMO.md](DEMO.md) explains fixture seeding and isolation.

Example cron entry, with pnpm available on the scheduler's PATH:

```cron
*/30 * * * * cd /srv/atlas && /usr/local/bin/pnpm collect seo-audit >> /var/log/atlas-collect.log 2>&1
```

Alternatively, schedule `POST /api/collect/seo-audit` with `Authorization: Bearer $ATLAS_COLLECTOR_TOKEN`; this credential grants collection only. Keep secrets in scheduler configuration, not committed scripts. See [AUTH.md](AUTH.md).

## Backups, upgrades and verification

Back up PostgreSQL with `pg_dump` and test restores before upgrades. Retain environment configuration securely. Stop collectors during an upgrade, install the new locked dependencies, run `pnpm run setup`, rebuild and restart. Do not edit applied migrations. Rolling back application code may require restoring a compatible database backup; migrations are forward-only. Schema deletion and removing the Compose data volume destroy stored telemetry and dashboards.

```sh
ATLAS_TEST_DATABASE_URL=postgres://roadmap:password@127.0.0.1:5432/roadmap_test pnpm test:package
```

After a production build this check uses unique disposable schemas, executes migrations twice, collects SEO against a local HTTP fixture into real PostgreSQL, seeds demo data, starts the standalone server and verifies unauthorized access, login, authenticated synthetic datasets and every static asset referenced by the login page. It removes only its generated schemas. CI runs it after a frozen clean dependency install and also builds and smoke-tests the Docker image.

Maintainers create the deterministic source artifact from a clean committed tree with `pnpm release:pack`; output is in `dist/`. Build it twice and compare SHA-256 values. Publish the archive, `SHA256SUMS` and [release notes](releases/v0.1.0.md) only after release CI passes.
