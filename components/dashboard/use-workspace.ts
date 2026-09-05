"use client";
import { useCallback, useRef, useState } from "react";
import { api, ApiError } from "@/lib/dashboard/client";
import type { DashboardView } from "@/lib/dashboard/service";
import type { CanvasLayout } from "@/lib/dashboard/model";
export interface SaveStatus { state: "saved" | "saving" | "error" | "conflict"; message: string }
export function useWorkspace(initial: DashboardView[]) {
  const [boards, setBoards] = useState(initial); const boardsRef = useRef(initial);
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({});
  const pending = useRef(new Map<string, CanvasLayout>()); const running = useRef(false);
  const histories = useRef(new Map<string, CanvasLayout[]>());
  const update = useCallback((fn: (boards: DashboardView[]) => DashboardView[]) => { boardsRef.current = fn(boardsRef.current); setBoards(boardsRef.current); }, []);
  const status = useCallback((id: string, value: SaveStatus) => setStatuses(previous => ({ ...previous, [id]: value })), []);
  const flush = useCallback(async () => {
    if (running.current) return; running.current = true;
    while (pending.current.size) {
      const [id, layout] = pending.current.entries().next().value!; pending.current.delete(id);
      const current = boardsRef.current.find(board => board.id === id); if (!current) continue;
      status(id, { state: "saving", message: "Saving…" });
      try {
        const { dashboard } = await api<{ dashboard: DashboardView }>(`/api/dashboards/${id}/layout`, "PUT", { layout, revision: current.revision });
        update(boards => boards.map(board => board.id === id ? { ...board, revision: dashboard.revision, updatedAt: dashboard.updatedAt } : board));
        if (!pending.current.has(id)) status(id, { state: "saved", message: "Saved to database" });
      } catch (error) {
        pending.current.delete(id);
        status(id, { state: error instanceof ApiError && error.status === 409 ? "conflict" : "error", message: error instanceof Error ? error.message : "Save failed. Your local arrangement is still here." });
      }
    }
    running.current = false;
  }, [status, update]);
  const edit = useCallback((id: string, layout: CanvasLayout, remember = true) => {
    const board = boardsRef.current.find(board => board.id === id); if (!board) return;
    if (JSON.stringify(board.layout) === JSON.stringify(layout)) return;
    if (remember) histories.current.set(id, [...(histories.current.get(id) ?? []), board.layout].slice(-30));
    update(boards => boards.map(board => board.id === id ? { ...board, layout } : board));
    pending.current.set(id, layout); status(id, { state: "saving", message: "Saving…" }); void flush();
  }, [flush, status, update]);
  const undo = (id: string) => { const previous = histories.current.get(id)?.pop(); if (previous) edit(id, previous, false); };
  const retry = (id: string) => { const board = boardsRef.current.find(board => board.id === id); if (board) { pending.current.set(id, board.layout); void flush(); } };
  const reload = async (id: string) => {
    const { dashboard } = await api<{ dashboard: DashboardView }>(`/api/dashboards/${id}`);
    pending.current.delete(id); histories.current.delete(id);
    update(boards => boards.map(board => board.id === id ? dashboard : board)); status(id, { state: "saved", message: "Loaded saved layout" });
  };
  const remove = (id: string) => { pending.current.delete(id); histories.current.delete(id); setStatuses(previous => { const next = { ...previous }; delete next[id]; return next; }); update(boards => boards.filter(board => board.id !== id)); };
  return { boards, update, remove, statuses, edit, undo, retry, reload, canUndo: (id: string) => Boolean(histories.current.get(id)?.length) };
}
