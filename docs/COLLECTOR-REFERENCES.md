# Collector implementation references

Primary references checked during roadmap integration (2026-09-05):

- [Globalping API](https://globalping.io/docs/api.globalping.io) and [upstream implementation](https://github.com/jsdelivr/globalping). Measurements are created with POST and read by ID. Region latency must request HTTP measurements and map documented HTTP timing fields; ping round-trip time is not TTFB. Respect completed/in-progress state and bounded polling; preserve failed regions rather than inventing values.
- [PageSpeed Insights runPagespeed](https://developers.google.com/speed/docs/insights/v5/reference/pagespeedapi/runpagespeed). Use explicit URL, mobile/desktop strategy and categories; parse Lighthouse results and audits. Keep laboratory measurements distinct from pushed real-user metrics.
- [GitHub releases API](https://docs.github.com/en/rest/releases/releases). Public published releases can be read without authentication; private repositories require an explicitly configured token. Regular tags are not necessarily published releases. Handle pagination, rate limits and draft/prerelease semantics deliberately.

Implementation and tests should use bounded provider response fixtures that reflect the documented schemas, then exercise the actual HTTP transport against a local provider simulator and the real Atlas database. At least the no-key vertical slices should also be exercised against configured public targets when available. Provider failure must produce an honest error/empty state, never a successful fake dataset.

## Globalping HTTP schema detail

The [upstream OpenAPI schema](https://github.com/jsdelivr/globalping/blob/master/public/v1/components/schemas.yaml) defines `measurementOptions.request.path`, `.query`, `.method`, plus `protocol`/`port`. HTTP result `timings` are milliseconds and include nullable `dns`, `tcp`, `tls`, `firstByte`, `download`, and `total`. Its `firstByte` is the wait *after* the TCP/TLS connection is established. A card labeled overall TTFB must include the preceding connection timings, or explicitly label the raw firstByte value as server wait; do not silently equate the two. Null/failed timings remain missing, never zero-valued success. Raw output is display-only; consume structured fields.

## Remaining collector implementation checks

- [Web Vitals field measurement](https://web.dev/articles/vitals-field-measurement-best-practices) and [Web Vitals overview](https://web.dev/articles/vitals): use the maintained `web-vitals` metric callbacks for field LCP, INP and CLS. Preserve metric IDs for deduplication/updating final values and report field percentiles separately from Lighthouse lab results. A public browser ingestion key is a write identifier, never an admin credential; restrict origins, payload size, accepted event fields and request rate. Send no full query strings or captured form content.
- [npm outdated](https://docs.npmjs.com/cli-commands/npm-outdated/): `wanted` follows the configured range, while `latest` follows the registry tag. Report missing registry data as unknown, never zero outdated packages. Do not run install scripts in the inspected repository.
- Server error counts are not a request error rate unless the same ingestion source supplies a request denominator. Page views are not a server request denominator. Show count and top messages when only error events exist.
- Releases represent published GitHub releases. Do not label a tag or a release as a production deployment without a deployment source. Exclude drafts and treat prereleases explicitly.
- SEO findings should correspond to measured HTTP/HTML checks, with a documented score formula. Audit only configured site paths with bounded concurrency, redirects, response sizes and deadlines. Never crawl an unbounded site graph.
- Local repository collection reads configured source files only. Exclude dependency, build, VCS and environment/credential files; bound file counts/bytes, avoid symlink escapes, and use argument arrays for any subprocess. Explain the supported language and duplication/complexity formulas.
- AI collection requires both the explicit card opt-in and explicit source paths. Read fixtures in tests; do not discover or read this user's actual coding-agent history. Count reported usage and supplied cost only; do not invent current prices or scan prompts.
- Derived anomaly links point to actual registered card IDs. Require enough baseline samples and describe the comparison window. Deterministic tests must distinguish no history from healthy measurements.
- Each collector proves provider parsing, failure handling, real PostgreSQL publication and dataset output. Provider fixtures must simulate actual protocol responses; demo data is separately labeled and belongs to Phase 7.
