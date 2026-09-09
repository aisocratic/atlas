import type { BreakdownRow } from "./breakdown-chart";
import type { Point } from "./sample-data";

// Split integer counts without losing visits or tokens to rounding.
function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  let cumulative = 0, assigned = 0;
  return weights.map(weight => {
    cumulative += weight;
    const next = Math.round(total * cumulative / sum);
    const value = next - assigned;
    assigned = next;
    return value;
  });
}

export const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function activityCells(daily: Point[], names: string[]) {
  const cells = weekdays.map(day => Array.from({ length: 24 }, (_, hour) => ({ day, hour, value: 0, observed: false })));
  daily.forEach(point => {
    const day = (new Date(`${point.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const total = names.reduce((sum, name) => sum + Number(point[name] ?? 0), 0);
    const weights = Array.from({ length: 24 }, (_, hour) => 1 + 9 * Math.exp(-((hour - 14) ** 2) / 20) + 4 * Math.exp(-((hour - 9) ** 2) / 5));
    allocate(total, weights).forEach((value, hour) => { cells[day][hour].value += value; cells[day][hour].observed = true; });
  });
  return cells;
}

export function tokenTree(rows: BreakdownRow[]) {
  return rows.filter(row => row.value > 0).map(row => {
    const index = ["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra"].indexOf(row.name);
    const amounts = allocate(row.value, [5 - index, 3 + index, 2]);
    return { name: row.name, color: row.color, children: ["Browser", "Code", "Documents"].map((tool, i) => ({ name: tool, model: row.name, value: amounts[i], color: row.color })).filter(tool => tool.value > 0) };
  });
}

export function pageHealth(daily: Point[], rows: BreakdownRow[]) {
  const paths = ["/", "/blog", "/events", "/docs", "/pricing"];
  return rows.filter(row => row.value > 0).map(row => {
    const index = paths.indexOf(row.name);
    let duration = 0, errors = 0;
    daily.forEach(point => {
      const views = Number(point[row.name] ?? 0);
      const day = new Date(`${point.date}T00:00:00Z`).getUTCDate();
      duration += views * (1 + index * .55 + (day % 7) * .12);
      errors += Math.floor(views * [.008, .018, .055, .003, .035][index]);
    });
    return { name: row.name, views: row.value, seconds: Math.round(duration / row.value * 100) / 100, errors, color: row.color };
  });
}
