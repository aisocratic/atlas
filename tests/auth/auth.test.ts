import { test } from "node:test";
import assert from "node:assert/strict";
import { authSettings, authorizeRequest, constantTimeEqual, createSession, csrfToken, sessionCookie, verifySession, type AuthEnvironment } from "../../lib/auth";
import { loginHandler } from "../../lib/auth/login";
import { setupStatus } from "../../lib/auth/setup";
const origin = "https://atlas.example";
const env: AuthEnvironment = { NODE_ENV: "production", ATLAS_AUTH: "password", ATLAS_APP_URL: origin, ATLAS_PASSWORD: "test-only-password-123", ATLAS_SESSION_SECRET: "test-only-session-secret-with-at-least-32-characters", ATLAS_COLLECTOR_TOKEN: "test-only-collector-secret-with-at-least-32-characters" };
const settings = authSettings(env);
function request(method = "GET", headers: Record<string, string> = {}, body?: string) { return new Request(`${origin}/api/cards`, { method, headers, body }); }
function authenticated(method = "GET", extra: Record<string, string> = {}) {
  const created = createSession(settings);
  return { request: request(method, { cookie: `atlas_session=${created.cookie}`, origin, "x-atlas-csrf": created.session.csrf, ...extra }), created };
}
function loginRequest(password: unknown, extra: Record<string, string> = {}) { return request("POST", { origin, "content-type": "application/json", ...extra }, JSON.stringify({ password })); }

