import { onCLS, onINP, onLCP, type Metric } from "web-vitals"

/** Bundle this entry with your site's build. The browser key grants ingestion only. */
export function installAtlasVitals({ endpoint, writeKey }: { endpoint: string; writeKey: string }) {
  const target = new URL(endpoint)
  if (target.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(target.hostname)) throw new Error("Atlas beacon endpoint must use HTTPS.")
  const post = (kind: "vitals" | "page-views", events: unknown[]) => {
    const url = new URL(`/api/ingest/${kind}`, target)
    void fetch(url, { method: "POST", mode: "cors", credentials: "omit", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ writeKey, events }) }).catch(() => undefined)
  }
  const report = (metric: Metric) => post("vitals", [{ id: metric.id, name: metric.name, value: metric.value, rating: metric.rating, navigationType: metric.navigationType, path: location.pathname, timestamp: new Date().toISOString() }])
  onLCP(report); onINP(report); onCLS(report)
  post("page-views", [{ id: crypto.randomUUID(), path: location.pathname, timestamp: new Date().toISOString() }])
}
