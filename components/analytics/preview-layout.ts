import { canonicalCardId, canonicalCardIds, type CardIdAliases } from "@/lib/dashboard/card-ids";
import { readingOrder, validateLayout, type CanvasLayout, type Tile } from "@/lib/dashboard/model";
import { mergeSavedOrder } from "./sample-data";

// Reading the analytics preview's saves back from localStorage. Pure, so a
// save made before a card was renamed can be tested: its old id maps to the
// new one through the preview's alias table, rather than being dropped (which
// used to discard the whole saved arrangement) or placed twice.

export interface Arrangement { order: string[]; wide: string[]; favourites: string[] }
export interface GridState { layout: CanvasLayout; snap: boolean; heights: Record<string, number> }

/** The saved order, wide cards and favourites, by current id; null when the save is unreadable. Unknown ids are dropped, new cards appended. */
export function restoreArrangement(saved: unknown, available: readonly string[], aliases: CardIdAliases): Arrangement | null {
  if (!saved || typeof saved !== "object") return null;
  const { order, wide, favourites } = saved as Partial<Record<keyof Arrangement, unknown>>;
  const list = (value: unknown) => Array.isArray(value) && value.every(id => typeof id === "string") ? canonicalCardIds(value, aliases).filter(id => available.includes(id)) : null;
  const [savedOrder, savedWide, savedFavourites] = [list(order), list(wide), list(favourites)];
  if (!savedOrder || !savedWide || !savedFavourites) return null;
  return { order: mergeSavedOrder(savedOrder, available), wide: savedWide, favourites: savedFavourites };
}

/**
 * A view's saved grid, by current id. A card saved under its old id keeps its
 * place, unless the save also has it under its new id: then that one wins.
 * Cards the view shows but the save lacks go below the rest, `spanFor` wide.
 */
export function restoreGrid(saved: unknown, ids: readonly string[], aliases: CardIdAliases, spanFor: (id: string) => number = () => 6): GridState {
  const state = (saved ?? {}) as Partial<GridState>;
  const canonical = (id: string) => canonicalCardId(id, aliases);
  const layout = validateLayout(state.layout, {});
  const cards: Tile[] = [];
  // Cards already under their current id first, so they win over a renamed copy.
  for (const card of [...layout.cards].sort((a, b) => Number(canonical(a.id) !== a.id) - Number(canonical(b.id) !== b.id))) {
    const id = canonical(card.id);
    if (ids.includes(id) && !cards.some(other => other.id === id)) cards.push({ ...card, id, cardId: canonical(card.cardId) });
  }
  const bottom = cards.reduce((max, card) => Math.max(max, card.y + card.rows), 0);
  let x = 0, y = bottom;
  for (const id of ids.filter(id => id && !cards.some(card => card.id === id))) {
    const span = spanFor(id);
    if (x + span > 12) { x = 0; y += 9; }
    cards.push({ id, cardId: id, x, y, span, rows: 9 });
    x += span;
  }
  const heights: Record<string, number> = {};
  for (const [id, value] of Object.entries(state.heights ?? {}).sort(([a], [b]) => Number(canonical(a) !== a) - Number(canonical(b) !== b))) {
    const current = canonical(id);
    if (ids.includes(current) && !(current in heights) && Number.isFinite(value) && value >= 204 && value <= 1068) heights[current] = value;
  }
  return { layout: { version: 1, cards: readingOrder(cards) }, snap: state.snap !== false, heights };
}
