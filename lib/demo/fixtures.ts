import type { DatasetEnvelope, Json } from "../cards/types"
import type { TelemetryPresentation } from "../cards/presentation"
import type { RegionLatencyData } from "../../cards/region-latency/types"
export const FIXTURE_DATE = "2026-09-05T12:00:00.000Z"
export const FIXTURE_VERSION = "v1"
const source = "Synthetic example · example.invalid"
function presentation(description: string, metrics: [string, string][], columns: string[], rows: (string | number | null)[][]): TelemetryPresentation {
  return { source, description, metrics: metrics.map(([label, value]) => ({ label, value })), columns, rows }
}
const regions: RegionLatencyData = {
  source, paths: ["/"], unit: "ms", range: { since: "2026-08-30T00:00:00.000Z", until: "2026-09-06T00:00:00.000Z" }, truncated: false, totalMeasured: 3,
  summary: { medianTtfbMs: 210, responding: 2, regions: 3, failed: 1 },
  regions: [
    { key: "na", label: "North America", path: "/", url: "https://example.invalid/", country: "US", city: "New York", measuredAt: FIXTURE_DATE, measurementId: "synthetic-na", status: "ok", statusCode: 200, ttfbMs: 120, totalMs: 280, error: null },
    { key: "eu", label: "Europe", path: "/", url: "https://example.invalid/", country: "DE", city: "Frankfurt", measuredAt: FIXTURE_DATE, measurementId: "synthetic-eu", status: "ok", statusCode: 200, ttfbMs: 300, totalMs: 510, error: null },
    { key: "ap", label: "Asia Pacific", path: "/", url: "https://example.invalid/", country: null, city: null, measuredAt: FIXTURE_DATE, measurementId: "synthetic-ap", status: "error", statusCode: null, ttfbMs: null, totalMs: null, error: "Synthetic timeout example" },
  ],
  history: [{ day: "2026-09-04", key: "eu", path: "/", samples: 6, errors: 0, medianMs: 140, p95Ms: 170 }, { day: "2026-09-05", key: "eu", path: "/", samples: 6, errors: 0, medianMs: 300, p95Ms: 330 }],
}
const data: Record<string, Json> = {
  "region-latency": regions,
  lighthouse: presentation("Synthetic mobile lab results; field metrics appear in Real users.", [["Performance", "92 / 100"], ["Lab LCP", "1,820 ms"], ["Lab CLS", "0.03"], ["Lab TBT", "95 ms"]], ["Measured", "Path", "Performance", "Accessibility", "SEO"], [[FIXTURE_DATE, "/", 92, 98, 100], [FIXTURE_DATE, "/docs", 79, 95, 86]]),
  "seo-audit": presentation("Synthetic seven-check audit with a fixable finding.", [["Latest audit score", "86 / 100"]], ["Path", "Score", "Findings"], [["/", 100, "All seven checks passed"], ["/docs", 86, "Missing meta description"]]),
  "repo-metrics": presentation("Synthetic repository and dependency examples; no checkout is scanned.", [["Source lines", "12,840"], ["Source files", "94"], ["Repeated blocks", "2.1%"], ["Function complexity p95", "6"]], ["Dependency", "Declared range", "Wanted", "Latest", "Majors behind wanted"], [["example-ui", "^2.0.0", "2.3.1", "3.1.0", 1], ["example-utils", "^1.0.0", "1.4.0", null, null]]),
  releases: presentation("Synthetic published releases, including a prerelease; these are not deployments.", [["Published in range", "2"]], ["Published", "Tag", "Title", "Channel"], [[FIXTURE_DATE, "v1.2.0", "Example accessibility improvements", "Stable"], ["2026-09-04T12:00:00.000Z", "v1.3.0-beta.1", "Example search preview", "Prerelease"]]),
  "server-errors": presentation("Synthetic errors and warnings; no error rate is inferred without a request denominator.", [["Errors", "3"], ["Warnings", "1"]], ["Level", "Message", "Count", "Latest"], [["error", "Synthetic upstream timeout", 3, FIXTURE_DATE], ["warn", "Synthetic retry completed", 1, FIXTURE_DATE]]),
  "real-users": presentation("Synthetic field p75 values and small sample counts; no browser events were collected.", [["Field LCP p75", "2,100 ms"], ["Field INP p75", "160 ms"], ["Field CLS p75", "0.04"], ["Page views", "24"]], ["Path", "Field metric", "p75", "Samples"], [["/", "LCP", "2,100 ms", 12], ["/", "INP", "160 ms", 8], ["/", "CLS", "0.04", 12]]),
  "ai-usage": presentation("Synthetic usage export; no local files or prompts are read. Missing costs remain unknown.", [["Input tokens (tool semantics)", "42,000"], ["Output tokens", "8,000"], ["Source-reported estimated cost", "Unknown / partially reported"]], ["Day", "Tool / model", "Input", "Output", "Cache read", "Reported estimate USD"], [["2026-09-05", "Example assistant / model-a", "30000", "6000", "12000", "0.42"], ["2026-09-05", "Example assistant / model-b", "12000", "2000", "0", null]]),
  anomalies: presentation("Synthetic alert demonstrates +50% and +100 ms regional baseline thresholds.", [["Eligible baseline checks", "2"], ["Published active findings", "1"]], ["Finding", "Baseline", "Observed", "Status"], [["Europe TTFB increased", "140 ms", "300 ms", "Active"], ["North America recovered", "110 ms", "120 ms", "Resolved"]]),
}
export const demoFixtures: Readonly<Record<string, DatasetEnvelope>> = Object.fromEntries(Object.entries(data).map(([id, data]) => [id, { id, provenance: "synthetic", status: "ready", data, updatedAt: FIXTURE_DATE, stale: false, run: null, cache: { hit: false, expiresAt: null } }]))
