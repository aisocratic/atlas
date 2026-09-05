export type RegionReading = {
  key: string; label: string; path: string; url: string; country: string | null; city: string | null
  measuredAt: string; measurementId: string | null; status: "ok" | "error"; statusCode: number | null
  ttfbMs: number | null; totalMs: number | null; error: string | null
}
export type RegionHistory = { day: string; key: string; path: string; samples: number; errors: number; medianMs: number | null; p95Ms: number | null }
export type RegionLatencyData = {
  source: string; paths: string[]; unit: "ms"; range: { since: string; until: string }; truncated: boolean; totalMeasured: number
  summary: { medianTtfbMs: number | null; responding: number; regions: number; failed: number }
  regions: RegionReading[]; history: RegionHistory[]
}
