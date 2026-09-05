# Region latency

The card measures overall HTTP time to first byte through Globalping. It uses
structured HTTP timings in milliseconds: DNS + TCP + TLS for HTTPS + the
post-connection first-byte wait. HTTP has no TLS phase. Missing timing phases
remain unavailable; HTTP errors and failed/offline probes remain visible.
This is a HEAD-request measurement, not visual page loading or field Core Web
Vitals. See the [Globalping schema](https://github.com/jsdelivr/globalping/blob/master/public/v1/components/schemas.yaml)
for protocol and timing definitions.

## Configure and collect

Set `ATLAS_SITE_URL`, or `siteUrl` in `atlas.config.ts`, plus `DATABASE_URL`.
Run `pnpm run setup`, then `pnpm collect region-latency`. No Globalping key is
required. An optional `GLOBALPING_TOKEN` stays server-side. CLI commands load
the same `.env.local`/`.env` files as the application.

The default requests one probe in each of 12 countries. Optional card settings:

```ts
cards: {
  "region-latency": {
    enabled: true,
    options: {
      paths: ["/", "/docs?lang=en"],
      regions: [
        { key: "us", label: "United States", country: "US" },
        { key: "gb-london", label: "London", country: "GB", city: "London" },
      ],
      protocol: "HTTPS", // HTTP for http URLs; HTTPS or HTTP2 for https URLs
    },
  },
}
```

Paths stay on the configured origin, and their query strings are preserved.
Without `paths`, the configured site's path and query are used. The hostname,
port, protocol, path, and query are sent in their documented Globalping fields.
Each region/path pair has its own measurement ID so probe results cannot be
misattributed when a location has no available probe.

Collections allow 1–12 regions and 1–3 paths, with at most four active requests.
Probe timeout is 10 seconds; client measurement timeout is 45 seconds with
additional bounded HTTP/polling limits. The shared collector deadline is at
most 120 seconds by default. Rate limits and provider errors are not retried
aggressively. If every provider request fails, the run fails with no fabricated
samples. If a provider measurement completes but the target/probe fails, its
failure is stored as an explicit regional result. A partial collection preserves
both valid measurements and unavailable regions.

`GLOBALPING_API_URL` can point to a compatible HTTPS endpoint. Plain HTTP is
accepted only for loopback provider tests, preventing credentials from being
sent over an insecure remote transport.

## Storage and presentation

Samples and refreshed UTC daily aggregates publish in the shared lease-fenced
transaction. Daily aggregates include the canonical full source URL in their
primary key, so sites with identical paths remain separate. URL advisory locks
serialize overlapping aggregate refreshes; UTC bounds remain correct even when
a database transaction uses a different timezone. Successful runs invalidate
cached datasets atomically.

Queries filter canonical URLs and configured region keys. Both readings and
history use the exact half-open timestamp range `[since, until)`, defaulting to
the previous 30 days. History recomputes its daily groups from samples inside
that range, so partial days never include readings outside the requested
window. Summary counts and median use all configured checks (at most 36);
`limit` only shortens displayed readings, with explicit truncation metadata.
Source measurement
timestamps drive freshness; a failed latest run keeps older measurements
visible with a stale/error indicator. Bars have equivalent text values, failed
regions never become zero, and the expandable history has a semantic table and
keyboard controls. Each card instance generates a unique heading ID.

## Verification

`pnpm test:region` uses an explicit local Globalping HTTP simulator plus an
isolated real PostgreSQL schema. Set `ATLAS_TEST_DATABASE_URL` to a loopback
database whose name includes `test` or `roadmap`; tests remove only their unique
schemas. Fixtures are test-only and are never supplied by the live runtime.

An explicit small public verification is available with:

```sh
ATLAS_TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/atlas_test \
  pnpm exec tsx scripts/verify-region-live.ts
```

It requests three no-key probes against `https://aisocratic.org/`, verifies the
real storage/query/card path, writes evidence under `test-results/`, and removes
its isolated schema. It is excluded from CI so tests never depend on a public
provider or spend measurement credits unexpectedly. Phase evidence records the
actual run outcome; future provider failures must be reported as failures.
