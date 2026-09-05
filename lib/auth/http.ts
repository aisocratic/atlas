export function authJson(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Cookie, Authorization", ...headers } });
}
export async function readSmallJson(request: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Send JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body is required.");
  const parts: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > maxBytes) { await reader.cancel(); throw new Error("Request is too large."); }
    parts.push(part.value);
  }
  const data = JSON.parse(Buffer.concat(parts).toString("utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Send a JSON object.");
  return data;
}
