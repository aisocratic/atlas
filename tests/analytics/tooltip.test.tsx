import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartValueTooltip } from "../../components/analytics/chart-tooltip";

test("selected values retain zero counts and format units", () => {
  const html = renderToStaticMarkup(<ChartValueTooltip active dates label="2026-09-05" unit="s" payload={[{ graphicalItemId: "desktop", name: "Desktop", value: 0, dataKey: "desktop", color: "#74c4a5" }, { graphicalItemId: "mobile", name: "Mobile", value: 1.57, dataKey: "mobile" }]} />);
  assert.match(html, /Sep 5, 2026/);
  assert.match(html, /0s/);
  assert.match(html, /1.57s/);
  assert.equal(renderToStaticMarkup(<ChartValueTooltip active={false} payload={[]} />), "");
});
