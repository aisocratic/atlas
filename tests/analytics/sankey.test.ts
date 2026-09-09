import assert from "node:assert/strict";
import { test } from "node:test";
import { visitorFlowData } from "../../components/analytics/sankey-data";
import { breakdownRows, definitions, filterAndGroup, sampleData } from "../../components/analytics/sample-data";

const definition = definitions.find(card => card.id === "visitor-flow")!;

test("Sankey conserves visits through each stage and respects date and source filters", () => {
  const daily = sampleData(definition.id, definition.series);
  const full = breakdownRows(definition, daily);
  const week = breakdownRows(definition, filterAndGroup(daily, "2026-08-30", "2026-09-05", "day"));
  assert.ok(week.reduce((sum, row) => sum + row.value, 0) < full.reduce((sum, row) => sum + row.value, 0));
  for (const rows of [full, week, week.filter(row => row.name === "Search")]) {
    const { nodes, links } = visitorFlowData(rows);
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    assert.equal(links.filter(link => nodes[link.source].stage === 0).reduce((sum, link) => sum + link.value, 0), total);
    assert.equal(links.filter(link => nodes[link.target].stage === 2).reduce((sum, link) => sum + link.value, 0), total);
    nodes.forEach((node, index) => {
      if (node.stage === 1) assert.equal(links.filter(link => link.target === index).reduce((sum, link) => sum + link.value, 0), links.filter(link => link.source === index).reduce((sum, link) => sum + link.value, 0));
    });
    assert.deepEqual(nodes.filter(node => node.stage === 0).map(node => node.name), rows.map(row => row.name));
  }
});

test("empty and tiny Sankey datasets never produce zero links or isolated nodes", () => {
  assert.deepEqual(visitorFlowData([]), { nodes: [], links: [] });
  assert.deepEqual(visitorFlowData([{ name: "Direct", value: 0, color: "blue" }]), { nodes: [], links: [] });
  const { nodes, links } = visitorFlowData([{ name: "Direct", value: 1, color: "blue" }]);
  assert.ok(links.every(link => link.value > 0 && nodes[link.source] && nodes[link.target]));
  assert.ok(nodes.every((_, index) => links.some(link => link.source === index || link.target === index)));
});
