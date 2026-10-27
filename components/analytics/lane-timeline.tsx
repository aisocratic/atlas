"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BAR_HEIGHT, HOUR_MS, clampWindowEnd, filterLanes, layoutTimeline, spanMs, timelineTicks, timelineWindow, type Lane, type LaneLink, type TickUnit, type TimelineBar, type TimelineEdge, type TimelineSpan } from "@/lib/charts/timeline-layout";

/*
 * A lane timeline (Gantt chart), after the AI Socratic website's agents
 * timeline: one lane per group, a bar per item from its start to its end (an
 * open one grows towards the today line), overlapping bars stacked in rows,
 * and a line inside a bar for each moment on it. Hover a bar for what it is and
 * what led to it; click it to pin that. Zoom with the span buttons; move back
 * in time with the arrows, by dragging the chart or by scrolling it sideways.
 * The layout itself is lib/charts/timeline-layout.ts. Its styles are
 * lane-timeline.css, which each surface that draws it loads (app/globals.css,
 * the analytics preview): card modules stay importable in Node tests.
 */

export interface LaneTimelineState { label: string; color: string }
export interface LaneTimelineMarkKind { label: readonly [string, string]; color: string }

const AXIS_HEIGHT = 24;
const TIP_WIDTH = 260;
/** A drag shorter than this, in px, is a click. */
const DRAG_SLOP = 3;
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DAY_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const CLOCK = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

function tickLabel(at: number, unit: TickUnit): string {
  if (unit === "time") return CLOCK.format(at);
  if (unit === "day") return DAY.format(at);
  return new Date(at).getUTCMonth() === 0 ? MONTH_YEAR.format(at) : MONTH.format(at);
}

/** "3 days", "5 h", "40 min". */
function formatLength(ms: number): string {
  const days = Math.round(ms / (24 * HOUR_MS));
  if (days >= 1) return `${days} ${days === 1 ? "day" : "days"}`;
  const hours = Math.round(ms / HOUR_MS);
  return hours >= 1 ? `${hours} h` : `${Math.max(1, Math.round(ms / 60_000))} min`;
}

/** An element and its width, followed as it resizes; a callback ref, so an element drawn later is measured too. */
function useMeasured<T extends HTMLElement>(): [(element: T | null) => void, T | null, number] {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, element, width];
}

/** A bar's tint in its state's colour, its start drawn at full strength unless it began before the window. */
function barFill(color: string, { open, clipped, startUnknown }: Pick<TimelineBar, "open" | "clipped" | "startUnknown">): CSSProperties {
  return {
    background: `color-mix(in oklab, ${color} ${open ? 30 : 20}%, var(--card))`,
    borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
    ...(startUnknown ? { borderStyle: "dashed", borderLeftColor: "transparent" } : {}),
    boxShadow: clipped ? undefined : `inset 3px 0 0 ${color}`,
  };
}

