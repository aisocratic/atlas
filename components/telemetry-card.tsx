import { useId } from "react"
import { cardSurface } from "@aisocratic/design/components/card"
import { MetricCard } from "@aisocratic/design/components/metric-card"
import type { CardInfo, CardProps } from "../lib/cards/types"
import type { TelemetryPresentation } from "../lib/cards/presentation"

export function TelemetryCard({ info, dataset }: CardProps & { info: CardInfo }) {
  const heading = useId(), data = dataset.data as TelemetryPresentation | null
  return <section aria-labelledby={heading} className={`${cardSurface} h-full overflow-auto p-5`} tabIndex={0}>
    <h2 id={heading} className="text-lead font-medium">{info.title}</h2>
    {dataset.provenance === "synthetic" && <p className="mt-2 font-medium text-body">Demo · synthetic fixture · fixed sample dates</p>}
    {dataset.error || dataset.reason ? <p role="status" className="mt-3 text-body text-muted-foreground">{dataset.error ?? dataset.reason}</p> : null}
    {data ? <>
      <p className="mt-2 text-micro text-muted-foreground">{data.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{data.metrics.map(metric => <MetricCard key={metric.label} label={metric.label} value={metric.value} size="compact" />)}</div>
      {data.rows.length ? <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label={`${info.title} measurements`}><table className="w-full text-left text-micro"><caption className="sr-only">{info.title} measured results</caption><thead><tr>{data.columns.map(column => <th key={column} scope="col" className="p-2">{column}</th>)}</tr></thead><tbody>{data.rows.map((row, index) => <tr key={index}>{row.map((cell, index) => <td key={index} className="border-t border-border p-2">{cell ?? "Unknown"}</td>)}</tr>)}</tbody></table></div> : <p className="mt-4 text-body">No measurements in this time range.</p>}
      {data.links?.length ? <ul className="mt-3 text-body">{data.links.map(link => <li key={link.href}><a className="underline" href={link.href}>{link.label}</a></li>)}</ul> : null}
      <p className="mt-4 break-all text-micro text-muted-foreground">Source: {data.source}</p>
    </> : null}
    <p className="mt-3 font-code text-micro text-muted-foreground">{dataset.stale ? "Stale · " : ""}{dataset.updatedAt ? `${dataset.provenance === "synthetic" ? "Fixture dated" : "Measured"} ${dataset.updatedAt}` : "Awaiting measurements"}</p>
  </section>
}
