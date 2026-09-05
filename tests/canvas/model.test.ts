import { test } from "node:test";
import assert from "node:assert/strict";
import { changeCard, initialLayout, overlaps, pack, readingOrder, reorderCard, validateLayout, type CanvasLayout } from "../../lib/dashboard/model";
const layout: CanvasLayout = { version: 1, cards: [{ id: "a", cardId: "region-latency", x: 0, y: 0, span: 4, rows: 6 }, { id: "b", cardId: "region-latency", x: 4, y: 0, span: 4, rows: 6 }] };
test("moving or resizing keeps the chosen tile and pushes occupied tiles without loss", () => {
  const moved = changeCard(layout, "a", { x: 4 }); assert.equal(moved.cards.length, 2);
  assert.equal(moved.cards.find(card => card.id === "a")!.y, 0); assert.equal(moved.cards.find(card => card.id === "b")!.y, 6);
  const resized = changeCard(layout, "a", { span: 12, rows: 100 }); assert.equal(resized.cards[0].rows, 20); assert.equal(resized.cards[1].y, 20);
  assert.equal(overlaps(...resized.cards as [typeof resized.cards[0], typeof resized.cards[0]]), false);
  assert.deepEqual(validateLayout(resized), resized); assert.equal(layout.cards[0].span, 4);
});
test("reordering is deterministic and packing retains each instance", () => {
  const reordered = reorderCard(layout, "b", 0); assert.deepEqual(readingOrder(reordered.cards).map(card => card.id), ["b", "a"]);
  assert.deepEqual(pack(reordered.cards), reordered.cards); assert.deepEqual(reorderCard(layout, "missing", 0), layout);
});
test("persisted geometry rejects overlap, unsafe bounds, duplicate IDs, and overlarge layouts", () => {
  for (const bad of [null, {}, { ...layout, version: 2 }, { ...layout, cards: [...layout.cards, layout.cards[0]] }, { ...layout, cards: [{ ...layout.cards[0], span: 13 }] }, { ...layout, cards: [{ ...layout.cards[0], x: -1 }] }, { ...layout, cards: [{ ...layout.cards[0], rows: 4.1 }] }, { ...layout, cards: [{ ...layout.cards[0], id: "__proto__" }] }, { ...layout, cards: [{ ...layout.cards[0], x: 4 }, layout.cards[1]] }]) assert.throws(() => validateLayout(bad));
  assert.throws(() => validateLayout({ version: 1, cards: Array.from({ length: 41 }, (_, index) => ({ ...layout.cards[0], id: `card-${index}`, y: index * 6 })) }));
  assert.deepEqual(initialLayout([]), { version: 1, cards: [] }); assert.deepEqual(validateLayout({ version: 1, cards: [] }), { version: 1, cards: [] });
});
