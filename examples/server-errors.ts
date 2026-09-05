/** Call in your source server's error boundary; sanitize messages before sending. */
export async function sendAtlasError(endpoint: string, token: string, event: { id: string; message: string; level: "error" | "warn"; name?: string; path?: string; statusCode?: number }) {
  const url = new URL("/api/ingest/errors", endpoint)
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Atlas error endpoint must use HTTPS.")
  const result = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ events: [{ ...event, timestamp: new Date().toISOString() }] }), signal: AbortSignal.timeout(5000), redirect: "error" })
  if (!result.ok) throw new Error(`Atlas error ingestion returned ${result.status}.`)
}