test("production refuses open and malformed credentials before any bearer access", async () => {
  for (const changes of [{ ATLAS_AUTH: "open" }, { ATLAS_SESSION_SECRET: "short" }, { ATLAS_PASSWORD: "short" }, { ATLAS_COLLECTOR_TOKEN: "short" }, { ATLAS_APP_URL: "http://public.example" }, { ATLAS_APP_URL: undefined }, { ATLAS_AUTH: "typo" }]) {
    const auth = await authorizeRequest(request("POST", { authorization: `Bearer ${env.ATLAS_COLLECTOR_TOKEN}` }), "collect", { ...env, ...changes });
    assert.equal(auth.ok, false); if (!auth.ok) assert.equal(auth.status, 503);
  }
});
test("open development requires loopback host and CSRF for mutations", async () => {
  const local = { NODE_ENV: "development", ATLAS_AUTH: "open" };
  assert.equal((await authorizeRequest(new Request("http://127.0.0.1:3000"), "read", local)).ok, true);
  assert.equal((await authorizeRequest(new Request("http://public.example", { headers: { "x-forwarded-for": "127.0.0.1" } }), "read", local)).ok, false);
  assert.equal((await authorizeRequest(new Request("http://localhost:3000", { method: "POST" }), "write", local)).ok, false);
  assert.equal((await authorizeRequest(new Request("http://localhost:3000", { method: "POST", headers: { origin: "http://localhost:3000", "x-atlas-csrf": "atlas-local-development" } }), "write", local)).ok, true);
});
test("signed sessions reject tampering, expiry, future creation and credential rotation", () => {
  const now = Date.now(); const created = createSession(settings, now);
  assert.equal(verifySession(created.cookie, settings, now)?.sub, "shared-password");
  assert.equal(verifySession(`${created.cookie}x`, settings, now), null);
  const [payload, sig] = created.cookie.split(".");
  const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), sub: "administrator" })).toString("base64url");
  assert.equal(verifySession(`${edited}.${sig}`, settings, now), null);
  assert.equal(verifySession(created.cookie, settings, now + settings.sessionSeconds * 1000), null);
  assert.equal(verifySession(createSession(settings, now + 60_000).cookie, settings, now), null);
  assert.equal(verifySession(created.cookie, { ...settings, password: "different-password" }, now), null);
  assert.equal(verifySession(created.cookie, { ...settings, sessionSecret: "different-key" }, now), null);
  assert.equal(verifySession("x".repeat(2049), settings), null);
});
test("cookies enforce HttpOnly, SameSite, bounded lifetime and production Secure", () => {
  const value = sessionCookie("value", settings);
  assert.match(value, /HttpOnly/); assert.match(value, /SameSite=Lax/); assert.match(value, /Secure/); assert.match(value, /Max-Age=28800/);
  assert.match(sessionCookie("", settings, true), /atlas_session=;.*Max-Age=0/);
  assert.doesNotMatch(sessionCookie("value", { ...settings, production: false }), /Secure/);
});
test("session reads work; browser writes reject missing token, mismatched origin and cross-site fetch", async () => {
  assert.equal((await authorizeRequest(request(), "read", env)).ok, false);
  assert.equal((await authorizeRequest(authenticated().request, "read", env)).ok, true);
  assert.equal((await authorizeRequest(authenticated("POST").request, "write", env)).ok, true);
  for (const extra of ([{ "x-atlas-csrf": "" }, { origin: "https://evil.example" }, { origin: "" }, { "sec-fetch-site": "cross-site" }] as Record<string, string>[])) {
    const result = await authorizeRequest(authenticated("POST", extra).request, "write", env);
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.status, 403);
  }
  assert.equal((await authorizeRequest(authenticated("POST", { "x-atlas-csrf": "" }).request, "read", env)).ok, false);
});
test("collector bearer is collection-only and never falls back to an otherwise valid session", async () => {
  for (const action of ["read", "write", "collect"] as const) {
    const result = await authorizeRequest(request("POST", { authorization: `Bearer ${env.ATLAS_COLLECTOR_TOKEN}` }), action, env);
    assert.equal(result.ok, action === "collect");
  }
  assert.equal((await authorizeRequest(authenticated("POST", { authorization: "Bearer forged" }).request, "collect", env)).ok, false);
});
test("proxy identity requires a constant-time checked secret; forwarded peer claims grant nothing", async () => {
  const proxy = { ...env, ATLAS_AUTH: "header", ATLAS_PROXY_SECRET: "test-only-proxy-secret-with-at-least-32-characters" };
  for (const headers of ([{ "x-atlas-user": "alice" }, { "x-atlas-user": "alice", "x-forwarded-for": "127.0.0.1" }, { "x-atlas-user": "alice", "x-atlas-proxy-secret": "wrong" }, { "x-atlas-proxy-secret": proxy.ATLAS_PROXY_SECRET }] as Record<string, string>[])) {
    assert.equal((await authorizeRequest(request("GET", headers), "read", proxy)).ok, false);
  }
  const headers = { "x-atlas-user": "alice", "x-atlas-proxy-secret": proxy.ATLAS_PROXY_SECRET };
  const result = await authorizeRequest(request("GET", headers), "read", proxy); assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected proxy principal");
  assert.deepEqual(result.principal, { id: "proxy:alice", kind: "trusted-header" });
  const csrf = csrfToken(request(), result.principal, authSettings(proxy))!;
  assert.equal((await authorizeRequest(request("POST", { ...headers, origin, "x-atlas-csrf": csrf }), "write", proxy)).ok, true);
  assert.equal((await authorizeRequest(request("POST", { ...headers, "x-atlas-user": "bob", origin, "x-atlas-csrf": csrf }), "write", proxy)).ok, false);
});
test("sign-in rejects wrong passwords and cross-origin posts, then sets a valid signed session", async () => {
  const handler = loginHandler(env);
  assert.equal((await handler(loginRequest(env.ATLAS_PASSWORD, { origin: "https://evil.example" }))).status, 403);
  assert.equal((await handler(loginRequest("wrong"))).status, 401);
  const response = await handler(loginRequest(env.ATLAS_PASSWORD));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  const cookie = response.headers.get("set-cookie")!.split(";")[0].slice("atlas_session=".length);
  assert.ok(verifySession(cookie, settings)); assert.deepEqual(await response.json(), { ok: true });
});
test("sign-in bounds malformed bodies and failed attempts without trusting request IP headers", async () => {
  let now = Date.now(); const handler = loginHandler(env, () => now);
  assert.equal((await handler(request("POST", { origin, "content-type": "application/json" }, "{broken"))).status, 400);
  assert.equal((await handler(loginRequest("x".repeat(9000)))).status, 400);
  for (let i = 0; i < 10; i++) assert.equal((await handler(loginRequest("wrong", { "x-forwarded-for": `10.0.0.${i}` }))).status, 401);
  const limited = await handler(loginRequest(env.ATLAS_PASSWORD)); assert.equal(limited.status, 429); assert.equal(limited.headers.get("retry-after"), "60");
  now += 60_001; assert.equal((await handler(loginRequest(env.ATLAS_PASSWORD))).status, 200);
});
test("public setup diagnostics do not reveal values or connection errors", () => {
  const status = setupStatus({}, { ...env, DATABASE_URL: "postgres://secretuser:secretpassword@127.0.0.1/db", ATLAS_SITE_URL: "https://private.example" });
  assert.equal(status.ready, true); const serialized = JSON.stringify(status);
  for (const secret of ["secretuser", "secretpassword", "private.example", env.ATLAS_PASSWORD!, env.ATLAS_SESSION_SECRET!]) assert.equal(serialized.includes(secret), false);
  assert.equal(setupStatus({}, { ...env, DATABASE_URL: "garbage" }).database, false);
  assert.equal(setupStatus({ siteUrl: "not a URL" }, env).configuration, false);
});
test("constant-time comparison accepts exact credentials only", () => {
  assert.equal(constantTimeEqual("secret", "secret"), true); assert.equal(constantTimeEqual("secret", "secre"), false); assert.equal(constantTimeEqual("secret", "secret\0"), false);
});
