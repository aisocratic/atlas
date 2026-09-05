export class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
export async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    const session = await fetch("/api/auth/session", { cache: "no-store" });
    if (!session.ok) throw new ApiError("Your session ended. Sign in again before saving.", session.status);
    const { csrfToken } = await session.json(); headers["X-Atlas-CSRF"] = csrfToken;
    if (body !== undefined) headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || data.reason || "The request could not be completed.", response.status);
  return data as T;
}
/** Keep stale/error envelopes with their last measurements instead of throwing away data on 503. */
export async function fetchDataset(id: string, signal?: AbortSignal): Promise<import("../cards/types").DatasetEnvelope> {
  const response = await fetch(`/api/datasets/${id}`, { cache: "no-store", signal });
  const data = await response.json();
  if (data.id === id && ["ready", "empty", "missing-config", "error", "disabled"].includes(data.status)) return data;
  throw new ApiError(data.error || "The dataset could not be loaded.", response.status);
}
