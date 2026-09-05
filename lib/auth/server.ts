import { headers } from "next/headers";
import { redirect } from "next/navigation";
import config from "../../atlas.config";
import { authSettings, authorizeRequest } from "../auth";
import { setupStatus } from "./setup";

export async function pageRequest(): Promise<Request> {
  const incoming = new Headers(await headers());
  const settings = authSettings();
  const origin = settings.appOrigin || `http://${incoming.get("host") || "localhost"}`;
  return new Request(origin, { headers: incoming });
}
/** Call before loading any protected telemetry in a server page. APIs use authorizeRequest directly. */
export async function requirePageAuth() {
  const status = setupStatus(config);
  if (!status.ready) redirect("/setup");
  const auth = await authorizeRequest(await pageRequest(), "read");
  if (!auth.ok) redirect(status.mode === "password" && auth.status === 401 ? "/login" : "/setup");
  return auth.principal;
}
