"use client";

import type { TooltipContentProps } from "recharts";

/** Matches the compact value panel used by AI Socratic's ChartTooltipContent. */
export function ChartValueTooltip({ active, payload, label, dates = false, unit = "", indicator = "dot" }: Partial<TooltipContentProps<number, string>> & { dates?: boolean; unit?: string; indicator?: "dot" | "line" }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(item => item.value !== undefined && item.value !== null && item.type !== "none");
  if (!rows.length) return null;
  const heading = dates && typeof label === "string" ? new Date(`${label}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
  return <div className="analytics-value-tooltip" role="status" aria-label="Selected chart values">
    {heading && <div className="analytics-value-date">{heading}</div>}
    {rows.map((item, index) => <div className="analytics-value-row" key={`${item.dataKey ?? item.name}-${index}`}>
      <i className={indicator === "line" ? "line" : ""} style={{ background: item.payload?.fill ?? item.payload?.color ?? item.color ?? "var(--muted-foreground)" }} />
      <span>{item.name}</span>
      <strong>{Number(item.value).toLocaleString("en-US", { maximumFractionDigits: 2 })}{unit}</strong>
    </div>)}
  </div>;
}
