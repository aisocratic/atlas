import assert from "node:assert/strict"
import { test } from "node:test"
import { withDatabase, services } from "./support"
import { insertTelemetry } from "../../lib/db/telemetry"
import type { TelemetryPresentation } from "../../lib/cards/presentation"
test("anomalies distinguish insufficient history, threshold breach, recovery, and source changes", () => withDatabase(async db => {
  const app = services(db, { siteUrl: "https://measured.example/" })
  assert.equal((await app.dataset("anomalies")).status, "empty")
  assert.equal((await app.collect("anomalies")).status, "succeeded")
  for (let day = 2; day <= 6; day++) await insertTelemetry(db, "region_latency_samples", { page_url: "https://measured.example/", page_path: "/", region_key: "us", region_label: "United States", status: "ok", ttfb_ms: 100, measured_at: new Date(Date.now() - day * 86400_000) })
  await insertTelemetry(db, "region_latency_samples", { page_url: "https://measured.example/", page_path: "/", region_key: "us", region_label: "United States", status: "ok", ttfb_ms: 400 })
  assert.equal((await app.collect("anomalies")).rowsWritten, 1)
  const data = (await app.dataset("anomalies")).data as TelemetryPresentation
  assert.equal(data.metrics[1].value, "1"); assert.equal(data.links?.[0].href, "/cards/region-latency")
  assert.equal((await services(db, { siteUrl: "https://other.example/" }).dataset("anomalies")).status, "empty")
  await insertTelemetry(db, "region_latency_samples", { page_url: "https://measured.example/", page_path: "/", region_key: "us", region_label: "United States", status: "ok", ttfb_ms: 110 })
  assert.equal((await app.collect("anomalies")).rowsWritten, 0)
  const healthy = (await app.dataset("anomalies")).data as TelemetryPresentation
  assert.equal(healthy.metrics[1].value, "0"); assert.equal(healthy.rows[0][3], "Resolved")
}))
