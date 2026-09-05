import { useId } from "react"
import { cardSurface } from "@aisocratic/design/components/card"
import { MetricCard } from "@aisocratic/design/components/metric-card"
import type { CardProps } from "../../lib/cards/types"
import type { RegionLatencyData } from "./types"
import { info } from "./info"

const milliseconds = (value: number | null) => value === null ? "Unavailable" : `${Math.round(value).toLocaleString("en-US")} ms`
export function RegionLatencyCard({ dataset }: CardProps) {
  const titleId = useId()
  const data = dataset.data as RegionLatencyData | null
  const maximum = Math.max(1, ...(data?.regions.map(region => region.ttfbMs ?? 0) ?? []))
  return (
    <section aria-labelledby={titleId} className={`${cardSurface} h-full overflow-auto p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-lead font-medium">{info.title}</h2>
        <span className="font-code text-micro text-muted-foreground">{dataset.provenance === "synthetic" ? "Synthetic probes" : dataset.stale ? "Stale data" : dataset.run?.status === "running" ? "Collecting" : "HTTP probes"}</span>
      </div>
      {dataset.provenance === "synthetic" && <p className="mt-2 font-medium text-body">Demo · synthetic fixture · fixed sample dates</p>}
      {dataset.reason || dataset.error ? <p role={dataset.error ? "status" : undefined} className="mt-3 text-body text-muted-foreground">{dataset.error ?? dataset.reason}</p> : null}
      {data?.regions.length ? <>
        <MetricCard className="mt-4" label="Median overall TTFB" value={milliseconds(data.summary.medianTtfbMs)} size="compact" />
        <p className="mt-3 text-body text-muted-foreground">{data.summary.responding} of {data.summary.regions} region/path checks responded with complete timings.{data.summary.failed ? ` ${data.summary.failed} failed or unavailable.` : ""}</p>
        {data.truncated ? <p className="mt-2 text-micro text-muted-foreground">Showing {data.regions.length} of {data.totalMeasured} observed region/path checks.</p> : null}
        <ul aria-label="Regional HTTP results" className="mt-4 space-y-3">
          {data.regions.map(region => <li key={`${region.url}:${region.key}`}>
            <div className="flex justify-between gap-3 text-body"><span>{region.label}{data.paths.length > 1 ? <span className="ml-2 font-code text-micro">{region.path}</span> : null}</span><span className="shrink-0 font-code text-micro">{region.status === "ok" ? milliseconds(region.ttfbMs) : "Unavailable"}</span></div>
            {region.status === "ok" && region.ttfbMs !== null ? <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${region.ttfbMs / maximum * 100}%` }} /></div> : <p className="mt-1 text-micro text-muted-foreground">{region.error ?? "No measurement is available."}</p>}
          </li>)}
        </ul>
        <details className="mt-5 border-t border-border pt-3">
          <summary className="cursor-pointer text-body">Daily history and measurement details</summary>
          <div className="mt-3 overflow-x-auto" role="region" aria-label="Daily latency history" tabIndex={0}>
            <table className="w-full text-left font-code text-micro"><caption className="pb-2 text-left text-muted-foreground">Daily TTFB within the selected time range; failures remain in the count.</caption><thead><tr><th scope="col" className="pr-3">Day / region</th><th scope="col" className="pr-3">Median</th><th scope="col">Failed / total</th></tr></thead><tbody>{data.history.slice(0, 36).map(day => <tr key={`${day.day}:${day.key}:${day.path}`}><th scope="row" className="py-1 pr-3 font-normal">{day.day} · {day.key}{data.paths.length > 1 ? ` · ${day.path}` : ""}</th><td className="pr-3">{milliseconds(day.medianMs)}</td><td>{day.errors} / {day.samples}</td></tr>)}</tbody></table>
          </div>
          <p className="mt-3 break-all text-micro text-muted-foreground">Source: {data.source}{data.paths.length === 1 ? data.paths[0] : ""}. HEAD requests include DNS, TCP, TLS when applicable, and server wait. This measures the initial response, not visual page load.</p>
        </details>
      </> : <p className="mt-4 text-body text-muted-foreground">{dataset.status === "missing-config" ? "Configuration needed before measurements can run." : "No regional measurements yet."}</p>}
      <p className="mt-4 font-code text-micro text-muted-foreground">{dataset.updatedAt ? <>{dataset.provenance === "synthetic" ? "Fixture dated " : "Measured "}<time dateTime={dataset.updatedAt}>{dataset.updatedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC")}</time></> : "Awaiting measurements"}</p>
    </section>
  )
}
