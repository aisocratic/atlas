import { demoMode } from "../lib/demo/mode"
export function DemoBanner() {
  return demoMode() ? <aside aria-label="Demo mode" className="rounded-xl border border-border bg-card p-4 text-body"><strong>Demo mode · synthetic data</strong><p>Fixed examples dated September 5, 2026. No live measurements or local AI files are read. Collection and ingestion are disabled; dashboard changes stay in the demo workspace.</p></aside> : null
}
