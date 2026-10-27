// How a lane timeline (a Gantt chart) lays its items out: pure, so it can be
// tested without drawing anything. Ported from the AI Socratic website's agents
// timeline (app/(admin)/admin/board/agents/timeline-layout.ts) and made generic:
// one lane per group, a bar per item (start → end, an open item reaching "now"),
// overlapping bars packed into the fewest rows of their lane, marks for moments
// inside a bar, and an edge wherever one item led to another.
//
// Times are UTC milliseconds. Atlas data is UTC, so ticks fall on round UTC
// times and dates, not the viewer's local ones.

export const HOUR_MS = 60 * 60_000;
export const DAY_MS = 24 * HOUR_MS;

/** Row pitch, bar height and a lane's top/bottom padding, in px. */
export const ROW_HEIGHT = 36;
export const BAR_HEIGHT = 24;
export const LANE_PADDING = 6;
/** The narrowest a bar is drawn, so an item that just started can still be hovered. */
export const MIN_BAR_WIDTH = 6;
/** Marks on one item closer than this, in px, are drawn as one. */
export const MARK_MERGE_PX = 8;
/** How far before its target a link leaves the source bar, so it turns into the target's start. */
const LINK_LEAD = 10;
const CORNER = 6;

export type TimeValue = string | number | null | undefined;
/** A time as UTC milliseconds; NaN when it is missing or unreadable. */
export const timeOf = (value: TimeValue): number =>
  value === null || value === undefined || value === "" ? NaN : typeof value === "number" ? value : Date.parse(value);

/** One bar's worth of input: an item with a start and, once it has finished, an end. */
export interface LaneItem {
  id: string;
  label: string;
  state: string;
  start: TimeValue;
  /** Missing while the item is still open: its bar reaches "now". */
  end: TimeValue;
  /** Shown in the bar's tip. */
  detail?: string;
  /** No one knows when it began: it is drawn from the window's left edge, marked so. */
  startUnknown?: boolean;
}
/** A moment on one item (a release, a step someone took), drawn as a line inside its bar. */
export interface LaneMarkInput { itemId: string; at: TimeValue; kind: string }
export interface Lane {
  id: string;
  label: string;
  detail?: string;
  items: readonly LaneItem[];
  marks?: readonly LaneMarkInput[];
}
/** One item leading to another: drawn while either end is hovered or pinned. */
export interface LaneLink { from: string; to: string; kind: string }

export interface TimelineBar {
  id: string;
  label: string;
  state: string;
  detail?: string;
  laneId: string;
  start: number;
  /** When it finished; "now" for an item still open. */
  end: number;
  open: boolean;
  /** It started before the window does (or no one knows when): its left edge is the window's. */
  clipped: boolean;
  startUnknown: boolean;
  x: number;
  y: number;
  width: number;
}

/**
 * Moments on one item too close together to tell apart are one mark: `count`
 * of them, `at` the first, `kinds` how many of each.
 */
export interface TimelineMark {
  x: number;
  /** The top of the bar it is drawn inside: its item's, else a bar-high band in the middle of the lane. */
  y: number;
  at: number;
  /** The kind of the most of them (the first, on a tie). */
  kind: string;
  itemId: string;
  count: number;
  kinds: Record<string, number>;
  steps: { at: number; kind: string }[];
}

export interface TimelineLaneBox {
  id: string;
  label: string;
  detail?: string;
  top: number;
  height: number;
  bars: TimelineBar[];
  marks: TimelineMark[];
}

export interface TimelineEdge {
  id: string;
  kind: string;
  /** Item ids: the bar the edge leaves and the one it reaches. */
  from: string;
  to: string;
  /** SVG path. */
  d: string;
  /** Where it leaves the source bar. */
  dot: { x: number; y: number };
}

export interface TimelineLayout {
  from: number;
  to: number;
  lanes: TimelineLaneBox[];
  edges: TimelineEdge[];
  height: number;
}

/**
 * How lanes are ordered (a `first` lane always leads): started — when each
 * lane's first item began; recent — whose work ended last; count — the most
 * items; name — by label.
 */