export function LaneTimeline({
  lanes,
  links = [],
  now,
  spans,
  max,
  states,
  marks: markKinds = {},
  linkLabels = {},
  hiddenStates,
  nowLabel = "Today",
  label,
  empty = "Nothing in this window.",
  legend = "full",
}: {
  lanes: readonly Lane[];
  links?: readonly LaneLink[];
  /** Where the today line is drawn and open bars end. */
  now: number;
  /** The zoom levels offered, the first chosen at the start. */
  spans: readonly { value: TimelineSpan; label: string; title?: string }[];
  /** How far back, in ms, the data reaches: the longest window, and how far the window can move. */
  max: number;
  states: Readonly<Record<string, LaneTimelineState>>;
  marks?: Readonly<Record<string, LaneTimelineMarkKind>>;
  /** How the tip names an incoming link, by kind ("After"). */
  linkLabels?: Readonly<Record<string, string>>;
  hiddenStates?: ReadonlySet<string>;
  nowLabel?: string;
  label: string;
  empty?: string;
  /** "marks" leaves the states to a legend of the caller's own. */
  legend?: "full" | "marks" | "none";
}) {
  const [span, setSpan] = useState<TimelineSpan>(spans[0]?.value ?? "fit");
  // Where a window moved back in time ends; null while it follows now.
  const [end, setEnd] = useState<number | null>(null);
  const [chartRef, chart, width] = useMeasured<HTMLDivElement>();
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const shown = useMemo(() => filterLanes(lanes, { hiddenStates }), [lanes, hiddenStates]);
  const length = spanMs(span, shown, now, { max, minFit: HOUR_MS });
  const windowEnd = clampWindowEnd(end, now, length, max);
  // A window shorter than the data can move back through it; Fit already shows all of it.
  const canPan = span !== "fit" && clampWindowEnd(now - 1, now, length, max) !== null;
  const layout = useMemo(() => {
    const { from, to } = timelineWindow(now, length, windowEnd);
    return layoutTimeline({ lanes: shown, links, now, from, to, width });
  }, [shown, links, now, length, windowEnd, width]);

  // The wheel and drag handlers read the view as it is now, not as it was when they were attached.
  const view = useRef({ now, length, width, windowEnd, canPan, max });
  useLayoutEffect(() => {
    view.current = { now, length, width, windowEnd, canPan, max };
  });
  /** Move the window by `ms`: back in time when negative. */
  const panBy = useCallback((ms: number) => {
    const { now, length, windowEnd, max } = view.current;
    setEnd(clampWindowEnd((windowEnd ?? now) + ms, now, length, max));
  }, []);

  // A sideways scroll (or shift + scroll) moves the window.
  useEffect(() => {
    if (!chart) return;
    const onWheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      const { length, width, canPan } = view.current;
      if (!delta || !width || !canPan) return;
      event.preventDefault();
      panBy((delta * length) / width);
    };
    chart.addEventListener("wheel", onWheel, { passive: false });
    return () => chart.removeEventListener("wheel", onWheel);
  }, [chart, panBy]);

  // Dragging the chart moves the window with the pointer; a drag is never also a click.
  const drag = useRef<{ x: number; end: number; moved: boolean } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (!canPan || event.button !== 0 || (event.target as Element).closest("[role=dialog]")) return;
    drag.current = { x: event.clientX, end: windowEnd ?? now, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || !width) return;
    const dx = event.clientX - start.x;
    if (!start.moved && Math.abs(dx) < DRAG_SLOP) return;
    start.moved = true;
    setEnd(clampWindowEnd(start.end - (dx * length) / width, now, length, max));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // A drag that moved keeps its record until the click that follows it, which it swallows.
    if (drag.current && !drag.current.moved) drag.current = null;
  };
  /** Whether the click now arriving ends a drag (and so is no click). */
  const endsDrag = () => {
    const moved = Boolean(drag.current?.moved);
    drag.current = null;
    return moved;
  };

  const ticks = useMemo(() => timelineTicks(layout.from, layout.to, width), [layout.from, layout.to, width]);
  const bars = useMemo(() => new Map(layout.lanes.flatMap(lane => lane.bars.map(bar => [bar.id, bar]))), [layout]);
  // A pinned bar that left the window lets go.
  const active = (pinned && bars.get(pinned)) || (hovered && bars.get(hovered)) || null;
  // Its links, drawn only while it is under the pointer or pinned.
  const activeEdges = useMemo(() => (active ? layout.edges.filter(edge => edge.from === active.id || edge.to === active.id) : []), [active, layout.edges]);
  const related = useMemo(() => new Set(activeEdges.flatMap(edge => [edge.from, edge.to])), [activeEdges]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPinned(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinned]);

  const colorOf = (state: string) => states[state]?.color ?? "var(--muted-foreground)";
  const edgeColor = (edge: TimelineEdge) => colorOf(bars.get(edge.to)?.state ?? "");
  const nowX = layout.to > layout.from ? (now - layout.from) * (width / (layout.to - layout.from)) : 0;
  const nowShown = nowX >= 0 && nowX <= width;
  // The today label, roughly as wide as its text: ticks it would cover are not drawn; at the right edge it ends at the line.
  const nowWidth = nowLabel.length * 6.5;
  const nowEnd = nowX > width - nowWidth / 2 - 4;
  const step = length / 2;
  const earliestEnd = clampWindowEnd(-Infinity, now, length, max);

  return <div className="lane-timeline" role="group" aria-label={label}>
    <div className="lane-timeline-controls">
      <div role="group" aria-label="Zoom" className="lane-timeline-zoom">{spans.map(option => <button key={String(option.value)} type="button" aria-pressed={span === option.value} title={option.title} onClick={() => { setSpan(option.value); if (option.value === "fit") setEnd(null); }}>{option.label}</button>)}</div>
      <div role="group" aria-label="Move in time" className="lane-timeline-pan">
        <button type="button" aria-label="Earlier" title="Earlier · or drag the chart, or scroll it sideways" disabled={!canPan || windowEnd === earliestEnd} onClick={() => panBy(-step)}><ChevronLeft size={14} aria-hidden /></button>
        <button type="button" disabled={windowEnd === null} title={`Back to ${nowLabel.toLowerCase()}`} onClick={() => setEnd(null)}>{nowLabel}</button>
        <button type="button" aria-label="Later" title="Later" disabled={windowEnd === null} onClick={() => panBy(step)}><ChevronRight size={14} aria-hidden /></button>
      </div>
      {windowEnd !== null && <span className="lane-timeline-range">{DAY_YEAR.format(layout.from)} – {DAY_YEAR.format(windowEnd)}</span>}
    </div>
    <div className="lane-timeline-body">
      <div className="lane-timeline-labels" aria-hidden={layout.lanes.length === 0}>
        {layout.lanes.map(lane => <div key={lane.id} style={{ height: lane.height }}><strong title={lane.label}>{lane.label}</strong>{lane.detail && <small>{lane.detail}</small>}</div>)}
      </div>
      <div
        ref={chartRef}
        className={`lane-timeline-chart${canPan ? " can-pan" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => { if (!endsDrag()) setPinned(null); }}
      >
        {width > 0 && layout.lanes.length === 0 && <p className="lane-timeline-empty">{empty}</p>}
        {width > 0 && layout.lanes.length > 0 && <div className="lane-timeline-plot" style={{ height: layout.height + AXIS_HEIGHT }}>
          {/* Under the bars: faint lane rules, the today line, and the links of the bar under the pointer or pinned. */}
          <svg width={width} height={layout.height} className="lane-timeline-under" aria-hidden="true">
            {layout.lanes.slice(1).map(lane => <line key={lane.id} x1={0} x2={width} y1={lane.top} y2={lane.top} stroke="var(--border)" strokeOpacity={0.5} />)}
            {activeEdges.map(edge => <path key={edge.id} d={edge.d} fill="none" stroke={edgeColor(edge)} strokeWidth={1.5} />)}
            {nowShown && <line className="lane-timeline-now" x1={nowX} x2={nowX} y1={0} y2={layout.height} />}
          </svg>
          {layout.lanes.flatMap(lane => lane.bars.map(bar => {
            const state = states[bar.state]?.label ?? bar.state;
            return <button
              key={bar.id}
              type="button"
              data-item-id={bar.id}
              className={`lane-timeline-bar${pinned === bar.id ? " is-pinned" : active?.id === bar.id ? " is-active" : related.has(bar.id) ? " is-related" : ""}`}
              aria-label={`${lane.label} · ${bar.label}: ${state}, ${DAY_YEAR.format(bar.start)} to ${bar.open ? nowLabel.toLowerCase() : DAY_YEAR.format(bar.end)}`}
              aria-expanded={pinned === bar.id}
              style={{ left: bar.x, top: bar.y, width: bar.width, height: BAR_HEIGHT, ...barFill(colorOf(bar.state), bar) }}
              onClick={event => { event.stopPropagation(); if (endsDrag()) return; setPinned(current => current === bar.id ? null : bar.id); }}
              onMouseEnter={() => setHovered(bar.id)}
              onMouseLeave={() => setHovered(current => current === bar.id ? null : current)}
              onFocus={() => setHovered(bar.id)}
              onBlur={() => setHovered(current => current === bar.id ? null : current)}
            >
              {bar.width >= 44 && <span>{bar.label}</span>}
              {bar.open && <i className="lane-timeline-live" style={{ background: colorOf(bar.state) }} />}
            </button>;
          }))}
          {/* Over the bars: where each link leaves its source, and the moments on each bar. */}
          <svg width={width} height={layout.height} className="lane-timeline-over" aria-hidden="true">
            {activeEdges.map(edge => <circle key={edge.id} cx={edge.dot.x} cy={edge.dot.y} r={3} fill={edgeColor(edge)} stroke="var(--card)" strokeWidth={1.5} />)}
          </svg>
          {layout.lanes.flatMap(lane => lane.marks.map(mark => <span
            key={`${mark.itemId}:${mark.at}`}
            className="lane-timeline-mark"
            aria-hidden="true"
            title={`${Object.entries(mark.kinds).map(([kind, count]) => `${count} ${(markKinds[kind]?.label ?? [kind, kind])[count === 1 ? 0 : 1]}`).join(", ")} · ${DAY_YEAR.format(mark.at)}`}
            style={{ left: mark.x, top: mark.y + 3, height: BAR_HEIGHT - 6, background: markKinds[mark.kind]?.color ?? `color-mix(in oklab, ${colorOf(bars.get(mark.itemId)?.state ?? "")} 45%, black)` }}
          />))}
          {/* The time axis, with today on it. */}
          <div className="lane-timeline-axis" style={{ top: layout.height, height: AXIS_HEIGHT }} aria-hidden="true">
            {ticks.filter(tick => !nowShown || (nowEnd ? tick.x < nowX - nowWidth - 24 || tick.x > nowX + 24 : Math.abs(tick.x - nowX) > nowWidth / 2 + 28)).map(tick => <span key={tick.at} style={{ left: tick.x }}>{tickLabel(tick.at, tick.unit)}</span>)}
            {nowShown && <b className={nowEnd ? "end" : undefined} style={{ left: nowX }}>{nowLabel}</b>}
          </div>
          {active && <BarTip
            bar={active}
            pinned={pinned === active.id}
            lane={layout.lanes.find(lane => lane.id === active.laneId)?.label ?? ""}
            state={states[active.state]}
            incoming={layout.edges.flatMap(edge => {
              const source = edge.to === active.id ? bars.get(edge.from) : undefined;
              return source ? [`${linkLabels[edge.kind] ?? edge.kind} ${source.label}`] : [];
            })}
            nowLabel={nowLabel}
            width={width}
            height={layout.height}
          />}
        </div>}
      </div>
    </div>
    {legend !== "none" && <div className="lane-timeline-legend">
      {legend === "full" && Object.entries(states).map(([state, { label, color }]) => <span key={state}><i style={barFill(color, { open: false, clipped: false, startUnknown: false })} />{label}</span>)}
      {Object.entries(markKinds).map(([kind, { label, color }]) => <span key={kind}><i className="mark" style={{ background: color }} />{label[0][0].toUpperCase() + label[0].slice(1)}</span>)}
      <span className="hint">Hover a bar to see what came before it</span>
    </div>}
  </div>;
}

/** What a bar is: its lane, its state, when it ran and what led to it. */
function BarTip({ bar, pinned, lane, state, incoming, nowLabel, width, height }: { bar: TimelineBar; pinned: boolean; lane: string; state: LaneTimelineState | undefined; incoming: string[]; nowLabel: string; width: number; height: number }) {
  const left = Math.max(0, Math.min(bar.x, width - TIP_WIDTH));
  // Under the bar, unless that runs past the chart's foot: then over it.
  const below = bar.y + BAR_HEIGHT + 120 < height + AXIS_HEIGHT || bar.y < 120;
  const style: CSSProperties = below ? { left, top: bar.y + BAR_HEIGHT + 6, width: TIP_WIDTH } : { left, top: bar.y - 6, width: TIP_WIDTH, transform: "translateY(-100%)" };
  return <div role="dialog" aria-label={bar.label} className={`lane-timeline-tip${pinned ? " is-pinned" : ""}`} style={style} onClick={event => event.stopPropagation()}>
    <p className="lane">{lane}</p>
    <p className="title">{bar.label}</p>
    <p className="when">
      {state && <span className="state"><i style={{ background: state.color }} />{state.label}</span>}
      <span>{bar.startUnknown ? "start unknown" : `${DAY_YEAR.format(bar.start)} – ${bar.open ? nowLabel.toLowerCase() : DAY_YEAR.format(bar.end)}`}</span>
      {!bar.startUnknown && <span>· {formatLength(bar.end - bar.start)}</span>}
    </p>
    {bar.detail && <p className="detail">{bar.detail}</p>}
    {incoming.map(text => <p key={text} className="detail">↳ {text}</p>)}
    <p className="hint">{pinned ? "Click it again or press Esc to let go" : "Click to pin"}</p>
  </div>;
}
