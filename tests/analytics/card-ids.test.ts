import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalCardId, canonicalCardIds } from "../../lib/dashboard/card-ids";
import { validateLayout } from "../../lib/dashboard/model";
import { restoreArrangement, restoreGrid } from "../../components/analytics/preview-layout";
import { definitions, renamedCardIds } from "../../components/analytics/sample-data";

const aliases = { performance: "web-vitals", "old-name": "middle-name", "middle-name": "new-name", loop: "loop-back", "loop-back": "loop" };
const available = definitions.map(d => d.id);

test("an old id maps to the current one, through every rename and never round a loop", () => {
  assert.equal(canonicalCardId("performance", aliases), "web-vitals");
  assert.equal(canonicalCardId("old-name", aliases), "new-name");
  assert.equal(canonicalCardId("turns", aliases), "turns");
  assert.ok(["loop", "loop-back"].includes(canonicalCardId("loop", aliases)));
  assert.equal(canonicalCardId("constructor", aliases), "constructor");
  assert.deepEqual(canonicalCardIds(["performance", "turns", "web-vitals"], aliases), ["web-vitals", "turns"]);
  assert.equal(canonicalCardId("performance", renamedCardIds), "web-vitals");
});

test("a saved arrangement naming a renamed card keeps it, once, where it was", () => {
  const restored = restoreArrangement({ order: ["turns", "performance", "usage", "web-vitals", "retired-card"], wide: ["performance"], favourites: ["performance", "web-vitals"] }, available, renamedCardIds)!;
  assert.deepEqual(restored.order.slice(0, 3), ["turns", "web-vitals", "usage"]);
  assert.equal(restored.order.length, available.length);
  assert.equal(new Set(restored.order).size, restored.order.length);
  assert.deepEqual(restored.wide, ["web-vitals"]);
  assert.deepEqual(restored.favourites, ["web-vitals"]);
  assert.equal(restoreArrangement({ order: "turns" }, available, renamedCardIds), null);
  assert.equal(restoreArrangement(null, available, renamedCardIds), null);
});

test("a saved grid keeps a renamed card's place and size, preferring a copy already under the new id", () => {
  const ids = ["usage", "web-vitals", "turns", "releases"];
  const old = { layout: { version: 1, cards: [{ id: "usage", cardId: "usage", x: 0, y: 0, span: 6, rows: 9 }, { id: "performance", cardId: "performance", x: 6, y: 0, span: 6, rows: 12 }] }, snap: false, heights: { performance: 600 } };
  const restored = restoreGrid(old, ids, renamedCardIds, id => (id === "releases" ? 12 : 6));
  assert.deepEqual(restored.layout.cards.find(card => card.id === "web-vitals"), { id: "web-vitals", cardId: "web-vitals", x: 6, y: 0, span: 6, rows: 12 });
  assert.deepEqual(restored.heights, { "web-vitals": 600 });
  assert.equal(restored.snap, false);
  // Missing cards go underneath: turns, then releases full width on the next row.
  assert.deepEqual(restored.layout.cards.filter(card => ["turns", "releases"].includes(card.id)).map(card => [card.id, card.x, card.y, card.span]), [["turns", 0, 12, 6], ["releases", 0, 21, 12]]);
  const both = { layout: { version: 1, cards: [{ id: "performance", cardId: "performance", x: 0, y: 0, span: 6, rows: 9 }, { id: "web-vitals", cardId: "web-vitals", x: 6, y: 0, span: 6, rows: 9 }] }, heights: { performance: 300, "web-vitals": 500 } };
  const once = restoreGrid(both, ["web-vitals"], renamedCardIds);
  assert.deepEqual(once.layout.cards.map(card => [card.id, card.x]), [["web-vitals", 6]]);
  assert.deepEqual(once.heights, { "web-vitals": 500 });
  assert.throws(() => restoreGrid({ layout: "nonsense" }, ids, renamedCardIds));
});

test("a live dashboard tile that placed a renamed card shows it under the new id", () => {
  const layout = validateLayout({ version: 1, cards: [{ id: "old-name", cardId: "old-name", x: 0, y: 0, span: 6, rows: 6 }, { id: "tile-2", cardId: "releases", x: 6, y: 0, span: 6, rows: 6 }] }, aliases);
  assert.deepEqual(layout.cards.map(card => [card.id, card.cardId]), [["old-name", "new-name"], ["tile-2", "releases"]]);
  // With no aliases, ids pass through untouched.
  assert.equal(validateLayout({ version: 1, cards: [{ id: "a", cardId: "old-name", x: 0, y: 0, span: 6, rows: 6 }] }, {}).cards[0].cardId, "old-name");
});

test("the dataset route answers a renamed card's old id with the card itself", async () => {
  const { createCardHandlers } = await import("../../lib/cards/handlers");
  const asked: string[] = [];
  const services = { dataset: async (id: string) => { asked.push(id); return { id, status: "ready" }; } } as unknown as import("../../lib/cards/service").CardServices;
  const handlers = createCardHandlers({ authorize: async () => ({ ok: true }), services: () => services, aliases: { "old-releases": "releases" } });
  const response = await handlers.dataset(new Request("http://127.0.0.1/api/datasets/old-releases"), "old-releases");
  assert.equal(response.status, 200);
  assert.deepEqual(asked, ["releases"]);
});
