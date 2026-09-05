import test from "node:test";
import assert from "node:assert/strict";
import { GRID, CARD_DEFINITIONS, activeDashboard, changeCard, createDashboard, initialState, overlaps, parseState, readingOrder, renameDashboard, reorderCard, selectDashboard, tidyDashboard } from "../site/dashboard/model.mjs";
import { browserStorage, STORAGE_KEY } from "../site/dashboard/storage.mjs";

function validCanvas(state) {
  for (const board of state.dashboards) {
    assert.deepEqual(Object.keys(board.cards).sort(), CARD_DEFINITIONS.map(({ id }) => id).sort());
    const cards = Object.values(board.cards);
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      assert.ok(Number.isInteger(card.x) && Number.isInteger(card.y));
      assert.ok(card.x >= 0 && card.y >= 0 && card.x + card.span <= GRID.columns);
      assert.ok(card.rows >= GRID.minRows && card.rows <= GRID.maxRows);
      for (let j = i + 1; j < cards.length; j++) assert.equal(overlaps(card, cards[j]), false);
    }
  }
}
test("new dashboards have independent layouts and selecting/renaming retains every edit", () => {
  const initial = initialState();
  const edited = changeCard(initial, "lighthouse", { x: 3, y: 4, span: 6, rows: 8 });
  const second = createDashboard(edited, "  Website   health ", "health");
  assert.equal(activeDashboard(second).name, "Website health");
  assert.deepEqual(second.dashboards[0].cards, edited.dashboards[0].cards);
  assert.notDeepEqual(second.dashboards[0].cards, second.dashboards[1].cards);
  const changedSecond = changeCard(second, "web-vitals", { span: 12, rows: 7 });
  assert.deepEqual(changedSecond.dashboards[0], edited.dashboards[0]);
  const renamed = renameDashboard(changedSecond, "health", "Performance");
  assert.deepEqual(activeDashboard(renamed).cards, activeDashboard(changedSecond).cards);
  assert.deepEqual(activeDashboard(selectDashboard(renamed, "overview")).cards, edited.dashboards[0].cards);
  assert.deepEqual(initial, initialState(), "mutations must not alter undo snapshots");
  validCanvas(renamed);
});
test("a drop onto occupied cells keeps the moved card fixed and pushes collisions down", () => {
  const state = initialState();
  const target = activeDashboard(state).cards["web-vitals"];
  const moved = changeCard(state, "lighthouse", { x: target.x, y: target.y, span: target.span });
  assert.deepEqual(activeDashboard(moved).cards.lighthouse, { ...target, span: target.span });
  assert.ok(activeDashboard(moved).cards["web-vitals"].y >= target.y + target.rows);
  validCanvas(moved);
});
test("resizing at the edge stays on canvas, and malformed geometry is bounded", () => {
  let state = changeCard(initialState(), "web-vitals", { span: 99, rows: -10, x: 999, y: -20 });
  assert.deepEqual(activeDashboard(state).cards["web-vitals"], { span: 12, rows: 4, x: 0, y: 0 });
  state = changeCard(state, "web-vitals", { span: NaN, rows: Infinity });
  validCanvas(state);
});
test("mobile/button reordering changes reading order and preserves widths, heights and other boards", () => {
  const state = createDashboard(initialState(), "Focus", "focus");
  const order = readingOrder(activeDashboard(state).cards);
  const last = order.at(-1);
  const moved = reorderCard(state, last, 0);
  assert.equal(readingOrder(activeDashboard(moved).cards)[0], last);
  assert.deepEqual(moved.dashboards[0], state.dashboards[0]);
  for (const id of order) {
    assert.equal(activeDashboard(moved).cards[id].span, activeDashboard(state).cards[id].span);
    assert.equal(activeDashboard(moved).cards[id].rows, activeDashboard(state).cards[id].rows);
  }
  validCanvas(moved);
});
test("many mixed drags/resizes/compactions keep all cards visible and non-overlapping", () => {
  let state = initialState();
  const ids = CARD_DEFINITIONS.map(({ id }) => id);
  let seed = 53;
  const random = (max) => { seed = (seed * 16807) % 2147483647; return seed % max; };
  for (let i = 0; i < 300; i++) {
    state = changeCard(state, ids[random(ids.length)], { x: random(15) - 2, y: random(25) - 2, span: random(15), rows: random(24) });
    if (i % 11 === 0) state = tidyDashboard(state);
    validCanvas(state);
  }
});
test("names reject emptiness/duplicates and renderable text stays plain data", () => {
  assert.throws(() => createDashboard(initialState(), "  ", "new"), /Enter/);
  assert.throws(() => createDashboard(initialState(), "OVERVIEW", "new"), /already exists/);
  assert.throws(() => renameDashboard(initialState(), "overview", "x".repeat(49)), /48/);
  const name = '<img src=x onerror="alert(1)">';
  assert.equal(activeDashboard(createDashboard(initialState(), name, "plain-text")).name, name);
});
test("persistence round-trips independent dashboards and normalizes missing/new cards", () => {
  const state = renameDashboard(changeCard(createDashboard(initialState(), "Build", "build"), "releases", { span: 8, rows: 8 }), "build", "Delivery");
  assert.deepEqual(parseState(JSON.stringify(state)), state);
  const saved = JSON.parse(JSON.stringify(state));
  delete saved.dashboards[1].cards.anomalies;
  saved.dashboards[1].cards.unknown = { x: 0, y: 0, span: 12, rows: 20 };
  saved.activeId = "missing";
  const restored = parseState(saved);
  assert.equal(restored.activeId, "overview");
  validCanvas(restored);
});
test("invalid persisted structure cannot replace a workspace", () => {
  for (const value of [null, {}, { version: 2 }, { version: 1, dashboards: [] }, "broken JSON"]) assert.throws(() => parseState(value));
  const duplicate = initialState(); duplicate.dashboards.push(duplicate.dashboards[0]);
  assert.throws(() => parseState(duplicate));
});
test("storage persists on save and restores the selected named dashboard", () => {
  const map = new Map();
  const adapter = browserStorage(() => ({ getItem: (key) => map.get(key), setItem: (key, value) => map.set(key, value) }));
  assert.deepEqual(adapter.load().state, initialState());
  const state = createDashboard(initialState(), "My work", "work");
  assert.equal(adapter.save(state).saved, true);
  assert.deepEqual(adapter.load().state, state);
});
test("storage failures preserve changes in memory and damaged saves are never overwritten", () => {
  const denied = browserStorage(() => { throw new Error("SecurityError"); });
  assert.deepEqual(denied.load().state, initialState());
  assert.equal(denied.save(initialState()).saved, false);
  let raw = "unreadable previous workspace";
  const damaged = browserStorage(() => ({ getItem: () => raw, setItem: (_key, value) => { raw = value; } }));
  damaged.load();
  assert.equal(damaged.save(createDashboard(initialState(), "Temporary", "temp")).saved, false);
  assert.equal(raw, "unreadable previous workspace");
  const full = browserStorage(() => ({ getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } }));
  full.load(); assert.equal(full.save(initialState()).saved, false);
  assert.equal(full.hasUnsavedChanges(), true, "external updates must not replace unsaved edits");
  assert.equal(STORAGE_KEY, "atlas-dashboards-v1");
});

test("successful retry clears the unsaved-edit guard for cross-tab updates", () => {
  let fail = true;
  const adapter = browserStorage(() => ({ getItem: () => null, setItem: () => { if (fail) throw new Error("quota"); } }));
  adapter.load();
  adapter.save(initialState());
  assert.equal(adapter.hasUnsavedChanges(), true);
  fail = false;
  adapter.save(initialState());
  assert.equal(adapter.hasUnsavedChanges(), false);
});
