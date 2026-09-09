"use client";

import { useState } from "react";
import { CartesianGrid, LabelList, ResponsiveContainer, Scatter, ScatterChart, Tooltip, Treemap, XAxis, YAxis, ZAxis, type TreemapNode, type TooltipContentProps } from "recharts";
import type { Definition, Point } from "./sample-data";
import type { BreakdownRow } from "./breakdown-chart";
import { activityCells, pageHealth, tokenTree } from "./specialty-data";

const number = (value: number) => value.toLocaleString("en-US");
function ActivityHeatmap({ daily, rows }: { daily: Point[]; rows: BreakdownRow[] }) {
  const [selected, setSelected] = useState("");
  const cells = activityCells(daily, rows.map(row => row.name));
  const max = Math.max(1, ...cells.flat().map(cell => cell.value));
  return <div className="activity-heatmap">
    <div className="heatmap-scroll"><table aria-label="AI activity by weekday and hour UTC"><thead><tr><th scope="col">UTC</th>{cells[0].map(cell => <th scope="col" key={cell.hour}>{cell.hour % 3 === 0 ? String(cell.hour).padStart(2, "0") : <span className="sr-only">{cell.hour}</span>}</th>)}</tr></thead>
      <tbody>{cells.map(row => <tr key={row[0].day}><th scope="row">{row[0].day}</th>{row.map(cell => {
        const label = `${cell.day} ${String(cell.hour).padStart(2, "0")}:00 UTC · ${cell.observed ? `${number(cell.value)} turns` : "no data in range"}`;
        return <td key={cell.hour}><button aria-label={label} onMouseEnter={() => setSelected(label)} onFocus={() => setSelected(label)} onClick={() => setSelected(label)} style={{ background: cell.observed ? `color-mix(in srgb, #74c4a5 ${8 + cell.value / max * 92}%, var(--card))` : "var(--muted)" }} /></td>;
      })}</tr>)}</tbody></table></div>
    <div className="heatmap-scale"><span>0</span><i /><span>{number(max)} turns</span></div>
    <p className="specialty-note" role="status">{selected || "Hover or focus a cell to inspect activity."}</p>
    <p className="specialty-note">Total turns per weekday/hour in the selected range · synthetic hourly allocation.</p>
  </div>;
}

function TokenTile(node: TreemapNode) {
  const { x, y, width, height, depth, name, value } = node;
  if (!depth) return <g />;
  const leaf = !node.children?.length;
  const color = String(node.color);
  const labelLength = Math.max(1, Math.floor((width - 20) / 7));
  const label = name.length > labelLength ? `${name.slice(0, labelLength - 1)}…` : name;
  return <g>
    <rect className={leaf ? "token-tile" : undefined} x={x} y={y} width={width} height={height} fill={leaf ? `color-mix(in srgb, ${color} 20%, var(--card))` : "var(--card)"} stroke="var(--card)" strokeWidth={2} />
    {leaf && <>
      <path d={`M${x + 1},${y + height - 1} V${y + 1} H${x + width - 1}`} stroke={color} strokeWidth={2} fill="none" pointerEvents="none" />
      {width > 48 && height > 30 && <text x={x + 10} y={y + 21} fill="var(--foreground)" fontSize={11} fontWeight={500} pointerEvents="none">{label}</text>}
      {width > 75 && height > 62 && <text x={x + 10} y={y + 47} fill={color} fontSize={width > 140 ? 22 : 16} fontWeight={600} fontFamily="var(--font-mono), monospace" pointerEvents="none">{Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)}</text>}
    </>}
  </g>;
}

function SpecialtyTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return <div className="analytics-value-tooltip" role="status" aria-label="Selected chart values">
    <strong>{item.model ? `${item.model} · ${item.name}` : item.name}</strong>
    {item.views !== undefined ? <><p>{number(item.views)} page views</p><p>{item.seconds}s average load time</p><p>{number(item.errors)} errors</p></> : <p>{number(item.value)} tokens</p>}
  </div>;
}

export function SpecialtyChart({ definition, daily, rows }: { definition: Definition; daily: Point[]; rows: BreakdownRow[] }) {
  if (!daily.length) return <p className="analytics-empty">No sample measurements in this date range.</p>;
  if (!rows.some(row => row.value > 0)) return <p className="analytics-empty">No visible measurements. Select a series below.</p>;
  if (definition.kind === "heatmap") return <ActivityHeatmap key={daily.map(row => row.date).join() + rows.map(row => row.name).join()} daily={daily} rows={rows} />;
  if (definition.kind === "treemap") return <>
    <div className="analytics-plot specialty-plot"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <Treemap data={tokenTree(rows)} dataKey="value" nameKey="name" nodeInset={2} nodeGap={4} content={TokenTile} isAnimationActive={false}><Tooltip content={<SpecialtyTooltip />} /></Treemap>
    </ResponsiveContainer></div><p className="specialty-note">Area represents tokens. Colors group models; tiles show tools. Totals for the selected range.</p>
  </>;
  const pages = pageHealth(daily, rows);
  const maxErrors = Math.max(1, ...pages.map(page => page.errors));
  return <>
    <div className="analytics-plot specialty-plot"><ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <ScatterChart margin={{ top: 32, right: 26, bottom: 22, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 5" />
        <XAxis type="number" dataKey="views" name="Page views" axisLine={false} tickLine={false} tickMargin={10} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickFormatter={value => Intl.NumberFormat("en", { notation: "compact" }).format(value)} label={{ value: "Page views", position: "bottom", fill: "var(--muted-foreground)", fontSize: 10 }} />
        <YAxis type="number" dataKey="seconds" name="Average load time" unit="s" axisLine={false} tickLine={false} tickMargin={8} width={42} domain={[0, (max: number) => Math.ceil(max * 1.2)]} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
        <ZAxis type="number" dataKey="errors" range={[70, 1200]} domain={[0, maxErrors]} />
        <Tooltip content={<SpecialtyTooltip />} cursor={{ stroke: "var(--border)", strokeDasharray: "3 3" }} />
        {pages.map(page => <Scatter key={page.name} name={page.name} data={[page]} fill={page.color} fillOpacity={.18} stroke={page.color} strokeWidth={2.5} isAnimationActive={false}>
          <LabelList dataKey="name" position="top" offset={9} fill="var(--foreground)" fontSize={11} fontWeight={600} stroke="var(--card)" strokeWidth={3} paintOrder="stroke" />
        </Scatter>)}
      </ScatterChart>
    </ResponsiveContainer></div><p className="specialty-note">Bubble size represents errors (minimum size for visibility). Load time is weighted by page views. Selected-range totals.</p>
  </>;
}