export const TIMELINE_ORDERS = ["started", "recent", "count", "name"] as const;
export type TimelineOrder = (typeof TIMELINE_ORDERS)[number];

/** A zoom level: "fit" runs from the earliest item to now; a number is that many ms before now. */
export type TimelineSpan = "fit" | number;

/**
 * How many ms a span covers; "fit" reaches back to the earliest known start,
 * with a little room before it, never shorter than `minFit` nor longer than `max`.
 */
export function spanMs(span: TimelineSpan, lanes: readonly Lane[], now: number, { max, minFit = 0 }: { max: number; minFit?: number }): number {
  if (span !== "fit") return Math.min(span, max);
  const starts = lanes
    .flatMap(lane => lane.items.filter(item => !item.startUnknown).map(item => timeOf(item.start)))
    .filter(start => start < now);
  if (!starts.length) return max;
  return Math.min(max, Math.max(minFit, (now - Math.min(...starts)) * 1.04));
}

/**
 * The window a span shows: ending a little after "now", so an open bar is seen
 * growing towards the now line instead of running off the edge. Moved back in
 * time, it ends a little after `end` instead.
 */
export function timelineWindow(now: number, span: number, end: number | null = null): { from: number; to: number } {
  const until = end === null ? now : Math.min(now, end);
  return { from: until - span, to: until + span * 0.03 };
}

/**
 * Where a window moved back in time may end: no later than now (then it
 * follows now again: null) and no earlier than lets it still start within the
 * `max` the data covers. A window as long as that cannot move.
 */
export function clampWindowEnd(end: number | null, now: number, span: number, max: number): number | null {
  if (end === null || end >= now) return null;
  const earliest = now - (max - span);
  return earliest >= now ? null : Math.max(earliest, end);
}

/** What the timeline shows: items by state, and words found in an item or its lane. */
export interface TimelineFilter { hiddenStates?: ReadonlySet<string>; query?: string }

/**
 * The lanes and items a filter keeps. Every word of the query must be found in
 * an item's label or id, or in its lane's label; a lane left without items is
 * dropped later, by the layout.
 */
export function filterLanes(lanes: readonly Lane[], { hiddenStates, query = "" }: TimelineFilter): Lane[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return lanes.map(lane => ({
    ...lane,
    items: lane.items.filter(item => {
      if (hiddenStates?.has(item.state)) return false;
      const text = `${item.label} ${item.id} ${lane.label}`.toLowerCase();
      return words.every(word => text.includes(word));
    }),
  }));
}

export type TickUnit = "time" | "day" | "month";
const MINUTE_STEPS = [5, 10, 15, 30, 60, 120, 180, 360, 720].map(minutes => ({ ms: minutes * 60_000, unit: "time" as const, months: 0 }));
const DAY_STEPS = [1, 2, 7, 14].map(days => ({ ms: days * DAY_MS, unit: "day" as const, months: 0 }));
const MONTH_STEPS = [1, 3, 6, 12].map(months => ({ ms: months * 30.44 * DAY_MS, unit: "month" as const, months }));
const TICK_STEPS = [...MINUTE_STEPS, ...DAY_STEPS, ...MONTH_STEPS];
/** Weeks start on Monday: 1970-01-05 was the first one after the epoch. */
const FIRST_MONDAY = 4 * DAY_MS;

/**
 * Axis ticks on round UTC times ("14:00"), days ("Sep 5", weeks from Monday)
 * or months (the first of Jan, Apr, Jul, Oct for quarters), as far apart as the
 * narrowest step that leaves `minGap` px between labels.
 */
