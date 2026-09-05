# Card extension contract

Each `cards/<id>/` folder owns `info.ts`, `component.tsx`, `dataset.ts`, and
`collector.ts`. Browser-safe metadata is registered in `cards/registry.ts` and
views in `cards/components.ts`. Server definitions are registered with
`defineCard` in `cards/server.ts`. Never import the server registry or runtime
configuration into a client component.

Use extensionless relative imports (or the `@/` alias) in app-reachable
TypeScript. Turbopack does not resolve an explicit `.js` suffix to a `.ts`
source even though TypeScript and `tsx` accept that spelling.

`lib/cards/types.ts` defines `CardInfo`, `CardProps<T>`, and
`DatasetEnvelope<T>`. The envelope's status is `ready`, `empty`,
`missing-config`, `error`, or `disabled`, with `data`, `updatedAt`, `stale`,
optional `reason`/`error`/`missing`, a sanitized latest `run`, and cache metadata.
Enabled cards stay visible when configuration is missing. Disabled cards may be
removed from the canvas; opting in to sensitive sources is separate from
enabling a card.

Server definitions use `lib/cards/define.ts`:

```ts
defineCard({
  info,
  requirements: ({ config, options, env }) => [], // explicit actionable reasons
  targetKey: ({ config }) => config.siteUrl ?? "default",
  dataset: async ({ db, config, options, env, query }) => ({
    data: null, empty: true, measuredAt: null,
  }),
  collector: {
    timeoutMs: 120_000,
    collect: async ({ config, options, env, signal, runId, fetch }) => {
      // Fetch/parse bounded provider data here. Respect signal in all I/O.
      // Do not write telemetry until the execution layer calls publish.
      return {
        publish: async (tx) => {
          // Use tx.table / parameterized SQL or insertTelemetry(tx,...).
          // Attach runId to run-backed telemetry rows.
          return { rowsWritten: 0 }
        },
      }
    },
  },
})
```

`dataset` returns JSON-compatible data, an explicit empty indication, and an
optional source measurement timestamp. A collector fetches outside the database
transaction and returns a `publish(tx)` callback. Execution invokes that
callback inside `completeCollectorRun`, which fences the lease and commits
telemetry, successful run state, and cache invalidation together. Never retain
`tx` after the callback or write directly through an independent pool.
The abortable deadline bounds external collection work. Once publication
begins, execution awaits the database transaction's atomic result under the
pool's connection/statement timeouts, rather than racing a successful COMMIT
against an HTTP timeout. Keep publication limited to bounded database work.

Datasets must filter by the configured source/target. The service hashes the
target plus site/repository/path/options into lease and cache identity, and
includes the latest successful run in the cache generation. This prevents a
late old read from repopulating a newly invalidated active cache. Those keys
do not replace source filtering inside the dataset SQL.
Push-backed cards additionally implement `cacheVersion(context)`, returning
their source's monotonic ingestion revision. Ingestion increments that revision
and invalidates the card cache in its publication transaction, so a racing
pre-ingestion read cannot refill the active cache generation.

The runtime will serve `GET /api/datasets/<id>` and `POST /api/collect/<id>`;
`pnpm collect <id>` shares the execution layer for shell/cron usage. Dataset
queries support `since`, `until`, and `limit` (1–1000). Unknown/disabled cards
are rejected, and collector requirements are checked before acquiring a run.
POST requests have no body; targets and options come from local configuration.
Responses use `Cache-Control: private, no-store`; reusable caching happens in
the configured Atlas database rather than in a shared HTTP cache.

`lib/cards/handlers.ts` is the generic route implementation. It authorizes
reads with action `read` and collection with action `collect` through
`lib/auth.ts`; no database or configuration access precedes authorization.
Browser collection calls follow the session/CSRF contract in the auth docs.
Collectors may throw `CollectorError` only for deliberately public messages.
Unexpected exceptions are replaced with a bounded generic failure; provider
responses, credentials, SQL errors, and raw stacks must never be placed in a
public error message.

The CLI is a local administrative entry point. It loads `.env.local` and
`.env` through Next's environment loader, while respecting process overrides:

```sh
pnpm collect region-latency
# cron, with the deployment's environment exported by the job runner:
# */15 * * * * cd /opt/atlas && pnpm collect region-latency
```

It writes one JSON result and exits 0 for success, 3 for an already-running
collection, 2 for invalid CLI usage, or 1 for another failure. Phase 9 owns the
deployment packaging entry points.

`atlas.config.ts` accepts site URL, repository (`owner/name`), repository path,
cache TTL, collector deadline, and `cards: { id: boolean | { enabled, optIn,
options } }`. Environment overrides are `ATLAS_SITE_URL`, `ATLAS_REPOSITORY`,
and `ATLAS_REPOSITORY_PATH`. Provider secrets are read from the collector's
`env` context and never placed in `CardInfo` or returned envelopes.

The region card implements the real Globalping HTTP measurement vertical
slice; see [`REGION-LATENCY.md`](REGION-LATENCY.md). Provider simulators remain
under tests and are never served as live telemetry.
