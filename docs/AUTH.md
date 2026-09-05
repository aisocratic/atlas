# Authentication and setup

The Next.js Atlas application contains private telemetry and requires authentication in production. The separate GitHub Pages site is a public demo with illustrative data and browser-local layouts; it has no connection to the application database.

## Start a server

1. Copy `.env.example` to `.env.local` and fill in your own values. `DATABASE_URL` selects PostgreSQL; `ATLAS_SCHEMA` defaults to the private `atlas` schema. Managed databases can use `DATABASE_SSL=require`, which verifies the certificate. `DATABASE_POOL_MAX` is 1–100.
2. Set `ATLAS_SITE_URL` to the monitored site and `ATLAS_APP_URL` to the dashboard's canonical origin, including the port during local testing. The public dashboard origin must use HTTPS in production, except for loopback test servers.
3. Choose password or trusted header authentication below. Generate **independent** random secrets, for example with `openssl rand -hex 32`. Never use the public credentials from repository tests.
4. Run `pnpm run setup` to apply migrations, then `pnpm dev` for local development. For a deployment, run `pnpm build` and `pnpm start` behind HTTPS. Restart the server after environment changes.

Use **`pnpm run setup`**, including `run`: `pnpm setup` invokes pnpm's own environment setup command. The Atlas scripts load `.env.local` through Next's environment loader. `/setup` shows configuration status and instructions; it does not write environment files, reveal values, or test database connectivity. Incomplete database/site/auth settings send the dashboard to setup. API authentication is checked before database/configuration access.

## Shared password

```dotenv
ATLAS_AUTH=password
ATLAS_PASSWORD=<unique password of at least 12 characters>
ATLAS_SESSION_SECRET=<at least 32 random characters>
ATLAS_APP_URL=https://atlas.example.com
ATLAS_SESSION_SECONDS=28800
```

Visitors sign in at `/login`. Password comparison hashes both inputs to equal-length buffers and uses Node's constant-time comparison. Successful login sets an HMAC-SHA256 signed session with an issued time, expiration, and random CSRF token. The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production. Sessions default to eight hours; configuration permits 300–86,400 seconds. Changing the password or signing secret invalidates all existing sessions.

The shared password represents one team identity, `shared-password`; it is not a per-person account system. Logout clears the browser's cookie. Sessions are stateless, so a previously copied cookie remains valid until expiration or credential rotation. Use a short lifetime or rotate credentials when access must be revoked across devices.

Login accepts bounded JSON and checks the canonical Origin. Ten failed attempts per process per minute trigger a temporary block. This protects one server process, not a distributed deployment: configure rate limits at the ingress for multiple replicas and to prevent deliberate login denial of service.

## Trusted header

```dotenv
ATLAS_AUTH=header
ATLAS_USER_HEADER=x-atlas-user
ATLAS_PROXY_SECRET=<at least 32 random characters>
ATLAS_APP_URL=https://atlas.example.com
```

The upstream proxy must authenticate the visitor, **strip incoming client identity/secret headers**, and set both `X-Atlas-User` (or the configured dedicated identity header) and `X-Atlas-Proxy-Secret`. Atlas checks the proxy secret in constant time before accepting the identity. An identity header alone, a missing/wrong secret, or a forged `X-Forwarded-For` claim grants no access. Identity values are bounded and reject control characters.

Keep the app reachable only through that proxy where practical, protect the proxy-to-app connection, and never expose the proxy secret to browser JavaScript, logs, or response headers. This is a shared-secret upstream contract; Atlas does not infer a network peer from forwarding headers. Proxy authentication controls sign-out and account revocation; Atlas does not present a password logout button in header mode.

## Local development only

`ATLAS_AUTH=open` requires a non-production runtime and a loopback request host. `pnpm dev` binds `127.0.0.1` by default. **Keep that loopback binding**: the request URL is not proof of the remote network peer and a Host header can be forged against a publicly bound development server. Forwarding metadata does not establish trust. Do not expose this mode through a tunnel or public reverse proxy.

Production refuses open mode, even if the request appears local or includes a valid collector token. `/setup` remains available to explain the missing authentication configuration; protected APIs return 503 and the dashboard redirects to setup.

## Browser mutations and collector tokens

`GET /api/auth/session` returns the authorized principal and a CSRF token with `Cache-Control: no-store`. Browser callers send that value in `X-Atlas-CSRF` on writes and collection POSTs. The Origin must exactly match `ATLAS_APP_URL`; cross-site fetch metadata is rejected. Password sessions use a random signed token; proxy sessions use a token bound to proxy identity and dashboard origin. Local open mode still requires Origin and its development CSRF token. The application uses this flow for sign-out.

An optional `ATLAS_COLLECTOR_TOKEN` of at least 32 random characters allows a scheduler to send `Authorization: Bearer <token>` to `POST /api/collect/{card-id}`. It grants **collection only**, never dataset reads, layout changes, session access, or logout. It does not need a CSRF token because it is an explicit non-cookie credential. Invalid Authorization headers fail rather than falling back to a browser cookie. Rotate the environment value and restart to revoke a token. The command-line collector runs within the trusted server environment and does not use HTTP authentication.

## Server integration contract

- APIs call `authorizeRequest(request, action)` from `lib/auth` before loading configuration, telemetry, or the database. `action` is `read`, `write`, or `collect`. Return its 401/403/503 failure without exposing lower-level errors, using a no-store response.
- Server pages call `await requirePageAuth()` from `lib/auth/server` before loading telemetry. It returns `{ id, kind }` for owner-scoped storage and redirects unauthenticated or unconfigured requests.
- Login, setup, and the authentication entry route are intentionally public. Logout and session APIs are protected. Static assets and the separate Pages demo are public.
- The core is server-only: never pass `authSettings()` or the environment object into client components. Public setup diagnostics contain booleans and fixed messages only.

## Verification

`pnpm test:auth` exercises the adapter/session/CSRF/proxy/token matrix without a database. `ATLAS_TEST_DATABASE_URL=postgres://.../atlas_test pnpm test:e2e:auth` builds and runs production password/open servers on ports 4190/4191, migrates an isolated schema in a loopback test database, and verifies login, live dataset authorization, cookie tampering, logout, setup, and mobile layouts. Tests refuse a non-loopback database or a name without `test`/`roadmap`. Use `PLAYWRIGHT_CHANNEL=chrome` for an installed Chrome, or install Playwright Chromium in CI. Do not run another Next build against the same `.next` directory during these tests.
