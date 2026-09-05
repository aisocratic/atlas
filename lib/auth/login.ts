import { authSettings, constantTimeEqual, createSession, sameOrigin, sessionCookie, type AuthEnvironment } from "../auth";
import { authJson, readSmallJson } from "./http";
/** Process-wide failure limiter: no forgeable forwarding headers are used as an identity. */
export function loginHandler(env: AuthEnvironment = process.env, clock: () => number = Date.now) {
  let failures: number[] = [];
  return async (request: Request): Promise<Response> => {
    const settings = authSettings(env);
    if (settings.issues.length || settings.mode !== "password") return authJson({ error: "Password sign-in is not configured." }, 503);
    if (!sameOrigin(request, settings)) return authJson({ error: "Sign-in must originate from this Atlas site." }, 403);
    const now = clock();
    failures = failures.filter((time) => time > now - 60_000);
    if (failures.length >= 10) return authJson({ error: "Too many sign-in attempts. Try again in one minute." }, 429, { "Retry-After": "60" });
    let data: Record<string, unknown>;
    try { data = await readSmallJson(request); } catch { return authJson({ error: "Invalid sign-in request." }, 400); }
    if (typeof data.password !== "string" || data.password.length > 4096 || !constantTimeEqual(data.password, settings.password)) {
      failures.push(now);
      return authJson({ error: "Incorrect password." }, 401);
    }
    failures = [];
    const created = createSession(settings, now);
    return authJson({ ok: true }, 200, { "Set-Cookie": sessionCookie(created.cookie, settings) });
  };
}
