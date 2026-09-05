import { demoMode, runtimeSchema } from "../demo/mode";
import { authSettings, type AuthEnvironment } from "../auth";
import { resolveConfig } from "../config";

export interface SetupStatus { authentication: boolean; database: boolean; site: boolean; configuration: boolean; ready: boolean; mode: "open" | "password" | "header"; issues: string[] }
/** Public diagnostics reveal presence/validity, never configured values or credentials. */
export function setupStatus(input: unknown, env: AuthEnvironment = process.env): SetupStatus {
  const settings = authSettings(env);
  let site = false; let configuration = true;
  try { site = Boolean(resolveConfig(input, env).siteUrl) || demoMode(env); runtimeSchema(env); } catch { configuration = false; }
  let database = false;
  try {
    const url = new URL(env.DATABASE_URL || "");
    database = ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname && url.pathname.length > 1);
  } catch { /* Deliberately do not expose the URL or parser error. */ }
  const authentication = settings.issues.length === 0;
  return { authentication, database, site, configuration, ready: authentication && database && site && configuration, mode: settings.mode, issues: settings.issues };
}
