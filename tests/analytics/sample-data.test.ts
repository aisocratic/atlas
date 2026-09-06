import assert from "node:assert/strict";
import { test } from "node:test";
import { filterAndGroup, sampleData, definitions } from "../../components/analytics/sample-data";

test("range includes both endpoints and empty windows remain empty", () => {
  const data = sampleData("turns", definitions[1].series);
  assert.equal(filterAndGroup(data, "2026-08-30", "2026-09-05", "day").length, 7);
  assert.deepEqual(filterAndGroup(data, "2027-01-01", "2027-01-07", "week"), []);
});
test("weekly counts preserve totals even for partial weeks", () => {
  const data = sampleData("turns", ["Model"]);
  const weekly = filterAndGroup(data, "2026-08-07", "2026-09-05", "week");
  assert.equal(weekly.reduce((n, row) => n + Number(row.Model), 0), data.reduce((n, row) => n + Number(row.Model), 0));
});
test("latency and percentage buckets average measurements rather than adding them", () => {
  const weekly = filterAndGroup([{ date: "2026-09-01", value: 1 }, { date: "2026-09-02", value: 3 }], "2026-09-01", "2026-09-02", "week", true);
  assert.equal(weekly[0].value, 2);
});

test("new chart types append without discarding a saved card arrangement", async () => {
  const { mergeSavedOrder } = await import("../../components/analytics/sample-data");
  assert.deepEqual(mergeSavedOrder(["turns", "usage"], ["usage", "turns", "roles"]), ["turns", "usage", "roles"]);
});

test("snapshot breakdowns use the last observation, while session counts sum the window", async () => {
  const { breakdownRows } = await import("../../components/analytics/sample-data");
  const roles = definitions.find(card => card.id === "roles")!;
  const roleData = sampleData(roles.id, roles.series);
  assert.equal(breakdownRows(roles, roleData)[0].value, roleData.at(-1)!.Founders);
  const devices = definitions.find(card => card.id === "devices")!;
  const deviceData = sampleData(devices.id, devices.series);
  assert.equal(breakdownRows(devices, deviceData)[0].value, deviceData.reduce((sum, row) => sum + Number(row.Desktop), 0));
  assert.equal(breakdownRows(roles, [])[0].value, 0);
});
