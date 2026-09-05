import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type AuthAction = "read" | "collect" | "write";
export interface Principal { id: string; kind: "open" | "session" | "bearer" | "trusted-header" }
export type Authorization = { ok: true; principal: Principal } | { ok: false; status: 401 | 403 | 503; error: string };
export type AuthEnvironment = Readonly<Record<string, string | undefined>>;
export const SESSION_COOKIE = "atlas_session";
export interface AuthSettings { mode: "open" | "password" | "header"; production: boolean; password: string; sessionSecret: string; proxySecret: string; userHeader: string; collectorToken: string; appOrigin?: string; sessionSeconds: number; issues: string[] }
export interface Session { version: 1; sub: "shared-password"; iat: number; exp: number; csrf: string }
const digest = (value: string) => createHash("sha256").update(value).digest();
export function constantTimeEqual(a: string, b: string): boolean { return timingSafeEqual(digest(a), digest(b)); }

export function authSettings(env: AuthEnvironment = process.env): AuthSettings {
  const mode = env.ATLAS_AUTH || "open";
  const issues: string[] = [];
  const production = env.NODE_ENV === "production";
  const password = env.ATLAS_PASSWORD || "";
  const sessionSecret = env.ATLAS_SESSION_SECRET || "";
  const proxySecret = env.ATLAS_PROXY_SECRET || "";
  const collectorToken = env.ATLAS_COLLECTOR_TOKEN || "";
  const userHeader = (env.ATLAS_USER_HEADER || "x-atlas-user").toLowerCase();
  const sessionSeconds = Number(env.ATLAS_SESSION_SECONDS || 28800);
  if (!["open", "password", "header"].includes(mode)) issues.push("Set ATLAS_AUTH to password, header, or open for local development.");
  if (mode === "open" && production) issues.push("Open authentication is disabled in production. Choose password or header.");
  if (mode === "password") {
    if (password.length < 12) issues.push("ATLAS_PASSWORD must contain at least 12 characters.");
    if (sessionSecret.length < 32) issues.push("ATLAS_SESSION_SECRET must contain at least 32 random characters.");
  }
  if (mode === "header" && proxySecret.length < 32) issues.push("ATLAS_PROXY_SECRET must contain at least 32 random characters.");
  if (!/^x-[a-z0-9-]{1,60}$/.test(userHeader) || ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-atlas-proxy-secret", "x-atlas-csrf"].includes(userHeader)) issues.push("ATLAS_USER_HEADER must be a dedicated identity header such as x-atlas-user.");
  if (collectorToken && collectorToken.length < 32) issues.push("ATLAS_COLLECTOR_TOKEN must contain at least 32 random characters.");
  if (!Number.isInteger(sessionSeconds) || sessionSeconds < 300 || sessionSeconds > 86400) issues.push("ATLAS_SESSION_SECONDS must be 300–86400.");
  let appOrigin: string | undefined;
  if (env.ATLAS_APP_URL) {
    try {
      const url = new URL(env.ATLAS_APP_URL);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
      if (production && url.protocol !== "https:" && !isLoopback(url.hostname)) throw new Error();
      appOrigin = url.origin;
    } catch { issues.push("ATLAS_APP_URL must be the dashboard's HTTP(S) origin; production requires HTTPS except on localhost."); }
  } else if (production && mode !== "open") issues.push("Set ATLAS_APP_URL to the dashboard's public origin for CSRF protection.");
  return { mode: mode as AuthSettings["mode"], production, password, sessionSecret, proxySecret, userHeader, collectorToken, appOrigin, sessionSeconds, issues };
}
function isLoopback(hostname: string): boolean { return ["localhost", "127.0.0.1", "[::1]"].includes(hostname); }
const signature = (settings: AuthSettings, payload: string) => createHmac("sha256", settings.sessionSecret).update(settings.password).update("\0").update(payload).digest("base64url");
export function createSession(settings: AuthSettings, now = Date.now()): { cookie: string; session: Session } {
  if (settings.mode !== "password" || settings.issues.length) throw new Error("Password authentication is not configured.");
  const iat = Math.floor(now / 1000);
  const session: Session = { version: 1, sub: "shared-password", iat, exp: iat + settings.sessionSeconds, csrf: randomBytes(32).toString("base64url") };
  const encoded = Buffer.from(JSON.stringify(session)).toString("base64url");
  return { cookie: `${encoded}.${signature(settings, encoded)}`, session };
}
export function verifySession(cookie: string | undefined, settings: AuthSettings, now = Date.now()): Session | null {
  if (!cookie || cookie.length > 2048 || settings.mode !== "password" || settings.issues.length) return null;
  const parts = cookie.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !constantTimeEqual(parts[1], signature(settings, parts[0]))) return null;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Session;
    const seconds = Math.floor(now / 1000);
    if (value.version !== 1 || value.sub !== "shared-password" || !Number.isInteger(value.iat) || !Number.isInteger(value.exp) || value.iat > seconds + 30 || value.exp <= seconds || value.exp <= value.iat || value.exp > value.iat + settings.sessionSeconds || typeof value.csrf !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.csrf)) return null;
    return value;
  } catch { return null; }
}
export function sessionFromRequest(request: Request, settings: AuthSettings): Session | null {
  const cookie = request.headers.get("cookie")?.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return verifySession(cookie, settings);
}
export function sessionCookie(value: string, settings: AuthSettings, clear = false): string {
  return `${SESSION_COOKIE}=${clear ? "" : value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : settings.sessionSeconds}${settings.production ? "; Secure" : ""}`;
}
export function sameOrigin(request: Request, settings: AuthSettings): boolean {
  const origin = settings.appOrigin || new URL(request.url).origin;
  return request.headers.get("origin") === origin && request.headers.get("sec-fetch-site") !== "cross-site";
}
export function csrfToken(request: Request, principal: Principal, settings: AuthSettings): string | null {
  if (principal.kind === "session") return sessionFromRequest(request, settings)?.csrf ?? null;
  if (principal.kind === "trusted-header") return createHmac("sha256", settings.proxySecret).update(`atlas/csrf\0${principal.id}\0${settings.appOrigin || new URL(request.url).origin}`).digest("base64url");
  if (principal.kind === "open") return "atlas-local-development";
  return null;
}
export async function authorizeRequest(request: Request, action: AuthAction, env: AuthEnvironment = process.env): Promise<Authorization> {
  const settings = authSettings(env);
  if (settings.issues.length) return { ok: false, status: 503, error: "Atlas authentication requires configuration. Open /setup for instructions." };
  const bearer = request.headers.get("authorization");
  if (bearer) {
    if (!settings.collectorToken || !bearer.startsWith("Bearer ") || !constantTimeEqual(bearer.slice(7), settings.collectorToken)) return { ok: false, status: 401, error: "Invalid collector credential." };
    if (action !== "collect") return { ok: false, status: 403, error: "Collector credentials permit collection only." };
    return { ok: true, principal: { id: "collector", kind: "bearer" } };
  }
  let principal: Principal;
  if (settings.mode === "open") {
    if (!isLoopback(new URL(request.url).hostname)) return { ok: false, status: 403, error: "Open authentication requires localhost development. Bind the development server to loopback." };
    principal = { id: "local", kind: "open" };
  } else if (settings.mode === "password") {
    if (!sessionFromRequest(request, settings)) return { ok: false, status: 401, error: "Sign in to access Atlas." };
    principal = { id: "shared-password", kind: "session" };
  } else {
    const secret = request.headers.get("x-atlas-proxy-secret") || "";
    const user = request.headers.get(settings.userHeader)?.trim();
    if (!secret || !constantTimeEqual(secret, settings.proxySecret) || !user || user.length > 180 || Array.from(user).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return { ok: false, status: 401, error: "A verified identity from the trusted proxy is required." };
    principal = { id: `proxy:${user}`, kind: "trusted-header" };
  }
  if (action !== "read" || !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const expected = csrfToken(request, principal, settings);
    if (!sameOrigin(request, settings) || !expected || !constantTimeEqual(request.headers.get("x-atlas-csrf") || "", expected)) return { ok: false, status: 403, error: "CSRF validation failed. Refresh the page and try again." };
  }
  return { ok: true, principal };
}
