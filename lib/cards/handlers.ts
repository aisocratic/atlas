import { CardNotFoundError, parseDatasetQuery, type CardServices } from "./service"

export type AuthorizeCards = (request: Request, action: "read" | "collect") => Promise<{ ok: true } | { ok: false; status: number; error: string }>
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } })
async function hasEmptyBody(request: Request): Promise<boolean> {
  if (request.headers.has("content-length") && request.headers.get("content-length") !== "0") return false
  if (!request.body) return true
  const reader = request.body.getReader()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const deadline = new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 1000) })
    return await Promise.race([(async () => {
      for (let chunks = 0; chunks < 8; chunks++) {
        const result = await reader.read()
        if (result.done) return true
        if (result.value.byteLength > 0) return false
      }
      return false
    })(), deadline])
  } catch { return false } finally {
    if (timer) clearTimeout(timer)
    void reader.cancel().catch(() => {})
  }
}
export function createCardHandlers({ authorize, services }: { authorize: AuthorizeCards; services: () => CardServices }) {
  return {
    async dataset(request: Request, id: string): Promise<Response> {
      const auth = await authorize(request, "read")
      if (!auth.ok) return json({ error: auth.error }, auth.status)
      let query
      try { query = parseDatasetQuery(new URL(request.url)) } catch { return json({ error: "Invalid dataset query. Use ISO since/until dates and a limit from 1 to 1000." }, 400) }
      try {
        const result = await services().dataset(id, query)
        return json(result, result.status === "disabled" ? 404 : result.status === "error" ? 503 : 200)
      } catch (error) {
        return json({ error: error instanceof CardNotFoundError ? "Unknown card." : "Card configuration could not be loaded." }, error instanceof CardNotFoundError ? 404 : 503)
      }
    },
    async collect(request: Request, id: string): Promise<Response> {
      const auth = await authorize(request, "collect")
      if (!auth.ok) return json({ error: auth.error }, auth.status)
      // Targets/options come from trusted local config, never unbounded request JSON.
      if (!await hasEmptyBody(request)) return json({ error: "Collection requests do not accept a body." }, 400)
      try {
        const result = await services().collect(id)
        const statuses = { succeeded: 200, "already-running": 409, "missing-config": 422, disabled: 404, unsupported: 422, failed: 502, timeout: 504 }
        return json(result, statuses[result.status])
      } catch (error) {
        return json({ error: error instanceof CardNotFoundError ? "Unknown card." : "Card configuration could not be loaded." }, error instanceof CardNotFoundError ? 404 : 503)
      }
    },
  }
}
