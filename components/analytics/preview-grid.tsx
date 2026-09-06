"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { ArrowUpToLine, GripVertical, Magnet, MoveDiagonal2, Undo2, Wand2 } from "lucide-react";
import { changeCard, GRID, heightFor, pack, readingOrder, reorderCard, validateLayout, type CanvasLayout, type Tile } from "@/lib/dashboard/model";
import type { Definition } from "./sample-data";

interface GridState { layout: CanvasLayout; snap: boolean; heights: Record<string, number> }
interface Gesture { id: string; kind: "move" | "x" | "y" | "both"; startX: number; startY: number; column: number; mobile: boolean; base: GridState; candidate: GridState; tile: Tile; moved: boolean }
const initial = (entries: readonly Definition[], wide: readonly string[]): GridState => ({ layout: { version: 1, cards: pack(entries.map(d => ({ id: d.id, cardId: d.id, x: 0, y: 0, span: wide.includes(d.id) ? 12 : 6, rows: 9 }))) }, snap: true, heights: {} });

export function PreviewGrid({ entries, view, wide, editing, children }: { entries: readonly Definition[]; view: string; wide: readonly string[]; editing: boolean; children: (definition: Definition) => ReactNode }) {
  const [state, setState] = useState<GridState>(() => initial(entries, wide));
  const [history, setHistory] = useState<GridState[]>([]), [ready, setReady] = useState(false), [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<GridState | null>(null), [moving, setMoving] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null), gesture = useRef<Gesture | null>(null);
  const storageKey = `atlas-analytics-grid-v1:${view}`;
  const entryIds = entries.map(d => d.id).join(",");
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const saved = JSON.parse(raw) as GridState;
          const layout = validateLayout(saved.layout);
          const ids = entryIds.split(",");
          const cards = layout.cards.filter(card => ids.includes(card.id));
          const bottom = cards.reduce((max, card) => Math.max(max, card.y + card.rows), 0);
          ids.filter(id => id && !cards.some(card => card.id === id)).forEach((id, index) => cards.push({ id, cardId: id, x: index % 2 * 6, y: bottom + Math.floor(index / 2) * 9, span: 6, rows: 9 }));
          const heights = Object.fromEntries(Object.entries(saved.heights ?? {}).filter(([id, value]) => ids.includes(id) && Number.isFinite(value) && value >= 204 && value <= 1068));
          setState({ layout: { version: 1, cards }, snap: saved.snap !== false, heights });
        }
      } catch { setNotice("Saved layout could not be read. The default layout is shown."); }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [storageKey, entryIds]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { queueMicrotask(() => setNotice("Browser storage is unavailable. Layout changes remain in this session.")); }
  }, [state, storageKey, ready]);
  useEffect(() => {
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z" && !(event.target as HTMLElement).closest("input,textarea,[role=combobox]")) {
        event.preventDefault();
        if (history.length) { setState(history.at(-1)!); setHistory(history.slice(0, -1)); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, history]);
  function commit(next: GridState) { setHistory(previous => [...previous.slice(-29), state]); setState(next); }
  function undo() { if (!history.length) return; setState(history.at(-1)!); setHistory(history.slice(0, -1)); }
  function start(event: PointerEvent<HTMLButtonElement>, tile: Tile, kind: Gesture["kind"]) {
    if (event.button !== 0 || gesture.current) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setMoving(tile.id);
    gesture.current = { id: tile.id, kind, startX: event.clientX, startY: event.clientY, column: (grid.current!.clientWidth + GRID.gap) / GRID.columns, mobile: matchMedia("(max-width: 1100px)").matches, base: state, candidate: state, tile, moved: false };
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current; if (!g) return;
    const dx = event.clientX - g.startX, dy = event.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 5) return;
    g.moved = true;
    if (g.kind === "move") {
      const layout = g.mobile ? reorderCard(g.base.layout, g.id, readingOrder(g.base.layout.cards).findIndex(card => card.id === g.id) + Math.round(dy / 220)) : changeCard(g.base.layout, g.id, { x: g.tile.x + Math.round(dx / g.column), y: g.tile.y + Math.round(dy / 54) });
      g.candidate = { ...g.base, layout };
    } else {
      const height = Math.max(204, Math.min(1068, (g.base.heights[g.id] ?? heightFor(g.tile.rows)) + (g.kind === "x" ? 0 : dy)));
      const rows = g.base.snap ? Math.round((height + 12) / 54) : Math.ceil((height + 12) / 54);
      const layout = changeCard(g.base.layout, g.id, { span: g.mobile || g.kind === "y" ? g.tile.span : g.tile.span + Math.round(dx / g.column), rows });
      g.candidate = { ...g.base, layout, heights: { ...g.base.heights, [g.id]: g.base.snap ? heightFor(Math.max(4, Math.min(20, rows))) : height } };
    }
    setPreview(g.candidate);
  }
  function finish(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const g = gesture.current; if (!g) return;
    gesture.current = null; setPreview(null); setMoving(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && g.moved) commit(g.candidate);
  }
  function handleProps(tile: Tile, kind: Gesture["kind"]) {
    return {
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, tile, kind), onPointerMove: move,
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event), onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Escape") { gesture.current = null; setPreview(null); setMoving(null); return; }
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0, dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        const mobile = matchMedia("(max-width: 1100px)").matches;
        const layout = kind === "move" && mobile ? reorderCard(state.layout, tile.id, readingOrder(state.layout.cards).findIndex(card => card.id === tile.id) + (dy || dx)) : changeCard(state.layout, tile.id, kind === "move" ? { x: tile.x + dx, y: tile.y + dy } : { span: mobile || kind === "y" ? tile.span : tile.span + dx, rows: kind === "x" ? tile.rows : tile.rows + dy });
        commit({ ...state, layout, heights: { ...state.heights, [tile.id]: heightFor(layout.cards.find(card => card.id === tile.id)!.rows) } });
      },
    };
  }
  const displayed = preview ?? state;
  return <section className="preview-canvas" aria-label={`${view} chart layout`}>
    {editing && <><div className="analytics-edit-bar">
      <button title="Organize cards by category and size" onClick={() => { const categories = ["Community", "Audience", "Events", "Engineering", "AI usage"]; const cards = [...state.layout.cards].sort((a, b) => categories.indexOf(entries.find(d => d.id === a.id)!.category) - categories.indexOf(entries.find(d => d.id === b.id)!.category) || b.span - a.span); commit({ ...state, layout: { version: 1, cards: pack(cards) } }); }}><Wand2 size={15} />Auto</button>
      <button title="Pack cards into free space, up and across" onClick={() => commit({ ...state, layout: { version: 1, cards: pack(readingOrder(state.layout.cards)) } })}><ArrowUpToLine size={15} />Compact</button>
      <button aria-pressed={state.snap} title="Auto-size card heights to whole grid rows" onClick={() => commit({ ...state, snap: !state.snap, heights: {} })}><Magnet size={15} />Snap</button>
      <button title="Restore the default layout" onClick={() => commit(initial(entries, []))}><Undo2 size={15} />Reset</button>
      <button disabled={!history.length} onClick={undo}><Undo2 size={15} />Undo</button>
      <span role="status">{notice || "Changes save automatically"}</span>
    </div><p className="preview-grid-help">Drag a card anywhere; overlapping cards move down. Drag an edge or the ↘ corner to resize. Arrow keys move or resize a focused handle. Ctrl/⌘+Z undoes the last change.</p></>}
    {notice && !editing && <p role="status">{notice}</p>}
    <div ref={grid} className={`preview-grid ${editing ? "is-editing" : ""}`} style={{ opacity: ready ? 1 : 0 }}>
      {readingOrder(state.layout.cards).map(tile => {
        const d = entries.find(entry => entry.id === tile.id); if (!d) return null;
        const position = displayed.layout.cards.find(card => card.id === tile.id)!;
        const height = displayed.snap ? heightFor(position.rows) : displayed.heights[tile.id] ?? heightFor(position.rows);
        return <article key={tile.id} data-card-id={tile.id} className={`analytics-card preview-grid-card ${editing ? "editing" : ""} ${moving === tile.id ? "is-moving" : ""}`} style={{ "--x": position.x + 1, "--y": position.y + 1, "--span": position.span, "--rows": position.rows, "--card-height": `${height}px` } as CSSProperties}>
          <div className="preview-grid-content" inert={editing}>{children(d)}</div>
          {editing && <><button className="preview-move-overlay" aria-label={`Move ${d.title} card`} {...handleProps(tile, "move")}><span><GripVertical size={15} />{d.title}</span></button><button className="preview-resize-edge x" aria-label={`Resize ${d.title} width`} {...handleProps(tile, "x")} /><button className="preview-resize-edge y" aria-label={`Resize ${d.title} height`} {...handleProps(tile, "y")} /><button className="preview-resize-corner" aria-label={`Resize ${d.title} card`} {...handleProps(tile, "both")}><MoveDiagonal2 size={16} /></button></>}
        </article>;
      })}
    </div>
  </section>;
}
