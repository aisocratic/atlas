# Phase 8 — Authentication and setup

Owner: Atlas authentication/setup agent. Scope: server authentication, safe configuration UI, cookie/session APIs, current page and generic route gates, auth tests and deployment instructions. No live website operations or deployment.

## Delivered behavior

- `lib/auth.ts` provides the shared `authorizeRequest(request, action)` contract. Password, verified proxy header, and loopback development adapters return a stable principal; production open always returns configuration failure before telemetry access.
- Shared-password sessions are HMAC signed, expire, use HttpOnly/SameSite cookies with Secure in production, and include a random CSRF token. Both password and session-key rotation invalidate sessions. Login uses constant-time credential comparison, bounded JSON and a per-process failed-login limiter.
- Trusted identity requires a dedicated proxy secret plus an identity header. Forwarded IP headers never establish trust. Origin and identity-bound CSRF protect mutations.
- Collector bearer credentials have collection-only scope. They cannot read telemetry, access browser sessions, or write layouts. Invalid bearer credentials cannot fall back to cookies.
- `/login`, `/setup`, and protected session/logout APIs use the shared design. The dashboard calls `requirePageAuth` before telemetry. Generic routes call the shared authorizer before config/database operations. The independent Pages demo remains public.
- Setup reports authentication/database/site configuration without showing values or writing environment files. `.env.example`, `docs/AUTH.md`, and the corrected Atlas `SECURITY.md` document deployment, loopback binding, proxy trust, TLS, token scope, and session limitations.
- Database/collection CLI commands now load `.env.local` with Next's environment loader. The correct command is `pnpm run setup`. The dev script binds `127.0.0.1`.

## Integration contracts

`authorizeRequest` returns `{ ok: true, principal: { id, kind } }` or `{ ok: false, status: 401 | 403 | 503, error }`. Kinds are `open`, `session`, `bearer`, and `trusted-header`. Actions are `read`, `write`, and `collect`. Future layout APIs must use the principal ID as their storage owner and call this authorizer before database access.

Server pages call `await requirePageAuth()`. Browser mutations fetch `GET /api/auth/session`, then send its `csrfToken` as `X-Atlas-CSRF`; the browser Origin must match `ATLAS_APP_URL`. Failure responses must be no-store. Do not import auth settings or secrets into client modules.

The Phase 4 integration now handles a real Next empty POST body stream correctly; the regression was found through authenticated browser execution and fixed with a bounded stream check by the registry owner.

## Verification

- `pnpm test:auth`: 11 passed — configuration matrix, production refusal, loopback boundary, session signature/tamper/expiry/rotation, cookie flags, CSRF/Origin, bearer scope, proxy forgery, bounded/rate-limited login, and secret-free diagnostics.
- `ATLAS_TEST_DATABASE_URL=postgres://roadmap@127.0.0.1:55672/atlas_roadmap pnpm test:storage`: 10 passed after bundler-compatible import and CLI updates.
- Focused auth/setup/storage TypeScript, ESLint, and diff checks passed.
- `ATLAS_TEST_DATABASE_URL=... PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e:auth`: 6 passed across desktop and mobile against real production servers and PostgreSQL, including real browser dataset fetch, login/reload/logout, CSRF, cookie tampering, bearer scope, production-open setup, and no horizontal overflow.
- `ATLAS_TEST_DATABASE_URL=... PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e:app`: 4 passed, retaining desktop/mobile font roles, shared chrome, no external fonts, keyboard theme controls and theme persistence after authenticated entry.
- Inspected generated desktop dashboard and mobile setup screenshots: shared warm palette, typography, readable status cards, and no clipping. Artifacts are under `test-results/auth/` (ignored).
- Production build passed. Public `.next/static` assets contained none of the test password/session/collector secrets.

The browser fixture requires a loopback test database, creates a unique schema, exercises the real setup CLI and `.env.local` loading in a temporary fixture directory, and drops its schema afterward. It never writes or reads user environment files. Public test-only credentials are explicitly marked and must not be used for deployment.

## Explicit limits

The shared password represents one team identity. Cookie logout clears that browser; copied stateless sessions need expiry or credential rotation for revocation. Login throttling is per process; distributed deployments need ingress limits. Open development relies on actual loopback binding, not a claim that URL/Host proves a network peer. Setup confirms configuration, not connectivity. These limits are documented in `docs/AUTH.md` and `SECURITY.md`.
