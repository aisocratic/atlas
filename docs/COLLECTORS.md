# Collector sources and ingestion

All nine registered cards have their own `info`, `component`, `dataset`, and
`collector` modules. The generic authenticated routes and `pnpm collect <id>`
share execution, leases, failure reporting, and transactional publication.
No fixture is supplied by live application code. Empty, stale, disabled, and
missing-configuration states remain visible. Each card also has an authenticated
detail page at `/cards/<id>`.

## Configuration

Set `DATABASE_URL`, run `pnpm run setup`, and configure Atlas authentication.
Source settings belong to `atlas.config.ts` or the documented environment
overrides. Provider credentials stay in server environment variables.

```ts
export default defineConfig({
  siteUrl: "https://your-site.example/",
  repository: "owner/repository",
  repositoryPath: "/absolute/path/to/your/checkout",
  cards: {
    lighthouse: { options: { strategy: "mobile", paths: ["/", "/docs"] } },
    "seo-audit": { options: { paths: ["/", "/docs"] } },
    "ai-usage": {
      optIn: true,
      options: { sourcePaths: ["/absolute/path/to/exported-usage.jsonl"] },
    },
  },
})
```

`ATLAS_SITE_URL`, `ATLAS_REPOSITORY`, and `ATLAS_REPOSITORY_PATH` override source
settings. The CLI loads `.env.local` and `.env`. Disable a card with
`cards: { "card-id": false }`; sensitive usage sources additionally require
`optIn: true`. No local checkout or AI history is discovered automatically.

## Pull sources

| Card | Source and behavior |
| --- | --- |
| Region latency | Globalping HTTP HEAD measurements; see [regional documentation](REGION-LATENCY.md). |
| Lighthouse | PageSpeed Insights, mobile by default or explicit desktop; 1–5 configured paths. Optional `PAGESPEED_API_KEY`. Reports lab performance/accessibility/SEO scores and LCP, CLS, TBT. Field INP is never relabeled from lab blocking. |
| SEO audit | Fetches 1–5 configured same-origin paths, with at most three same-origin redirects, 20-second requests, and 2 MB responses. Seven equally weighted checks: successful status, title length 10–70, description length 50–180, valid same-origin canonical, indexing allowed by HTTP/meta robots directives, exactly one H1, and Open Graph title/description. Score is passed checks divided by seven times 100. It does not crawl links or infer rankings. |
| Releases | GitHub published releases, at most three pages of 30 per run. Drafts are excluded; prereleases are explicitly labeled. Optional `GITHUB_TOKEN`; public repositories can work without one. Tags without releases remain empty. Releases are not inferred deployment events. |
| Repository metrics | Explicit local checkout only. No installs, subprocesses, lint, tests, or repository scripts execute. JS/TS/JSX/TSX metrics use the TypeScript parser/scanner. Source lines exclude blank/comment-only lines. Function complexity counts branches, loops, case/catch clauses, conditional expressions and logical operators plus one; report p95. Duplication counts repeated, trimmed, non-overlapping five-code-line blocks. This is a documented lightweight measure, not a token-clone analyzer. |
| AI usage | Only 1–5 explicitly opted-in absolute JSON/JSONL files, at most 5 MB each. No directory traversal, globbing, source discovery, or retained prompts/tool output. Daily imports replace the selected source snapshots, so repeated collection does not add usage twice. |
| Anomalies | Derived regional TTFB comparisons. A latest-24-hour reading is compared with the previous seven-day median ending 24 hours ago. Require five baseline samples. A finding needs both a 50% and 100 ms increase. Collection publishes or resolves findings, and links open actual regional card detail pages. Insufficient history is distinct from an eligible healthy comparison. |

