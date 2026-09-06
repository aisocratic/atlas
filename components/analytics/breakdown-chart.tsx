"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import type { Definition } from "./sample-data";

export interface BreakdownRow { name: string; value: number; color: string }
const number = (value: number) => value.toLocaleString("en-US");
const tooltipStyle = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)", fontSize: 12 };

export function BreakdownChart({ definition, rows }: { definition: Definition; rows: BreakdownRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const share = (value: number) => total ? value / total * 100 : 0;
  if (!rows.length || !total) return <p className="analytics-empty">No visible measurements. Select a series below.</p>;

  if (definition.kind === "donut") return <div className="breakdown-donut">
    <div className="breakdown-ring" role="img" aria-label={rows.map(row => `${row.name}: ${number(row.value)}, ${share(row.value).toFixed(1)}%`).join("; ")}>
      <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="value" nameKey="name" innerRadius="67%" outerRadius="92%" paddingAngle={2} cornerRadius={3} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>{rows.map(row => <Cell key={row.name} fill={row.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer>
      <div className="breakdown-center"><strong>{number(total)}</strong><small>people</small></div>
    </div>
    <ul className="breakdown-values">{rows.map(row => <li key={row.name}><i style={{ background: row.color }} /><span>{row.name}</span><strong>{number(row.value)}</strong><small>{share(row.value).toFixed(1)}%</small></li>)}</ul>
  </div>;

  if (definition.kind === "segmented" || definition.kind === "metrics") return <div className="breakdown-devices">
    <div className="breakdown-stat-grid">{rows.map(row => { const Icon = row.name === "Mobile" ? Smartphone : row.name === "Tablet" ? Tablet : Monitor; return <div key={row.name}><small>{row.name}</small>{definition.kind === "segmented" && <Icon size={28} style={{ color: row.color }} />}<strong>{number(row.value)}</strong>{definition.kind === "segmented" && <span>{share(row.value).toFixed(1)}%</span>}</div>; })}</div>
    {definition.kind === "segmented" ? <div className="breakdown-segments" role="img" aria-label={rows.map(row => `${row.name} ${share(row.value).toFixed(1)}%`).join(", ")}>{rows.map(row => <div key={row.name} title={`${row.name}: ${number(row.value)} sessions`} style={{ width: `${share(row.value)}%`, background: row.color }} />)}</div> : <p className="breakdown-note">Sessions, users, and new users overlap. These counts are not added together.</p>}
  </div>;

  if (definition.kind === "gauge") return <div className="breakdown-gauges">{rows.map(row => <div key={row.name}><svg viewBox="0 0 100 100" role="img" aria-label={`${row.name}: ${row.value} out of 100`}><circle cx="50" cy="50" r="40" fill="none" stroke="var(--muted)" strokeWidth="7" /><circle cx="50" cy="50" r="40" fill="none" stroke={row.value >= 90 ? "#74c4a5" : "#edbe49"} strokeWidth="7" strokeLinecap="round" pathLength="100" strokeDasharray={`${row.value} 100`} transform="rotate(-90 50 50)" /><text x="50" y="55" textAnchor="middle" fill="currentColor" fontSize="24">{row.value}</text></svg><span>{row.name}</span></div>)}</div>;

  const ordered = definition.kind === "ranking" ? [...rows].sort((a, b) => b.value - a.value) : rows;
  return <div className="breakdown-ranking">{ordered.map(row => <div key={row.name}><div className="breakdown-ranking-label"><span>{row.name}</span><small>{share(row.value).toFixed(1)}%</small><strong>{number(row.value)}</strong></div><div className="breakdown-track" role="progressbar" aria-label={row.name} aria-valuemin={0} aria-valuemax={total} aria-valuenow={row.value} aria-valuetext={`${number(row.value)}, ${share(row.value).toFixed(1)}% of displayed total`}><div style={{ width: `${share(row.value)}%`, background: row.color }} /></div></div>)}</div>;
}