export function timelineTicks(from: number, to: number, width: number, minGap = 72): { at: number; x: number; unit: TickUnit }[] {
  if (!(to > from) || width <= 0) return [];
  const perMs = width / (to - from);
  const step = TICK_STEPS.find(candidate => candidate.ms * perMs >= minGap) ?? TICK_STEPS.at(-1)!;
  const ticks: { at: number; x: number; unit: TickUnit }[] = [];
  if (step.months) {
    const start = new Date(from);
    let month = start.getUTCFullYear() * 12 + start.getUTCMonth();
    month = Math.ceil(month / step.months) * step.months;
    for (let at = Date.UTC(Math.floor(month / 12), month % 12, 1); at <= to; month += step.months, at = Date.UTC(Math.floor(month / 12), month % 12, 1)) {
      if (at >= from) ticks.push({ at, x: (at - from) * perMs, unit: step.unit });
    }
    return ticks;
  }
  const base = step.ms >= 7 * DAY_MS ? FIRST_MONDAY : 0;
  for (let at = Math.ceil((from - base) / step.ms) * step.ms + base; at <= to; at += step.ms) {
    ticks.push({ at, x: (at - from) * perMs, unit: step.unit });
  }
  return ticks;
}

const round = (value: number) => Math.round(value * 10) / 10;
const sign = (value: number) => (value < 0 ? -1 : 1);

/** Bars packed into the fewest rows where none overlaps another (first fit, by start). */
export function packRows(bars: readonly Pick<TimelineBar, "x" | "width">[]): number[] {
  const rowEnds: number[] = [];
  return bars.map(bar => {
    let row = rowEnds.findIndex(end => end <= bar.x);
    if (row === -1) row = rowEnds.push(0) - 1;
    rowEnds[row] = bar.x + bar.width + 2;
    return row;
  });
}

/** A bar's right edge, and the line through its middle. */
const right = (bar: TimelineBar) => bar.x + bar.width;
const middle = (bar: TimelineBar) => bar.y + BAR_HEIGHT / 2;

/**
 * A link: down (or up) from the source bar at the moment the target started,
 * round a corner, then along the target's row into its start. Two bars on one
 * line are joined straight across.
 */
export function linkPath(source: TimelineBar, target: TimelineBar): { d: string; dot: { x: number; y: number } } {
  const ty = middle(target);
  if (middle(source) === ty) {
    const dot = { x: round(right(source)), y: round(ty) };
    return { d: `M${dot.x} ${dot.y}H${round(target.x)}`, dot };
  }
  const x = Math.min(right(source), Math.max(source.x, target.x - LINK_LEAD));
  const below = ty > middle(source);
  const y = below ? source.y + BAR_HEIGHT : source.y;
  const dx = target.x - x;
  const r = Math.min(CORNER, Math.abs(dx), Math.abs(ty - y));
  const sy = below ? 1 : -1;
  const sx = sign(dx);
  const d = `M${round(x)} ${round(y)}V${round(ty - sy * r)}Q${round(x)} ${round(ty)} ${round(x + sx * r)} ${round(ty)}H${round(target.x)}`;
  return { d, dot: { x: round(x), y: round(y) } };
}

/**
 * The lanes with their bars placed, and the edges between them. Only items that
 * reach into the window are drawn, and only lanes with such an item. Lanes run
 * top to bottom by `order`, the `first` lane above them all; by default in the
 * order their first items started, so links mostly point down and to the right.
 */
