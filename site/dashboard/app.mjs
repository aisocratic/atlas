import { GRID, CARD_DEFINITIONS, activeDashboard, changeCard, createDashboard, heightFor, parseState, readingOrder, renameDashboard, reorderCard, selectDashboard, tidyDashboard } from "./model.mjs";
import { browserStorage, STORAGE_KEY } from "./storage.mjs";

const $ = (id) => document.getElementById(id);
const workspace = $("dashboard-workspace");
const canvas = $("dashboard-canvas");
const tabs = $("dashboard-tabs");
const dialog = $("dashboard-name-dialog");
const storage = browserStorage();
const loaded = storage.load();
let state = loaded.state;
let editing = false;
let history = [];
let gesture = null;
let dialogMode = "create";
let dialogOpener = null;
const wide = window.matchMedia("(min-width: 1024px)");
const elements = new Map();
const titles = Object.fromEntries(CARD_DEFINITIONS.map(({ id, title }) => [id, title]));
$("dashboard-save-status").textContent = loaded.message;

function announce(message) { $("dashboard-announcement").textContent = message; }
function button(text, label, className = "card-tool") {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = text;
  element.setAttribute("aria-label", label);
  element.title = label;
  return element;
}
function commit(next, message, remember = true) {
  if (JSON.stringify(next) === JSON.stringify(state)) return;
  if (remember) { history.push(state); history = history.slice(-30); }
  state = next;
  $("dashboard-save-status").textContent = storage.save(state).message;
  render();
  if (message) announce(message);
}
function renderTabs() {
  const existing = new Map([...tabs.children].map((element) => [element.dataset.dashboardId, element]));
  for (const board of state.dashboards) {
    let tab = existing.get(board.id);
    if (!tab) {
      tab = button(board.name, board.name, "dashboard-tab");
      tab.dataset.dashboardId = board.id;
      tab.id = `dashboard-tab-${board.id}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "dashboard-canvas");
      tab.addEventListener("click", () => switchBoard(board.id));
      tab.addEventListener("keydown", (event) => {
        const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const index = state.dashboards.findIndex(({ id }) => id === board.id);
        const last = state.dashboards.length - 1;
        const next = event.key === "Home" ? 0 : event.key === "End" ? last : (index + (event.key === "ArrowRight" ? 1 : -1) + state.dashboards.length) % state.dashboards.length;
        switchBoard(state.dashboards[next].id);
        $("dashboard-tab-" + state.activeId).focus();
      });
      tabs.append(tab);
    }
    tab.textContent = board.name;
    tab.setAttribute("aria-label", board.name);
    tab.title = board.name;
    tab.setAttribute("aria-selected", String(board.id === state.activeId));
    tab.tabIndex = board.id === state.activeId ? 0 : -1;
    existing.delete(board.id);
  }
  for (const tab of existing.values()) tab.remove();
  canvas.setAttribute("aria-labelledby", "dashboard-tab-" + state.activeId);
}
function switchBoard(id) {
  if (gesture) finishGesture(false);
  commit(selectDashboard(state, id), `Opened ${state.dashboards.find((board) => board.id === id).name}.`, false);
}
function chooseSize(id, key, values, label) {
  const wrapper = document.createElement("label");
  wrapper.className = "card-size-field";
  const text = document.createElement("span"); text.textContent = label;
  const select = document.createElement("select");
  select.setAttribute("aria-label", `${label} of ${titles[id]}`);
  select.dataset.size = key;
  for (const [value, name] of values) { const option = document.createElement("option"); option.value = value; option.textContent = name; select.append(option); }
  select.addEventListener("change", () => commit(changeCard(state, id, { [key]: Number(select.value) }), `${titles[id]} resized.`));
  wrapper.append(text, select);
  return wrapper;
}
for (const card of canvas.querySelectorAll("[data-card-id]")) {
  const id = card.dataset.cardId;
  card.id = `dashboard-card-${id}`;
  card.setAttribute("aria-labelledby", `dashboard-title-${id}`);
  card.querySelector("h3").id = `dashboard-title-${id}`;
  const content = document.createElement("div"); content.className = "card-content";
  content.tabIndex = 0;
  content.setAttribute("role", "group");
  content.setAttribute("aria-label", `${titles[id]} sample metrics`);
  while (card.firstChild) content.append(card.firstChild);
  const controls = document.createElement("div"); controls.className = "card-edit-controls";
  const move = button("⠿ Move", `Move ${titles[id]}`, "card-tool card-move");
  move.dataset.handle = "move";
  move.setAttribute("aria-describedby", "dashboard-instructions");
  const before = button("↑", `Move ${titles[id]} earlier`);
  const after = button("↓", `Move ${titles[id]} later`);
  before.addEventListener("click", () => reorder(id, -1));
  after.addEventListener("click", () => reorder(id, 1));
  controls.append(move, before, after);
  const sizes = document.createElement("div"); sizes.className = "card-size-controls";
  sizes.append(chooseSize(id, "span", [[3,"¼"],[4,"⅓"],[6,"½"],[8,"⅔"],[12,"Full"]], "Width"), chooseSize(id, "rows", [[4,"Compact"],[5,"Medium"],[7,"Large"],[10,"Tall"]], "Height"));
  const resize = button("↘", `Resize ${titles[id]}`, "card-resize"); resize.dataset.handle = "resize";
  resize.setAttribute("aria-describedby", "dashboard-instructions");
  card.append(controls, content, sizes, resize);
  for (const handle of [move, resize]) {
    handle.addEventListener("pointerdown", (event) => startGesture(event, id, handle.dataset.handle));
    handle.addEventListener("keydown", (event) => handleKey(event, id, handle.dataset.handle));
  }
  elements.set(id, { card, controls, sizes, resize, before, after });
}
function reorder(id, delta) {
  const order = readingOrder(activeDashboard(state).cards);
  commit(reorderCard(state, id, order.indexOf(id) + delta), `${titles[id]} moved ${delta < 0 ? "earlier" : "later"}.`);
}
function handleKey(event, id, kind) {
  if (!editing || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
  const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
  const card = activeDashboard(state).cards[id];
  if (kind === "move" && !wide.matches) { if (dy || dx) reorder(id, dy || dx); return; }
  const changes = kind === "move" ? { x: card.x + dx, y: card.y + dy } : { span: card.span + (wide.matches ? dx : 0), rows: card.rows + dy };
  commit(changeCard(state, id, changes), `${titles[id]} ${kind === "move" ? "moved" : "resized"}.`);
}
function applyGeometry(board) {
  for (const [id, { card }] of elements) {
    const size = board.cards[id];
    card.style.setProperty("--card-area", `${size.y + 1} / ${size.x + 1} / span ${size.rows} / span ${size.span}`);
    card.style.setProperty("--card-height", `${heightFor(size.rows)}px`);
  }
}
function render() {
  const board = activeDashboard(state);
  renderTabs();
  workspace.classList.toggle("is-editing", editing);
  $("dashboard-edit").textContent = editing ? "Done" : "Edit layout";
  $("dashboard-edit").setAttribute("aria-pressed", String(editing));
  $("dashboard-edit-bar").hidden = !editing;
  $("dashboard-undo").disabled = history.length === 0;
  $("dashboard-create").disabled = state.dashboards.length >= 20;
  const order = readingOrder(board.cards);
  const focused = document.activeElement;
  for (const [index, id] of order.entries()) {
    const entry = elements.get(id);
    // Only move a node if order changed. Preserve focus for keyboard resizing/reordering.
    if (canvas.children[index] !== entry.card) canvas.insertBefore(entry.card, canvas.children[index] ?? null);
    entry.controls.hidden = !editing; entry.sizes.hidden = !editing; entry.resize.hidden = !editing;
    entry.before.disabled = index === 0; entry.after.disabled = index === order.length - 1;
    for (const select of entry.sizes.querySelectorAll("select")) {
      select.querySelector('[data-custom]')?.remove();
      const value = board.cards[id][select.dataset.size];
      if (![...select.options].some((option) => Number(option.value) === value)) {
        const option = document.createElement("option"); option.value = value; option.textContent = select.dataset.size === "span" ? `${value}/12` : `${heightFor(value)}px`; option.dataset.custom = ""; select.append(option);
      }
      select.value = value;
      if (select.dataset.size === "span") select.disabled = !wide.matches;
    }
  }
  applyGeometry(board);
  if (focused && focused !== document.activeElement && canvas.contains(focused)) focused.focus({ preventScroll: true });
}

/** Pointer events cover mouse, pen and touch; capture keeps fast drags from losing their release. */
function startGesture(event, id, kind) {
  if (!editing || event.button !== 0 || gesture) return;
  event.preventDefault();
  event.currentTarget.focus({ preventScroll: true });
  const card = elements.get(id).card;
  gesture = { id, kind, pointerId: event.pointerId, handle: event.currentTarget, startX: event.clientX, startY: event.clientY, startScroll: window.scrollY, base: state, candidate: state, card: activeDashboard(state).cards[id], columnStep: (canvas.clientWidth - 28 + GRID.gap) / GRID.columns, mobile: !wide.matches, moved: false };
  gesture.handle.setPointerCapture(event.pointerId);
  gesture.handle.addEventListener("lostpointercapture", () => finishGesture(false), { once: true });
  card.classList.add("is-manipulating");
  workspace.classList.add("is-manipulating");
}
window.addEventListener("pointermove", (event) => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY + window.scrollY - gesture.startScroll;
  if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
  gesture.moved = true;
  const { id, kind, card, base, mobile } = gesture;
  if (kind === "move" && mobile) {
    const order = readingOrder(activeDashboard(base).cards);
    const others = order.filter((key) => key !== id);
    const index = others.filter((key) => {
      const rect = elements.get(key).card.getBoundingClientRect();
      return event.clientY >= rect.top + rect.height / 2;
    }).length;
    gesture.candidate = reorderCard(base, id, index);
    for (const [key, entry] of elements) entry.card.classList.toggle("is-drop-target", key === order[index] && key !== id);
    elements.get(id).card.style.transform = `translateY(${dy}px)`;
  } else {
    const changes = kind === "move"
      ? { x: card.x + Math.round(dx / gesture.columnStep), y: card.y + Math.round(dy / (GRID.unit + GRID.gap)) }
      : { span: card.span + (mobile ? 0 : Math.round(dx / gesture.columnStep)), rows: card.rows + Math.round(dy / (GRID.unit + GRID.gap)) };
    gesture.candidate = changeCard(base, id, changes);
    applyGeometry(activeDashboard(gesture.candidate));
  }
});
function finishGesture(save = true) {
  if (!gesture) return;
  const finished = gesture; gesture = null;
  if (finished.handle.hasPointerCapture(finished.pointerId)) finished.handle.releasePointerCapture(finished.pointerId);
  workspace.classList.remove("is-manipulating");
  for (const { card } of elements.values()) { card.classList.remove("is-manipulating", "is-drop-target"); card.style.removeProperty("transform"); }
  if (save && finished.moved) commit(finished.candidate, `${titles[finished.id]} ${finished.kind === "move" ? "moved" : "resized"}.`);
  render();
}
window.addEventListener("pointerup", (event) => { if (gesture?.pointerId === event.pointerId) finishGesture(); });
window.addEventListener("pointercancel", (event) => { if (gesture?.pointerId === event.pointerId) finishGesture(false); });
window.addEventListener("blur", () => finishGesture(false));
wide.addEventListener("change", () => { finishGesture(false); render(); });

$("dashboard-edit").addEventListener("click", () => { editing = !editing; render(); });
function undo() {
  if (!history.length) return;
  const previous = history.pop();
  commit(previous, "Last change undone.", false);
}
$("dashboard-undo").addEventListener("click", undo);
$("dashboard-tidy").addEventListener("click", () => commit(tidyDashboard(state), "Cards arranged to fill empty space."));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && gesture) { event.preventDefault(); finishGesture(false); announce("Move or resize cancelled."); }
  if (editing && !dialog.open && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey && !event.target.closest("input, textarea, select")) { event.preventDefault(); undo(); }
});
function openNameDialog(mode, opener) {
  dialogMode = mode; dialogOpener = opener;
  const create = mode === "create";
  $("dashboard-dialog-title").textContent = create ? "New dashboard" : "Rename dashboard";
  $("dashboard-dialog-description").textContent = create ? "Start with the sample cards, then make this layout your own." : "Your cards and layout will stay in place.";
  $("dashboard-name-submit").textContent = create ? "Create dashboard" : "Save name";
  $("dashboard-name").value = create ? "" : activeDashboard(state).name;
  $("dashboard-name-error").textContent = "";
  $("dashboard-name").removeAttribute("aria-invalid");
  dialog.showModal();
  $("dashboard-name").focus(); $("dashboard-name").select();
}
$("dashboard-create").addEventListener("click", (event) => openNameDialog("create", event.currentTarget));
$("dashboard-rename").addEventListener("click", (event) => openNameDialog("rename", event.currentTarget));
$("dashboard-name-cancel").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => dialogOpener?.focus());
$("dashboard-name-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const next = dialogMode === "create" ? createDashboard(state, $("dashboard-name").value, crypto.randomUUID()) : renameDashboard(state, state.activeId, $("dashboard-name").value);
    commit(next, `${activeDashboard(next).name} ${dialogMode === "create" ? "created" : "renamed"}.`);
    dialog.close();
    $("dashboard-tab-" + state.activeId).focus();
  } catch (error) {
    $("dashboard-name-error").textContent = error.message;
    $("dashboard-name").setAttribute("aria-invalid", "true");
    $("dashboard-name").focus();
  }
});
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  if (storage.hasUnsavedChanges()) { announce("Another tab changed this workspace. Your unsaved local edits have been kept."); return; }
  if (gesture || dialog.open) { announce("Another tab changed this workspace. Finish this edit to keep your local changes."); return; }
  try { state = parseState(event.newValue); history = []; render(); $("dashboard-save-status").textContent = "Updated from another browser tab"; } catch { /* Preserve the currently valid workspace. */ }
});
canvas.setAttribute("role", "tabpanel");
canvas.tabIndex = 0;
workspace.classList.add("dashboard-ready");
$("dashboard-toolbar").hidden = false;
render();
