# Security policy

Report vulnerabilities privately to **security@aisocratic.org**, including reproduction steps and impact. Atlas is pre-1.0; fixes land on `main` and in the next release.

## Deployment boundary

The Next.js app stores engineering telemetry in PostgreSQL. Production requires shared-password or verified proxy authentication; open mode is refused. The separate GitHub Pages site is a public demonstration with illustrative data and browser storage, not a telemetry endpoint.

Follow [authentication and deployment instructions](docs/AUTH.md). Shared-password sessions expire, use signed HttpOnly cookies, and require same-origin CSRF tokens for mutations. Logout removes the local cookie; credential rotation invalidates outstanding stateless sessions. The shared password is one team principal, not individual accounts or role-based authorization.

Trusted header mode requires a separate proxy secret as well as an identity header. Configure the authenticating proxy to replace both headers, keep that secret private, and restrict direct app access where possible. Atlas never trusts a forwarded IP as evidence that a request passed through the proxy. Open local development relies on binding the server to loopback; URL/Host checks cannot establish the actual network peer.

Collector bearer tokens have collection-only scope and cannot read datasets or change dashboards. Server CLI access and database credentials remain privileged. Keep secrets out of config files committed to Git, client bundles, logs, and public Pages assets. Use HTTPS and verified PostgreSQL TLS for managed databases.

Every new server page must use `requirePageAuth` before reading telemetry; every new API must use `authorizeRequest` before loading configuration/data. Cookie-authenticated mutations require CSRF validation. Do not cache private responses publicly. Security regression tests cover production open refusal, expiry/tampering, Origin/CSRF, proxy forgery, token scope, and login/logout.

The built-in login failure limiter is per-process. Multi-instance deployments need an ingress rate limiter. Database access is parameterized and restricted to a dedicated configurable schema; migrations are append-only, transactionally locked, and checksummed. Use credentials restricted to that database/schema and run setup intentionally.
