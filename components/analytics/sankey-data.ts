import type { BreakdownRow } from "./breakdown-chart";

/** Synthetic journeys: each visit has exactly one landing page and outcome. */
export function visitorFlowData(rows: BreakdownRow[]) {
  const sources = rows.filter(row => row.value > 0);
  if (!sources.length) return { nodes: [], links: [] };
  const pages = ["Home", "Blog", "Events"];
  const nodes = [
    ...sources.map(row => ({ name: row.name, color: row.color, stage: 0 })),
    ...pages.map(name => ({ name, color: "#72859c", stage: 1 })),
    { name: "Signed up", color: "#74c4a5", stage: 2 },
    { name: "Left site", color: "#a4b0bf", stage: 2 },
  ];
  const links: { source: number; target: number; value: number }[] = [];
  const pageTotals = [0, 0, 0];
  sources.forEach((row, source) => {
    const home = Math.floor(row.value * (row.name === "Direct" ? .6 : .25));
    const blog = Math.floor(row.value * (row.name === "Search" ? .6 : .25));
    [home, blog, row.value - home - blog].forEach((value, page) => {
      pageTotals[page] += value;
      if (value > 0) links.push({ source, target: sources.length + page, value });
    });
  });
  pageTotals.forEach((total, page) => {
    const signups = Math.floor(total * [.12, .06, .24][page]);
    [signups, total - signups].forEach((value, outcome) => {
      if (value > 0) links.push({ source: sources.length + page, target: sources.length + pages.length + outcome, value });
    });
  });
  // Recharts must not receive isolated zero-value nodes after filtering.
  const used = nodes.map((_, index) => index).filter(index => links.some(link => link.source === index || link.target === index));
  return { nodes: used.map(index => nodes[index]), links: links.map(link => ({ ...link, source: used.indexOf(link.source), target: used.indexOf(link.target) })) };
}