export function layoutTimeline({
  lanes,
  links = [],
  now,
  from,
  to,
  width,
  order = "started",
  first = () => false,
}: {
  lanes: readonly Lane[];
  links?: readonly LaneLink[];
  now: number;
  from: number;
  to: number;
  width: number;
  order?: TimelineOrder;
  first?: (lane: Lane) => boolean;
}): TimelineLayout {
  const perMs = to > from ? width / (to - from) : 0;
  const x = (time: number) => (time - from) * perMs;

  const placed = lanes
    .map(lane => {
      const bars = lane.items
        .map((item): TimelineBar | null => {
          const start = timeOf(item.start);
          if (Number.isNaN(start)) return null;
          const finished = timeOf(item.end);
          const open = Number.isNaN(finished);
          const end = open ? Math.max(start, now) : Math.max(start, finished);
          if (end < from || start > to) return null;
          const left = Math.max(0, x(start));
          // A bar keeps its minimum width by reaching back, never past the window's right edge.
          const barRight = Math.min(width, Math.max(x(end), left + MIN_BAR_WIDTH));
          const barLeft = Math.max(0, Math.min(left, barRight - MIN_BAR_WIDTH));
          return {
            id: item.id,
            label: item.label,
            state: item.state,
            ...(item.detail ? { detail: item.detail } : {}),
            laneId: lane.id,
            start,
            end,
            open,
            clipped: start < from || Boolean(item.startUnknown),
            startUnknown: Boolean(item.startUnknown),
            x: barLeft,
            y: 0,
            width: barRight - barLeft,
          };
        })
        .filter((bar): bar is TimelineBar => bar !== null)
        .sort((a, b) => a.start - b.start);
      return { lane, bars };
    })
    .filter(({ bars }) => bars.length > 0)
    .sort((a, b) => {
      const pinned = Number(first(b.lane)) - Number(first(a.lane));
      if (pinned) return pinned;
      const lastEnd = (bars: TimelineBar[]) => Math.max(...bars.map(bar => bar.end));
      // A lane whose first start no one knows goes after every lane whose start is known.
      const firstStart = (bars: TimelineBar[]) => (bars[0].startUnknown ? Infinity : bars[0].start);
      const byOrder =
        order === "recent"
          ? lastEnd(b.bars) - lastEnd(a.bars)
          : order === "count"
            ? b.bars.length - a.bars.length
            : order === "name"
              ? 0
              : firstStart(a.bars) - firstStart(b.bars) || 0;
      return byOrder || a.lane.label.localeCompare(b.lane.label);
    });

  let top = 0;
  const boxes: TimelineLaneBox[] = placed.map(({ lane, bars }) => {
    const rows = packRows(bars);
    bars.forEach((bar, index) => {
      bar.y = top + LANE_PADDING + rows[index] * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
    });
    const height = LANE_PADDING * 2 + (Math.max(...rows) + 1) * ROW_HEIGHT;
    const byItem = new Map(bars.map(bar => [bar.id, bar]));
    const steps = (lane.marks ?? [])
      .map(mark => ({ ...mark, time: timeOf(mark.at) }))
      .filter(mark => !Number.isNaN(mark.time) && mark.time >= from && mark.time <= to)
      .sort((a, b) => a.time - b.time);
    const marks: TimelineMark[] = [];
    const lastOn = new Map<string, TimelineMark>();
    for (const step of steps) {
      const previous = lastOn.get(step.itemId);
      if (previous && x(step.time) - previous.x < MARK_MERGE_PX) {
        previous.count += 1;
        previous.steps.push({ at: step.time, kind: step.kind });
        previous.kinds[step.kind] = (previous.kinds[step.kind] ?? 0) + 1;
        if (previous.kinds[step.kind] > previous.kinds[previous.kind]) previous.kind = step.kind;
        continue;
      }
      const bar = byItem.get(step.itemId);
      const mark: TimelineMark = {
        x: x(step.time),
        y: bar ? bar.y : top + (height - BAR_HEIGHT) / 2,
        at: step.time,
        kind: step.kind,
        itemId: step.itemId,
        count: 1,
        kinds: { [step.kind]: 1 },
        steps: [{ at: step.time, kind: step.kind }],
      };
      marks.push(mark);
      lastOn.set(step.itemId, mark);
    }
    const box: TimelineLaneBox = { id: lane.id, label: lane.label, ...(lane.detail ? { detail: lane.detail } : {}), top, height, bars, marks };
    top += height;
    return box;
  });

  const bars = new Map(boxes.flatMap(box => box.bars.map(bar => [bar.id, bar])));
  const edges: TimelineEdge[] = [];
  const joined = new Set<string>();
  for (const link of links) {
    const source = bars.get(link.from);
    const target = bars.get(link.to);
    const key = `${link.from}>${link.to}`;
    if (!source || !target || source === target || joined.has(key)) continue;
    joined.add(key);
    edges.push({ id: `${link.kind}:${key}`, kind: link.kind, from: source.id, to: target.id, ...linkPath(source, target) });
  }

  return { from, to, lanes: boxes, edges, height: top };
}
