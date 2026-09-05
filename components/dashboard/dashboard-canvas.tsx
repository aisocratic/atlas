"use client";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { GripVertical, MoveDown, MoveUp, Plus, Maximize2, Trash2, Undo2 } from "lucide-react";
import { cardRegistry } from "@/cards/registry";
import { cardComponents } from "@/cards/components";
import type { DatasetEnvelope } from "@/lib/cards/types";
import { GRID, changeCard, heightFor, pack, readingOrder, reorderCard, type CanvasLayout, type Tile } from "@/lib/dashboard/model";
import type { DashboardView } from "@/lib/dashboard/service";
import { api, fetchDataset } from "@/lib/dashboard/client";
import { useWorkspace } from "./use-workspace";
import "./dashboard.css";
interface Gesture { id: string; kind: "move" | "resize"; pointerId: number; x: number; y: number; column: number; mobile: boolean; base: CanvasLayout; candidate: CanvasLayout; tile: Tile; centers: number[]; moved: boolean }
export function DashboardCanvas({ initial, selectedId }: { initial: DashboardView[]; selectedId?: string }) {
  const store = useWorkspace(initial);
  const [activeId, setActiveId] = useState(selectedId && initial.some(board => board.id === selectedId) ? selectedId : initial[0]?.id ?? "");
  const [editing, setEditing] = useState(false); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"create" | "rename" | "delete" | null>(null); const [name, setName] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null); const gridRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null); const [preview, setPreview] = useState<CanvasLayout | null>(null);
  const datasetGeneration = useRef<Record<string, number>>({}); const collectingRef = useRef<string | null>(null);
  const [datasets, setDatasets] = useState<Record<string, DatasetEnvelope>>({}); const [collecting, setCollecting] = useState<string | null>(null);
  const active = store.boards.find(board => board.id === activeId) ?? store.boards[0];
  const save = active ? store.statuses[active.id] : undefined;
  const blocked = save?.state === "conflict"; const saving = save?.state === "saving";
  const cards = active?.layout.cards ?? []; const displayed = preview?.cards ?? cards;
  const cardIds = [...new Set(cards.map(card => card.cardId))].sort().join(",");
  useEffect(() => {
    let cancelled = false; let inflight = false; const controller = new AbortController();
    async function refresh() {
      if (inflight || document.visibilityState === "hidden") return;
      inflight = true;
      await Promise.all(cardIds.split(",").filter(Boolean).map(async id => {
        if (collectingRef.current === id) return;
        const generation = (datasetGeneration.current[id] ?? 0) + 1; datasetGeneration.current[id] = generation;
        try {
          const dataset = await fetchDataset(id, controller.signal);
          if (!cancelled && datasetGeneration.current[id] === generation) setDatasets(previous => ({ ...previous, [id]: dataset.status === "error" && !dataset.data && previous[id]?.data ? { ...dataset, data: previous[id].data, updatedAt: previous[id].updatedAt } : dataset }));
        } catch (error) {
          if (!cancelled && datasetGeneration.current[id] === generation) setDatasets(previous => ({ ...previous, [id]: { ...(previous[id] ?? { id, data: null, updatedAt: null, run: null, cache: { hit: false, expiresAt: null } }), status: "error", stale: true, error: error instanceof Error ? error.message : "Refresh failed. Showing the last available measurements." } }));
        }
      }));
      inflight = false;
    }
    void refresh(); const timer = setInterval(() => void refresh(), 60_000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [cardIds]);
  useEffect(() => {
    const unsaved = Object.values(store.statuses).some(status => status.state !== "saved");
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [store.statuses]);
  function select(id: string) { setActiveId(id); setPreview(null); setNotice(""); const url = new URL(window.location.href); url.searchParams.set("dashboard", id); window.history.replaceState(null, "", url); }
  function openDialog(kind: "create" | "rename" | "delete") { setDialog(kind); setName(kind === "rename" ? active?.name ?? "" : store.boards.length ? "New dashboard" : "Overview"); setNotice(""); dialogRef.current?.showModal(); }
  function closeDialog() { dialogRef.current?.close(); setDialog(null); }
  async function submitDialog(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      if (dialog === "create") { const { dashboard } = await api<{ dashboard: DashboardView }>("/api/dashboards", "POST", { name }); store.update(boards => [...boards, dashboard]); select(dashboard.id); }
      else if (dialog === "rename" && active) { const { dashboard } = await api<{ dashboard: DashboardView }>(`/api/dashboards/${active.id}`, "PATCH", { name }); store.update(boards => boards.map(board => board.id === dashboard.id ? { ...board, name: dashboard.name } : board)); }
      else if (dialog === "delete" && active) { await api(`/api/dashboards/${active.id}`, "DELETE", { revision: active.revision }); const next = store.boards.filter(board => board.id !== active.id); store.remove(active.id); select(next[0]?.id ?? ""); }
      closeDialog();
    } catch (error) { setNotice(error instanceof Error ? error.message : "The change could not be saved."); } finally { setBusy(false); }
  }
  function edit(layout: CanvasLayout) { if (active && !blocked) store.edit(active.id, layout); }
  function addCard(cardId: string) {
    const info = cardRegistry.find(info => info.id === cardId); if (!info || !active || cards.length >= 40) return;
    const bottom = cards.reduce((max, card) => Math.max(max, card.y + card.rows), 0);
    edit({ version: 1, cards: [...cards, { id: crypto.randomUUID(), cardId, x: 0, y: bottom, span: Math.max(GRID.minSpan, Math.min(12, info.defaultLayout.width)), rows: Math.max(GRID.minRows, Math.min(20, info.defaultLayout.height)) }] });
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>, tile: Tile, kind: "move" | "resize") {
    if (!active || blocked || event.button !== 0 || gesture.current) return;
    const grid = gridRef.current!; const mobile = matchMedia("(max-width: 767px)").matches;
    gesture.current = { id: tile.id, kind, pointerId: event.pointerId, x: event.clientX, y: event.clientY, column: (grid.clientWidth + GRID.gap) / GRID.columns, mobile, base: active.layout, candidate: active.layout, tile, centers: [...grid.querySelectorAll<HTMLElement>("[data-tile]")].filter(element => element.dataset.tile !== tile.id).map(element => { const rect = element.getBoundingClientRect(); return rect.top + rect.height / 2; }), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < 5) return; current.moved = true;
    if (current.mobile && current.kind === "move") current.candidate = reorderCard(current.base, current.id, current.centers.filter(center => event.clientY > center).length);
    else current.candidate = changeCard(current.base, current.id, current.kind === "move" ? { x: current.tile.x + Math.round(dx / current.column), y: current.tile.y + Math.round(dy / (GRID.unit + GRID.gap)) } : { span: current.tile.span + (current.mobile ? 0 : Math.round(dx / current.column)), rows: current.tile.rows + Math.round(dy / (GRID.unit + GRID.gap)) });
    if (!(current.mobile && current.kind === "move")) setPreview(current.candidate);
  }
  function pointerEnd(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const current = gesture.current; if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null; setPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && current.moved) edit(current.candidate);
  }
  function handleKey(event: KeyboardEvent<HTMLButtonElement>, tile: Tile, kind: "move" | "resize") {
    if (event.key === "Escape" && gesture.current) { gesture.current = null; setPreview(null); return; }
    if (!active || blocked || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0; const dy = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (kind === "move" && matchMedia("(max-width: 767px)").matches) edit(reorderCard(active.layout, tile.id, readingOrder(cards).findIndex(card => card.id === tile.id) + (dy || dx)));
    else edit(changeCard(active.layout, tile.id, kind === "move" ? { x: tile.x + dx, y: tile.y + dy } : { span: tile.span + dx, rows: tile.rows + dy }));
  }
  async function collect(id: string) {
    setCollecting(id); collectingRef.current = id; datasetGeneration.current[id] = (datasetGeneration.current[id] ?? 0) + 1; setNotice("");
    try { await api(`/api/collect/${id}`, "POST"); const dataset = await fetchDataset(id); setDatasets(previous => ({ ...previous, [id]: dataset })); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Collection failed."); }
    finally { setCollecting(null); collectingRef.current = null; }
  }
  return <section aria-label="Dashboard workspace" className="space-y-5" onKeyDown={event => {
    if (editing && active && !blocked && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey && !(event.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) { event.preventDefault(); store.undo(active.id); }
  }}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Dashboards" className="flex max-w-full flex-wrap gap-2">{store.boards.map(board => <button key={board.id} role="tab" aria-selected={active?.id === board.id} aria-controls="dashboard-panel" id={`tab-${board.id}`} tabIndex={active?.id === board.id ? 0 : -1} className="dashboard-button aria-selected:bg-primary aria-selected:text-primary-foreground" onKeyDown={event => {
        const index = store.boards.findIndex(item => item.id === board.id); const last = store.boards.length - 1;
        const next = event.key === "ArrowRight" ? (index + 1) % store.boards.length : event.key === "ArrowLeft" ? (index + last) % store.boards.length : event.key === "Home" ? 0 : event.key === "End" ? last : null;
        if (next !== null) { event.preventDefault(); select(store.boards[next].id); document.getElementById(`tab-${store.boards[next].id}`)?.focus(); }
      }} onClick={() => select(board.id)}>{board.name}</button>)}</div>
      <button className="dashboard-button" onClick={() => openDialog("create")} disabled={busy || store.boards.length >= 20}><Plus size={16} aria-hidden />New dashboard</button>
    </div>
    {!active ? <div className="rounded-xl border border-dashed border-border p-10 text-center"><h2 className="font-display text-heading-2">Create your first dashboard</h2><p className="mt-3 text-muted-foreground">Choose a name, then arrange the telemetry cards you need.</p><button className="dashboard-button mt-5" onClick={() => openDialog("create")}>Create dashboard</button></div> : <>
      <div className="flex flex-wrap items-center gap-2">
        <button className="dashboard-button" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? "Done arranging" : "Arrange cards"}</button>
        <button className="dashboard-button" onClick={() => openDialog("rename")} disabled={saving || busy}>Rename dashboard</button>
        <button className="dashboard-button" onClick={() => openDialog("delete")} disabled={saving || busy}>Delete dashboard</button>
        <p role="status" className="ml-auto font-code text-micro text-muted-foreground" data-save-state={save?.state ?? "saved"}>{save?.state === "error" || blocked ? "Changes not saved" : save?.message ?? "Saved to database"}</p>
      </div>
      {(save?.state === "error" || blocked) && <div role="alert" className="space-y-3 rounded-lg border border-destructive/50 bg-card p-4"><p>{save.message}</p>{blocked ? <><p className="text-small">Reloading replaces your local arrangement with the latest saved version.</p><button className="dashboard-button" onClick={() => void store.reload(active.id).catch(error => setNotice(error.message))}>Reload saved layout</button></> : <button className="dashboard-button" onClick={() => store.retry(active.id)}>Retry save</button>}</div>}
      {editing && <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4"><div className="flex flex-wrap gap-2"><button className="dashboard-button" disabled={blocked || !store.canUndo(active.id)} onClick={() => store.undo(active.id)}><Undo2 size={16} aria-hidden />Undo arrangement</button><button className="dashboard-button" disabled={blocked} onClick={() => edit({ version: 1, cards: pack(readingOrder(cards)) })}>Tidy cards</button><label className="flex items-center gap-2 text-small">Add card<select aria-label="Add card" className="rounded-md border border-input bg-background p-2" value="" disabled={blocked || cards.length >= 40} onChange={event => addCard(event.target.value)}><option value="">Choose a card…</option>{cardRegistry.map(info => <option key={info.id} value={info.id}>{info.title}</option>)}</select></label></div><p id="canvas-instructions" className="text-small text-muted-foreground">Drag the move or resize handles. On a focused handle, use arrow keys; Escape cancels a drag. On small screens, move controls change reading order and resizing changes height. Width and order controls also work with touch.</p></div>}
      <div role="tabpanel" id="dashboard-panel" aria-labelledby={`tab-${active.id}`}>
        <div ref={gridRef} className="dashboard-grid">{readingOrder(cards).map((tile, index) => {
          const position = displayed.find(card => card.id === tile.id) ?? tile;
          const info = cardRegistry.find(info => info.id === tile.cardId); const title = `${info?.title ?? "Unavailable card"} ${index + 1}`;
          const View = cardComponents[tile.cardId]; const dataset = datasets[tile.cardId];
          const style = { "--column": position.x + 1, "--row": position.y + 1, "--span": position.span, "--rows": position.rows, "--height": `${heightFor(position.rows)}px` } as CSSProperties;
          return <article key={tile.id} data-tile={tile.id} data-card-id={tile.cardId} aria-label={title} className={`dashboard-tile ${editing ? "is-editing" : ""}`} style={style}>
            {editing && <div className="dashboard-tile-tools">
              <button className="dashboard-handle" disabled={blocked} aria-label={`Move ${title}`} aria-describedby="canvas-instructions" onPointerDown={event => pointerDown(event, tile, "move")} onPointerMove={pointerMove} onPointerUp={event => pointerEnd(event)} onPointerCancel={event => pointerEnd(event, true)} onLostPointerCapture={event => pointerEnd(event, true)} onKeyDown={event => handleKey(event, tile, "move")}><GripVertical size={18} aria-hidden /></button>
              <span className="mr-auto text-small font-medium">{info?.title ?? tile.cardId}</span>
              <button className="dashboard-icon" disabled={blocked || index === 0} aria-label={`Move ${title} earlier`} onClick={() => edit(reorderCard(active.layout, tile.id, index - 1))}><MoveUp size={16} aria-hidden /></button>
              <button className="dashboard-icon" disabled={blocked || index === cards.length - 1} aria-label={`Move ${title} later`} onClick={() => edit(reorderCard(active.layout, tile.id, index + 1))}><MoveDown size={16} aria-hidden /></button>
              <button className="dashboard-icon" disabled={blocked} aria-label={`Remove ${title}`} onClick={() => edit({ version: 1, cards: cards.filter(card => card.id !== tile.id) })}><Trash2 size={16} aria-hidden /></button>
            </div>}
            <div className="dashboard-tile-content">{View && dataset ? <View dataset={dataset} /> : <div className="p-6"><h2 className="text-lead font-medium">{info?.title ?? "Unavailable card"}</h2><p className="mt-3 text-muted-foreground">{View ? "Loading measurements…" : "This card is no longer registered. Remove it or enable its module."}</p></div>}</div>
            <div className="dashboard-tile-footer"><span className="font-code text-micro text-muted-foreground">{dataset ? dataset.provenance === "synthetic" ? "Synthetic fixture · fixed dates" : dataset.status === "ready" ? dataset.stale ? "Stale measurements" : "Fresh measurements" : dataset.status === "missing-config" ? "Configuration needed" : dataset.status === "error" ? "Dataset error" : dataset.status === "disabled" ? "Disabled" : "No measurements" : "Loading…"}</span>{View && <button className="text-small underline underline-offset-2 disabled:opacity-50" disabled={dataset?.provenance === "synthetic" || collecting !== null || dataset?.status === "disabled" || dataset?.status === "missing-config"} onClick={() => void collect(tile.cardId)}>{collecting === tile.cardId ? "Collecting…" : "Collect now"}</button>}</div>
            {editing && <div className="dashboard-tile-sizing"><label className="flex items-center gap-2 text-small">Width<select aria-label={`Width of ${title}`} value={tile.span} disabled={blocked} onChange={event => edit(changeCard(active.layout, tile.id, { span: Number(event.target.value) }))}>{[3,4,5,6,7,8,9,10,11,12].map(span => <option key={span} value={span}>{span}/12</option>)}</select></label><label className="flex items-center gap-2 text-small">Height<input aria-label={`Height of ${title}`} type="number" min={4} max={20} value={tile.rows} disabled={blocked} onChange={event => { const rows = Number(event.target.value); if (Number.isInteger(rows) && rows >= 4 && rows <= 20) edit(changeCard(active.layout, tile.id, { rows })); }} /></label><button className="dashboard-handle ml-auto" disabled={blocked} aria-label={`Resize ${title}`} aria-describedby="canvas-instructions" onPointerDown={event => pointerDown(event, tile, "resize")} onPointerMove={pointerMove} onPointerUp={event => pointerEnd(event)} onPointerCancel={event => pointerEnd(event, true)} onLostPointerCapture={event => pointerEnd(event, true)} onKeyDown={event => handleKey(event, tile, "resize")}><Maximize2 size={18} aria-hidden /></button></div>}
          </article>;
        })}</div>
        {cards.length === 0 && <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">This dashboard is empty. Choose Arrange cards to add a card.</p>}
      </div>
    </>}
    {notice && !dialog && <p role="alert" className="rounded-md border border-border p-3 text-small">{notice}</p>}
    <dialog ref={dialogRef} aria-labelledby="dashboard-dialog-title" className="dashboard-dialog" onCancel={() => setDialog(null)}><form onSubmit={submitDialog} className="space-y-5"><h2 id="dashboard-dialog-title" className="font-display text-heading-2">{dialog === "create" ? "New dashboard" : dialog === "rename" ? "Rename dashboard" : "Delete dashboard"}</h2>{dialog === "delete" ? <p>Delete “{active?.name}” and its saved arrangement? This cannot be undone.</p> : <label className="block space-y-2"><span>Dashboard name</span><input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2" /></label>}{notice && <p role="alert" className="text-destructive">{notice}</p>}<div className="flex justify-end gap-2"><button type="button" className="dashboard-button" disabled={busy} onClick={closeDialog}>Cancel</button><button type="submit" className="dashboard-button bg-primary text-primary-foreground" disabled={busy}>{busy ? "Saving…" : dialog === "delete" ? "Delete" : dialog === "rename" ? "Rename" : "Create"}</button></div></form></dialog>
  </section>;
}
