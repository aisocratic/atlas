/** Framework-independent canvas model. The row geometry matches AI Socratic admin. */
export const GRID = Object.freeze({ columns: 12, unit: 42, gap: 12, minSpan: 3, minRows: 4, maxRows: 20 });
export const CARD_DEFINITIONS = Object.freeze([
  { id: "lighthouse", title: "Lighthouse", span: 8, rows: 5 },
  { id: "web-vitals", title: "Core Web Vitals", span: 4, rows: 5 },
  { id: "region-latency", title: "Region latency", span: 4, rows: 6 },
  { id: "server-errors", title: "Server errors", span: 4, rows: 6 },
  { id: "releases", title: "Releases", span: 4, rows: 6 },
  { id: "code-quality", title: "Code quality", span: 4, rows: 5 },
  { id: "anomalies", title: "Anomalies", span: 8, rows: 5 },
]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, Math.round(value)));
const integer = (value, fallback, min, max) => Number.isFinite(value) ? clamp(value, min, max) : fallback;
export const heightFor = (rows) => rows * (GRID.unit + GRID.gap) - GRID.gap;
export const overlaps = (a, b) => a.x < b.x + b.span && b.x < a.x + a.span && a.y < b.y + b.rows && b.y < a.y + a.rows;
export const readingOrder = (cards) => Object.keys(cards).sort((a, b) => cards[a].y - cards[b].y || cards[a].x - cards[b].x || a.localeCompare(b));

/** Keep the manipulated card where it lands; push occupied cards down, never discard them. */
export function settle(cards, fixedId) {
  const result = {};
  const ids = readingOrder(cards);
  const queue = fixedId && cards[fixedId] ? [fixedId, ...ids.filter((id) => id !== fixedId)] : ids;
  for (const id of queue) {
    const card = { ...cards[id] };
    while (Object.values(result).some((placed) => overlaps(card, placed))) card.y++;
    result[id] = card;
  }
  return result;
}

export function pack(cards, order = readingOrder(cards)) {
  const result = {};
  for (const id of order) {
    const card = { ...cards[id], x: 0, y: 0 };
    while (true) {
      if (!Object.values(result).some((placed) => overlaps(card, placed))) break;
      card.x++;
      if (card.x + card.span > GRID.columns) { card.x = 0; card.y++; }
    }
    result[id] = card;
  }
  return result;
}

function defaultCards() {
  return pack(Object.fromEntries(CARD_DEFINITIONS.map(({ id, span, rows }) => [id, { x: 0, y: 0, span, rows }])), CARD_DEFINITIONS.map(({ id }) => id));
}
export function initialState() {
  return { version: 1, activeId: "overview", dashboards: [{ id: "overview", name: "Overview", cards: defaultCards() }] };
}
export function activeDashboard(state) { return state.dashboards.find(({ id }) => id === state.activeId); }

export function dashboardName(value, dashboards, exceptId) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new Error("Enter a dashboard name.");
  if (name.length > 48) throw new Error("Use 48 characters or fewer.");
  if (dashboards.some((board) => board.id !== exceptId && board.name.toLowerCase() === name.toLowerCase())) throw new Error("A dashboard with that name already exists.");
  return name;
}
export function createDashboard(state, name, id) {
  if (state.dashboards.length >= 20) throw new Error("You can create up to 20 dashboards in this workspace.");
  if (!/^[\w-]{1,80}$/.test(id) || state.dashboards.some((board) => board.id === id)) throw new Error("Dashboard ID must be unique.");
  const next = clone(state);
  next.dashboards.push({ id, name: dashboardName(name, state.dashboards), cards: defaultCards() });
  next.activeId = id;
  return next;
}
export function renameDashboard(state, id, name) {
  const next = clone(state);
  const board = next.dashboards.find((entry) => entry.id === id);
  if (!board) throw new Error("Dashboard not found.");
  board.name = dashboardName(name, state.dashboards, id);
  return next;
}
export function selectDashboard(state, id) {
  return state.dashboards.some((board) => board.id === id) ? { ...state, activeId: id } : state;
}
export function changeCard(state, id, changes) {
  const next = clone(state);
  const board = activeDashboard(next);
  const card = board.cards[id];
  if (!card) return state;
  const span = integer(changes.span, card.span, GRID.minSpan, GRID.columns);
  board.cards[id] = {
    span,
    rows: integer(changes.rows, card.rows, GRID.minRows, GRID.maxRows),
    x: integer(changes.x, card.x, 0, GRID.columns - span),
    y: integer(changes.y, card.y, 0, 1000),
  };
  // Widening from the right edge may move the left edge to keep the card on canvas.
  board.cards[id].x = Math.min(board.cards[id].x, GRID.columns - span);
  board.cards = settle(board.cards, id);
  return next;
}
export function reorderCard(state, id, targetIndex) {
  const next = clone(state);
  const board = activeDashboard(next);
  const order = readingOrder(board.cards);
  const current = order.indexOf(id);
  if (current === -1) return state;
  order.splice(current, 1);
  order.splice(clamp(targetIndex, 0, order.length), 0, id);
  // Shelf packing preserves the requested reading order and the saved widths.
  let x = 0, y = 0, rowHeight = 0;
  for (const key of order) {
    const card = board.cards[key];
    if (x + card.span > GRID.columns) { x = 0; y += rowHeight; rowHeight = 0; }
    board.cards[key] = { ...card, x, y };
    x += card.span;
    rowHeight = Math.max(rowHeight, card.rows);
  }
  return next;
}
export function tidyDashboard(state) {
  const next = clone(state);
  const board = activeDashboard(next);
  board.cards = pack(board.cards);
  return next;
}

/** Treat persisted data as untrusted. Reject damaged workspaces; normalize bounded geometry. */
export function parseState(raw) {
  const input = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!input || input.version !== 1 || !Array.isArray(input.dashboards) || !input.dashboards.length || input.dashboards.length > 20) throw new Error("Unsupported or damaged dashboard save.");
  const boards = [];
  for (const saved of input.dashboards) {
    if (!saved || typeof saved.id !== "string" || !/^[\w-]{1,80}$/.test(saved.id) || boards.some(({ id }) => id === saved.id) || !saved.cards || typeof saved.cards !== "object") throw new Error("Damaged dashboard save.");
    const cards = {};
    for (const definition of CARD_DEFINITIONS) {
      const rawCard = saved.cards[definition.id];
      if (!rawCard || typeof rawCard !== "object") continue;
      const span = integer(rawCard.span, definition.span, GRID.minSpan, GRID.columns);
      cards[definition.id] = { span, rows: integer(rawCard.rows, definition.rows, GRID.minRows, GRID.maxRows), x: integer(rawCard.x, 0, 0, GRID.columns - span), y: integer(rawCard.y, 0, 0, 1000) };
    }
    let bottom = Object.values(cards).reduce((max, card) => Math.max(max, card.y + card.rows), 0);
    for (const definition of CARD_DEFINITIONS) {
      if (!cards[definition.id]) { cards[definition.id] = { x: 0, y: bottom, span: definition.span, rows: definition.rows }; bottom += definition.rows; }
    }
    boards.push({ id: saved.id, name: dashboardName(saved.name, boards), cards: settle(cards) });
  }
  return { version: 1, activeId: boards.some(({ id }) => id === input.activeId) ? input.activeId : boards[0].id, dashboards: boards };
}
