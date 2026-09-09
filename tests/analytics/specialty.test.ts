import assert from "node:assert/strict";
import { test } from "node:test";
import { activityCells, pageHealth, tokenTree } from "../../components/analytics/specialty-data";

test("heatmap preserves counts, UTC weekdays, and unobserved days", () => {
  const cells = activityCells([{ date: "2026-09-07", CLI: 37, Web: 11 }, { date: "2026-09-08", CLI: 12, Web: 3 }], ["CLI"]);
  assert.equal(cells[0].reduce((sum, cell) => sum + cell.value, 0), 37);
  assert.equal(cells[1].reduce((sum, cell) => sum + cell.value, 0), 12);
  assert.ok(cells[0].every(cell => cell.observed));
  assert.ok(cells[2].every(cell => !cell.observed));
  assert.equal(activityCells([], []).flat().reduce((sum, cell) => sum + cell.value, 0), 0);
});

test("treemap preserves model totals and tool shares when another model is hidden", () => {
  const rows = [{ name: "gpt-6-astra", value: 123, color: "blue" }, { name: "gpt-5.6-sol", value: 57, color: "green" }];
  const tree = tokenTree(rows);
  tree.forEach((model, index) => assert.equal(model.children.reduce((sum, tool) => sum + tool.value, 0), rows[index].value));
  assert.deepEqual(tokenTree(rows.slice(1)), tree.slice(1));
  assert.deepEqual(tokenTree([{ ...rows[0], value: 0 }]), []);
});

test("bubble load times are weighted by traffic; errors and views use selected days", () => {
  const daily = [{ date: "2026-09-07", "/": 1000 }, { date: "2026-09-08", "/": 100 }];
  const rows = [{ name: "/", value: 1100, color: "green" }];
  const [page] = pageHealth(daily, rows);
  assert.equal(page.views, 1100);
  assert.equal(page.seconds, 1.01);
  assert.equal(page.errors, 8);
  assert.equal(pageHealth(daily.slice(1), [{ ...rows[0], value: 100 }])[0].seconds, 1.12);
  assert.deepEqual(pageHealth(daily, []), []);
});