PageSpeed uses its documented analysis response and strategy/category fields;
GitHub uses published release records and pagination.
[PageSpeed API](https://developers.google.com/speed/docs/insights/v5/reference/pagespeedapi/runpagespeed),
[GitHub releases API](https://docs.github.com/en/rest/releases/releases).

Repository reads exclude hidden paths, VCS, dependencies, build output,
credential-like names, symlinks, and paths outside the resolved root. Bounds:
10,000 visited entries, 2,000 source files, 512 KB/file, 10 MB source total,
500 declared dependencies. Up to 40 registry lookups run with concurrency four.
Declared dependency range, registry `latest`, and range-compatible `wanted`
remain separate; missing/unsupported registry responses stay unknown. No
vulnerability count is inferred from an unavailable scan.
[npm outdated semantics](https://docs.npmjs.com/cli-commands/npm-outdated/).

Compatible provider endpoint overrides (`PAGESPEED_API_URL`, `GITHUB_API_URL`,
`NPM_REGISTRY_URL`) require HTTPS, except loopback HTTP test providers. External
responses, redirects, body sizes and deadlines are bounded; unexpected errors
are sanitized. API failures never generate synthetic successful measurements.

## AI usage export semantics

Supported Codex records include documented `codex exec --json`
`turn.completed.usage` events and rollout `event_msg/token_count` cumulative
counters. Repeated cumulative totals add nothing; counter resets start a new
counter segment. Rollout model identifiers come from `turn_context` when
present. Codex input includes cached input, which is also shown separately;
the two must not be added together as total input.
[Codex non-interactive JSON](https://learn.chatgpt.com/docs/non-interactive-mode).

Claude assistant records use `message.id` and `message.usage`; repeated IDs use
the highest reported counts. When result records are present, their cumulative
per-call usage is preferred to avoid adding the assistant steps again. Result
UUIDs deduplicate repeated result records. Claude's separate cache-read and
cache-creation counts remain separate from input. Result `total_cost_usd` is
retained only when supplied, labeled as the source-reported estimate; Atlas
contains no inferred price table or authoritative billing total.
[Claude usage and cost semantics](https://code.claude.com/docs/en/agent-sdk/cost-tracking).

Event timestamps select UTC days. Exports without timestamps use the explicit
file's modification day. Dataset ranges include overlapping daily buckets and
say so in the card. Supported usage fields are parsed; prompt/result/tool
content is not retained in database rows or dataset responses. Test coverage
uses generated fixtures only, never this user's real coding-agent logs.

## Browser metrics and server errors

Set a separate `ATLAS_RUM_WRITE_KEY` (16+ characters) for browser ingestion.
This identifier is public and grants no read, collection, or administration
access. Only the exact configured site's origin is accepted. Bundle
[`examples/browser-beacon.ts`](../examples/browser-beacon.ts) with that site's
build and call `installAtlasVitals({ endpoint, writeKey })` once per page.
It uses the maintained `web-vitals` callbacks for LCP, INP, and CLS and sends a
page view. Paths omit query strings; no form content or session identifiers
are captured. Final updates replace the earlier value for the metric ID.
Field card values are p75 with sample counts, separate from Lighthouse.
[web-vitals integration](https://github.com/GoogleChrome/web-vitals).

Browser endpoints:

- `POST /api/ingest/vitals`: `{ writeKey, events: [{ id, path, name, value, rating?, navigationType?, timestamp? }] }`
- `POST /api/ingest/page-views`: `{ writeKey, events: [{ id, path, timestamp? }] }`

They support origin-specific CORS preflight, omit cookies, accept 1–20 events
and at most 32 KB/request, reject unknown fields, and limit the source to 120
requests/minute in PostgreSQL. Accepted event times span the preceding day
(five minutes of future clock tolerance); metric names/values are bounded.
Older metric updates cannot replace newer final values. Public browser events
are untrusted telemetry and are not a billing or authorization source.

Server errors use `POST /api/ingest/errors` with
`Authorization: Bearer <ATLAS_ERRORS_WRITE_TOKEN>` and
`{ events: [{ id, level, message, name?, path?, statusCode?, timestamp? }] }`.
The separate token requires 32+ characters and cannot equal the collector or
browser key. Requests with a browser Origin are rejected; no CORS is supplied.
The limit is 300 source requests/minute with the same body/event/time bounds.
Use [`examples/server-errors.ts`](../examples/server-errors.ts) from a server
error boundary. Send sanitized messages; stack traces and arbitrary metadata
are intentionally outside this ingestion contract. Atlas redacts URL/Bearer
strings, counts deduplicated errors/warnings, and lists top messages. It does
not invent an error rate without a same-source server-request denominator.

The Real users and Server errors collectors refresh ingested data through the
shared execution path; they report missing ingestion honestly and write no
invented events. Ingestion stores full source-origin identity in rows and
unique keys. Writes, per-source cache version increments, and cache
invalidation commit together. A read racing a pushed update can populate only
its old cache generation. Persistent rate buckets are pruned after two hours.

## Verification

`pnpm test:collectors` runs protocol simulations, explicit local-file fixtures,
and real PostgreSQL tests in unique schemas. `pnpm test:e2e:collectors` runs the
committed desktop/mobile browser suite with actual local HTTP collection and
the bundled maintained browser beacon. Both require the explicit loopback
`ATLAS_TEST_DATABASE_URL` test database. They never require public providers.

`pnpm exec tsx scripts/verify-collectors-live.ts` is an explicit manual no-key
SEO/release check against the documented public targets, outside CI. Evidence
goes to `test-results/collectors-live.json`; its unique schema is removed.
Actual outcomes, including empty public sources, are recorded in phase evidence.
