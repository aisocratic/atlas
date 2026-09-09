export const definitions = [
  { id: "usage", title: "Personal usage", subtitle: "Daily usage by surface", category: "AI usage", kind: "bar", series: ["Desktop App", "Desktop (Work)", "CLI", "Cloud", "Web", "Mobile"], colors: ["#c73939", "#e25762", "#d650a0", "#354cc5", "#5584e8", "#a385dd"] },
  { id: "turns", title: "Turns", subtitle: "Conversation turns across models and surfaces", category: "AI usage", kind: "area", series: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4-mini", "gpt-6-astra"], colors: ["#cfe0fa", "#4f83ec", "#304e8d", "#bba2de", "#8254d8"] },
  { id: "plugins", title: "Plugin calls", subtitle: "Tools used across your workspace", category: "AI usage", kind: "area", series: ["Computer Use", "Browser", "Sites", "Chrome", "Documents", "Gmail"], colors: ["#cfe0fa", "#79a5e5", "#527fea", "#304e8d", "#9763d3", "#d977ba"] },
  { id: "skills", title: "Skills used", subtitle: "Specialist workflows invoked over time", category: "AI usage", kind: "area", series: ["Browser", "Sites Building", "Computer Use", "Chrome", "OpenAI Docs", "Other"], colors: ["#cfe0fa", "#79a5e5", "#304e8d", "#a793cf", "#8652d5", "#d977ba"] },
  { id: "performance", title: "Core Web Vitals", subtitle: "Largest contentful paint by device · seconds", category: "Engineering", kind: "line", series: ["Desktop", "Mobile"], colors: ["#74c4a5", "#e7b951"] },
  { id: "traffic", title: "First-party traffic", subtitle: "Page views by source", category: "Audience", kind: "area", series: ["Direct", "Search", "Social", "Referral"], colors: ["#cfe0fa", "#5484ec", "#304e8d", "#ad8ad7"] },
  { id: "roles", title: "Community Roles", subtitle: "Founders, engineers, researchers — community composition", category: "Community", kind: "donut", series: ["Founders", "Engineers", "Researchers", "Other roles", "Not reported"], colors: ["#edbe49", "#72859c", "#98a6b8", "#bac3cf", "#d5dae2"] },
  { id: "employment", title: "Working Status", subtitle: "Reported roles in the sample community", category: "Community", kind: "donut", series: ["In a role", "Self-employed", "Student", "Not reported"], colors: ["#edbe49", "#72859c", "#a4b0bf", "#d5dae2"] },
  { id: "devices", title: "Devices", subtitle: "Sessions by device · mutually exclusive sample categories", category: "Audience", kind: "segmented", series: ["Desktop", "Mobile", "Tablet"], colors: ["#edbe49", "#72859c", "#bac3cf"] },
  { id: "industries", title: "Industries", subtitle: "Where our people work, by sector", category: "Community", kind: "ranking", series: ["Software Development", "Technology & Internet", "IT Consulting", "Financial Services", "Education", "Other industries"], colors: ["#edbe49", "#72859c", "#8a9bb0", "#a4b0bf", "#bac3cf", "#d5dae2"] },
  { id: "newsletter", title: "Newsletter Signups by Source", subtitle: "Which surface produced each subscriber", category: "Community", kind: "ranking", series: ["Footer", "Home CTA", "Events page", "Blog post", "Referral"], colors: ["#edbe49", "#72859c", "#8a9bb0", "#a4b0bf", "#bac3cf"] },
  { id: "backlog", title: "Backlog", subtitle: "Open work by pipeline stage · latest snapshot in range", category: "Engineering", kind: "progress", series: ["Backlog", "Todo", "In Progress", "Review", "Done"], colors: ["#edbe49", "#edbe49", "#72b9dd", "#af8add", "#74c4a5"] },
  { id: "lighthouse", title: "Lighthouse Summary", subtitle: "Latest mobile audit in range · scores out of 100", category: "Engineering", kind: "gauge", series: ["Performance", "Accessibility", "Best Practices", "SEO"], colors: ["#edbe49", "#74c4a5", "#74c4a5", "#74c4a5"] },
  { id: "signups", title: "Signups", subtitle: "New registrations by account type", category: "Community", kind: "grouped", series: ["Users", "Members"], colors: ["#edbe49", "#72859c"] },
  { id: "errors", title: "Server Errors", subtitle: "Captured error events per period", category: "Engineering", kind: "bar", series: ["Errors"], colors: ["#e87979"] },
  { id: "luma", title: "Luma Referrals", subtitle: "Parallel counts for event-referred traffic, not conversion stages", category: "Events", kind: "metrics", series: ["Sessions", "Users", "New Users"], colors: ["#edbe49", "#72859c", "#74c4a5"] },
  { id: "visitor-flow", title: "Visitor flow", subtitle: "Sankey diagram · sources → landing pages → outcomes", category: "Audience", kind: "sankey", series: ["Direct", "Search", "Social", "Referral"], colors: ["#74c4a5", "#5484ec", "#ad8ad7", "#edbe49"] },
  { id: "activity-heatmap", title: "Activity heatmap", subtitle: "AI activity by weekday and hour · UTC", category: "AI usage", kind: "heatmap", series: ["Desktop App", "CLI", "Web"], colors: ["#74c4a5", "#5484ec", "#ad8ad7"] },
  { id: "token-map", title: "Token usage", subtitle: "Treemap · tokens by model and tool", category: "AI usage", kind: "treemap", series: ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra"], colors: ["#74c4a5", "#5484ec", "#ad8ad7"] },
  { id: "page-health", title: "Page health", subtitle: "Bubble chart · traffic, load time, and errors", category: "Engineering", kind: "bubble", series: ["/", "/blog", "/events", "/docs", "/pricing"], colors: ["#74c4a5", "#5484ec", "#ad8ad7", "#edbe49", "#e87979"] },
] as const;
export type Definition = typeof definitions[number];
export type Point = { date: string; [key: string]: string | number };
export const surfaces = ["Desktop App", "CLI", "Cloud", "Web"];
// Fixed synthetic dates and deterministic values: never presented as live telemetry.
export function sampleData(id: string, series: readonly string[]): Point[] {
  return Array.from({ length: 30 }, (_, day) => {
    const point: Point = { date: new Date(Date.UTC(2026, 7, 7 + day)).toISOString().slice(0, 10) };
    series.forEach((name, index) => {
      const wave = Math.max(0, Math.sin(day * .57 + index * .7) + .65);
      const spike = day === 4 || day === 22 ? 3.5 : 1;
      const scale = id === "token-map" ? 24000 : id === "page-health" ? 450 : id === "plugins" ? 55 : id === "skills" ? 6 : (id === "traffic" || id === "visitor-flow") ? 95 : id === "usage" ? 10 : 18;
      if (["roles", "employment", "industries", "backlog"].includes(id)) {
        const counts: Record<string, number[]> = { roles: [310, 245, 82, 285, 160], employment: [590, 280, 45, 167], industries: [390, 245, 160, 130, 95, 62], backlog: [320, 78, 24, 12, 410] };
        point[name] = counts[id][index] + Math.round(day * (index === 0 ? 1.2 : .3));
      } else if (id === "lighthouse") point[name] = Math.min(100, [82, 96, 98, 94][index] + Math.round(Math.sin(day / 4) * 3));
      else if (id === "devices") point[name] = Math.round((55 + day % 7 * 5) * [1, .68, .09][index]);
      else if (id === "luma") point[name] = Math.round((24 + day % 6 * 5) * [1, .8, .46][index]);
      else if (id === "newsletter" || id === "signups") point[name] = Math.round(wave * (id === "signups" ? 5 : 3) / (index + 1));
      else point[name] = id === "performance" ? Math.round((1.1 + index * .65 + wave * .32) * 100) / 100 : Math.round(wave * spike * scale / (index + 1));
    });
    return point;
  });
}
export function filterAndGroup(data: Point[], from: string, to: string, group: string, average = false): Point[] {
  const filtered = data.filter(point => point.date >= from && point.date <= to);
  if (group === "day") return filtered;
  const buckets = new Map<string, { point: Point; count: number }>();
  for (const row of filtered) {
    const date = new Date(`${row.date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const key = date.toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { point: { date: key }, count: 0 };
    bucket.count++;
    for (const [name, value] of Object.entries(row)) if (name !== "date") bucket.point[name] = Number(bucket.point[name] ?? 0) + Number(value);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map(({ point, count }) => Object.fromEntries(Object.entries(point).map(([key, value]) => [key, key === "date" ? value : average ? Math.round(Number(value) / count * 100) / 100 : value])) as Point);
}

export const snapshotIds = new Set(["roles", "employment", "industries", "backlog", "lighthouse"]);
export function breakdownRows(definition: Definition, data: Point[]) {
  return definition.series.map((name, index) => ({
    name,
    value: snapshotIds.has(definition.id) ? Number(data.at(-1)?.[name] ?? 0) : data.reduce((sum, point) => sum + Number(point[name] ?? 0), 0),
    color: definition.colors[index % definition.colors.length],
  }));
}
export function mergeSavedOrder(saved: readonly string[], available: readonly string[]): string[] {
  return [...new Set(saved.filter(id => available.includes(id))), ...available.filter(id => !saved.includes(id))];
}
