import type { CardInfo } from "../cards/types";
export const GRID = { columns: 12, unit: 42, gap: 12, minSpan: 3, minRows: 4, maxRows: 20 } as const;
export interface Tile { id: string; cardId: string; x: number; y: number; span: number; rows: number }
export interface CanvasLayout { version: 1; cards: Tile[] }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));
export const heightFor = (rows: number) => rows * (GRID.unit + GRID.gap) - GRID.gap;
export const overlaps = (a: Tile, b: Tile) => a.x < b.x + b.span && b.x < a.x + a.span && a.y < b.y + b.rows && b.y < a.y + a.rows;
export const readingOrder = (cards: Tile[]) => [...cards].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
export function settle(cards: Tile[], fixedId?: string): Tile[] {
  const ordered = readingOrder(cards); const fixed = ordered.find(card => card.id === fixedId);
  const result: Tile[] = [];
  for (const source of fixed ? [fixed, ...ordered.filter(card => card.id !== fixedId)] : ordered) {
    const card = { ...source };
    while (result.some(other => overlaps(card, other))) card.y++;
    result.push(card);
  }
  return readingOrder(result);
}
export function pack(cards: Tile[]): Tile[] {
  const result: Tile[] = [];
  for (const source of cards) {
    const card = { ...source, x: 0, y: 0 };
    while (result.some(other => overlaps(card, other))) { card.x++; if (card.x + card.span > GRID.columns) { card.x = 0; card.y++; } }
    result.push(card);
  }
  return result;
}
export function initialLayout(infos: readonly CardInfo[]): CanvasLayout {
  return { version: 1, cards: pack(infos.filter(info => info.defaultEnabled).map(info => ({ id: info.id, cardId: info.id, x: 0, y: 0, span: clamp(info.defaultLayout.width, GRID.minSpan, GRID.columns), rows: clamp(info.defaultLayout.height, GRID.minRows, GRID.maxRows) }))) };
}
export function validateLayout(value: unknown): CanvasLayout {
  if (!value || typeof value !== "object") throw new Error("Invalid dashboard layout.");
  const input = value as CanvasLayout;
  if (input.version !== 1 || !Array.isArray(input.cards) || input.cards.length > 40) throw new Error("A dashboard supports up to 40 cards.");
  const ids = new Set<string>();
  const cards = input.cards.map(card => {
    if (!card || typeof card !== "object" || typeof card.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(card.id) || ids.has(card.id) || typeof card.cardId !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(card.cardId)) throw new Error("Invalid or duplicate card identity.");
    ids.add(card.id);
    if (![card.x, card.y, card.span, card.rows].every(Number.isInteger) || card.span < GRID.minSpan || card.span > GRID.columns || card.rows < GRID.minRows || card.rows > GRID.maxRows || card.x < 0 || card.x + card.span > GRID.columns || card.y < 0 || card.y > 1800) throw new Error("Card geometry is outside the canvas limits.");
    return { id: card.id, cardId: card.cardId, x: card.x, y: card.y, span: card.span, rows: card.rows };
  });
  if (cards.some((card, index) => cards.slice(index + 1).some(other => overlaps(card, other)))) throw new Error("Cards must not overlap.");
  return { version: 1, cards };
}
export function changeCard(layout: CanvasLayout, id: string, changes: Partial<Pick<Tile, "x" | "y" | "span" | "rows">>): CanvasLayout {
  return { version: 1, cards: settle(layout.cards.map(card => {
    if (card.id !== id) return card;
    const span = clamp(changes.span ?? card.span, GRID.minSpan, GRID.columns);
    return { ...card, span, rows: clamp(changes.rows ?? card.rows, GRID.minRows, GRID.maxRows), x: clamp(changes.x ?? card.x, 0, GRID.columns - span), y: clamp(changes.y ?? card.y, 0, 1000) };
  }), id) };
}
export function reorderCard(layout: CanvasLayout, id: string, index: number): CanvasLayout {
  const ordered = readingOrder(layout.cards); const current = ordered.findIndex(card => card.id === id);
  if (current < 0) return layout;
  const [card] = ordered.splice(current, 1); ordered.splice(clamp(index, 0, ordered.length), 0, card);
  let x = 0, y = 0, rows = 0;
  return { version: 1, cards: ordered.map(card => {
    if (x + card.span > GRID.columns) { x = 0; y += rows; rows = 0; }
    const positioned = { ...card, x, y }; x += card.span; rows = Math.max(rows, card.rows); return positioned;
  }) };
}
