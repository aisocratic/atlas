import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BAR_HEIGHT, DAY_MS, HOUR_MS, LANE_PADDING, MARK_MERGE_PX, MIN_BAR_WIDTH, ROW_HEIGHT, clampWindowEnd, filterLanes, layoutTimeline, linkPath, packRows, spanMs, timelineTicks, timelineWindow, type Lane, type LaneItem, type TimelineBar } from "../../lib/charts/timeline-layout";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
const item = (id: string, startAgo: number, endAgo: number | null, state = endAgo === null ? "open" : "done"): LaneItem => ({ id, label: `Item ${id}`, state, start: at(startAgo), end: endAgo === null ? null : at(endAgo) });
const lane = (id: string, items: LaneItem[], marks: Lane["marks"] = []): Lane => ({ id, label: id, items, marks });
// A 2 h window, 1200 px wide: 10 px a minute, minute 0 at x = 0.
const window2h = { now: NOW, from: NOW - 2 * HOUR_MS, to: NOW, width: 1200 };
const xAt = (minutesAgo: number) => (120 - minutesAgo) * 10;

describe("window, zoom and ticks", () => {
  test("ends a little after now, so an open bar is seen growing", () => {
    const { from, to } = timelineWindow(NOW, 24 * HOUR_MS);
    assert.equal(from, NOW - 24 * HOUR_MS);
    assert.ok(to > NOW && to - NOW < HOUR_MS);
  });

  test("ends a little after a moment in the past when moved back to it, never after now", () => {
    const end = NOW - 3 * HOUR_MS;
    assert.deepEqual(timelineWindow(NOW, HOUR_MS, end), { from: end - HOUR_MS, to: end + 0.03 * HOUR_MS });
    assert.deepEqual(timelineWindow(NOW, HOUR_MS, NOW + HOUR_MS), timelineWindow(NOW, HOUR_MS));
  });

  test("moves back no further than the data reaches, and follows now again once caught up", () => {
    const max = 24 * HOUR_MS;
    assert.equal(clampWindowEnd(null, NOW, HOUR_MS, max), null);
    assert.equal(clampWindowEnd(NOW, NOW, HOUR_MS, max), null);
    assert.equal(clampWindowEnd(NOW - 2 * HOUR_MS, NOW, HOUR_MS, max), NOW - 2 * HOUR_MS);
    // A 6 h window ends no earlier than 18 h ago, so it still starts within the day.
    assert.equal(clampWindowEnd(NOW - 30 * HOUR_MS, NOW, 6 * HOUR_MS, max), NOW - 18 * HOUR_MS);
    // A window as long as the data cannot move.
    assert.equal(clampWindowEnd(NOW - 2 * HOUR_MS, NOW, max, max), null);
  });

  test("fits the window to the earliest item, between a minimum and the data's reach", () => {
    const options = { max: 24 * HOUR_MS, minFit: HOUR_MS / 4 };
    assert.equal(spanMs(6 * HOUR_MS, [], NOW, options), 6 * HOUR_MS);
    assert.equal(spanMs(48 * HOUR_MS, [], NOW, options), 24 * HOUR_MS);
    assert.equal(spanMs("fit", [], NOW, options), 24 * HOUR_MS);
    const fit = spanMs("fit", [lane("a", [item("1", 120, 60)]), lane("b", [item("2", 30, null)])], NOW, options);
    assert.ok(fit > 2 * HOUR_MS && fit < 2.2 * HOUR_MS);
    assert.equal(spanMs("fit", [lane("a", [item("1", 1, null)])], NOW, options), HOUR_MS / 4);
    // An item whose start no one knows does not stretch the fit.
    assert.equal(spanMs("fit", [lane("a", [{ ...item("1", 600, null), startUnknown: true }, item("2", 60, null)])], NOW, options), 60 * 60_000 * 1.04);
  });

  test("puts ticks on round UTC times, far enough apart to label", () => {
    const from = NOW - 24 * HOUR_MS;
    const ticks = timelineTicks(from, NOW, 960);
    assert.ok(ticks.length > 3);
    for (const tick of ticks) {
      assert.ok(tick.at >= from && tick.at <= NOW);
      assert.equal(new Date(tick.at).getUTCMinutes(), 0);
      assert.equal(tick.unit, "time");
    }
    assert.ok(Math.min(...ticks.slice(1).map((tick, index) => tick.x - ticks[index].x)) >= 72);
    const hour = timelineTicks(NOW - HOUR_MS, NOW, 960);
    assert.ok(hour[1].at - hour[0].at < HOUR_MS);
    assert.deepEqual(timelineTicks(NOW - HOUR_MS, NOW, 0), []);
  });

  test("steps up to days, Monday weeks and calendar months as the window widens", () => {
    const days = timelineTicks(NOW - 10 * DAY_MS, NOW, 900);
    assert.ok(days.every(tick => tick.unit === "day" && tick.at % DAY_MS === 0));
    const weeks = timelineTicks(NOW - 120 * DAY_MS, NOW, 900);
    assert.ok(weeks.every(tick => new Date(tick.at).getUTCDay() === 1), "weeks start on Monday");
    const months = timelineTicks(NOW - 400 * DAY_MS, NOW, 900);
    assert.ok(months.length >= 3);
    for (const tick of months) {
      assert.equal(tick.unit, "month");
      assert.equal(new Date(tick.at).getUTCDate(), 1);
      assert.equal(new Date(tick.at).getUTCHours(), 0);
    }
    const quarters = timelineTicks(NOW - 3 * 365 * DAY_MS, NOW, 900);
    assert.ok(quarters.every(tick => new Date(tick.at).getUTCMonth() % 3 === 0));
  });
});

describe("layoutTimeline", () => {
  test("draws a bar from an item's start to its end, and an open one to now", () => {
    const layout = layoutTimeline({ lanes: [lane("a", [item("1", 90, 60), item("2", 30, null)])], ...window2h });
    const [done, open] = layout.lanes[0].bars;
    assert.deepEqual([done.id, done.x, done.width, done.open, done.clipped], ["1", xAt(90), 300, false, false]);
    assert.deepEqual([open.id, open.x, open.open, open.x + open.width, open.end], ["2", xAt(30), true, 1200, NOW]);
  });

  test("drops items outside the window and lanes left without one; clips an item that began before it", () => {
    const layout = layoutTimeline({ lanes: [lane("old", [item("0", 300, 200)]), lane("a", [item("1", 180, 100)])], ...window2h });
    assert.deepEqual(layout.lanes.map(box => box.id), ["a"]);
    assert.deepEqual([layout.lanes[0].bars[0].x, layout.lanes[0].bars[0].width, layout.lanes[0].bars[0].clipped], [0, xAt(100), true]);
  });

  test("gives an item that only just started a bar wide enough to hover, without passing the right edge", () => {
    const bar = layoutTimeline({ lanes: [lane("a", [item("1", 0, null)])], ...window2h }).lanes[0].bars[0];
    assert.equal(bar.width, MIN_BAR_WIDTH);
    assert.equal(bar.x + bar.width, 1200);
  });

  test("skips an item whose start cannot be read", () => {
    assert.deepEqual(layoutTimeline({ lanes: [lane("a", [{ ...item("1", 30, 10), start: "not a time" }])], ...window2h }).lanes, []);
  });

  test("orders lanes by their first start, and stacks them", () => {
    const layout = layoutTimeline({ lanes: [lane("late", [item("2", 30, 10)]), lane("early", [item("1", 90, 60)])], ...window2h });
    assert.deepEqual(layout.lanes.map(box => box.id), ["early", "late"]);
    const single = LANE_PADDING * 2 + ROW_HEIGHT;
    assert.deepEqual(layout.lanes.map(box => [box.top, box.height]), [[0, single], [single, single]]);
    assert.equal(layout.height, single * 2);
    assert.equal(layout.lanes[1].bars[0].y, single + LANE_PADDING + (ROW_HEIGHT - BAR_HEIGHT) / 2);
  });

  test("orders by latest end, item count or name, with a pinned lane always first", () => {
    const lanes = [lane("b", [item("1", 100, 90), item("2", 80, 70)]), lane("a", [item("3", 60, 5)]), lane("c", [item("4", 110, 50)])];
    const order = (options: Partial<Parameters<typeof layoutTimeline>[0]>) => layoutTimeline({ lanes, ...window2h, ...options }).lanes.map(box => box.id);
    assert.deepEqual(order({}), ["c", "b", "a"]);
    assert.deepEqual(order({ order: "recent" }), ["a", "c", "b"]);
    assert.deepEqual(order({ order: "count" }), ["b", "a", "c"]);
    assert.deepEqual(order({ order: "name" }), ["a", "b", "c"]);
    assert.deepEqual(order({ order: "name", first: candidate => candidate.id === "c" }), ["c", "a", "b"]);
  });

  test("packs overlapping items of one lane into the fewest rows", () => {
    const box = layoutTimeline({ lanes: [lane("a", [item("1", 100, 40), item("2", 80, 20), item("3", 30, 10)])], ...window2h }).lanes[0];
    const [one, two, three] = box.bars;
    assert.equal(two.y - one.y, ROW_HEIGHT);
    // The first is over by the time the third starts: the third goes back to the first row.
    assert.equal(three.y, one.y);
    assert.equal(box.height, LANE_PADDING * 2 + 2 * ROW_HEIGHT);
    assert.deepEqual(packRows([{ x: 0, width: 10 }, { x: 5, width: 10 }, { x: 8, width: 2 }, { x: 13, width: 1 }]), [0, 1, 2, 0]);
  });

  test("places a mark inside its item's bar, and merges marks too close to tell apart", () => {
    assert.ok(MARK_MERGE_PX > 3);
    // 10 px a minute: marks 0.3 min apart are 3 px apart, under MARK_MERGE_PX; 10 min apart are not.
    const layout = layoutTimeline({
      lanes: [lane("a", [item("1", 60, 0), item("2", 60, 0)], [
        { itemId: "1", at: at(40), kind: "stable" },
        { itemId: "1", at: at(39.7), kind: "prerelease" },
        { itemId: "1", at: at(39.4), kind: "prerelease" },
        { itemId: "2", at: at(39.7), kind: "stable" },
        { itemId: "1", at: at(30), kind: "stable" },
        { itemId: "1", at: at(500), kind: "stable" },
      ])],
      ...window2h,
    });
    const marks = layout.lanes[0].marks;
    assert.deepEqual(marks.map(mark => [mark.itemId, mark.count, mark.kind]), [["1", 3, "prerelease"], ["2", 1, "stable"], ["1", 1, "stable"]]);
    assert.deepEqual(marks[0].kinds, { stable: 1, prerelease: 2 });
    assert.equal(marks[0].x, xAt(40));
    assert.equal(marks[0].y, layout.lanes[0].bars[0].y);
  });

  test("joins linked items present in the window, once each, and nothing else", () => {
    const lanes = [lane("a", [item("1", 110, 60)]), lane("b", [item("2", 50, 20), item("3", 15, null)])];
    const layout = layoutTimeline({ lanes, links: [{ from: "1", to: "2", kind: "next" }, { from: "1", to: "2", kind: "next" }, { from: "2", to: "3", kind: "next" }, { from: "1", to: "missing", kind: "next" }, { from: "3", to: "3", kind: "next" }], ...window2h });
    assert.deepEqual(layout.edges.map(edge => edge.id), ["next:1>2", "next:2>3"]);
    assert.deepEqual(layoutTimeline({ lanes, ...window2h }).edges, []);
  });
});

describe("filterLanes", () => {
  const lanes = [lane("v1", [item("1", 60, 30, "current"), item("2", 30, 10, "superseded")]), lane("v2", [item("3", 20, null, "prerelease")])];
  test("keeps everything with nothing switched off, and leaves the layout to drop emptied lanes", () => {
    assert.deepEqual(filterLanes(lanes, {}), lanes);
    const filtered = filterLanes(lanes, { hiddenStates: new Set(["prerelease"]) });
    assert.deepEqual(filtered.map(entry => entry.items.length), [2, 0]);
    assert.deepEqual(layoutTimeline({ lanes: filtered, ...window2h }).lanes.map(box => box.id), ["v1"]);
  });
  test("finds every word of a search in an item or its lane", () => {
    assert.deepEqual(filterLanes(lanes, { query: "item 3" }).map(entry => entry.items.map(entry => entry.id)), [[], ["3"]]);
    assert.deepEqual(filterLanes(lanes, { query: "V1" }).map(entry => entry.items.length), [2, 0]);
  });
});

describe("link paths", () => {
  const bar = (x: number, width: number, y: number): TimelineBar => ({ id: `${x}:${y}`, label: "", state: "done", laneId: "a", start: 0, end: 0, open: false, clipped: false, startUnknown: false, x, y, width });
  test("leaves the source's bottom just before the target starts, then turns into the target's start", () => {
    const { d, dot } = linkPath(bar(0, 200, 10), bar(100, 50, 80));
    assert.deepEqual(dot, { x: 90, y: 10 + BAR_HEIGHT });
    assert.ok(d.startsWith(`M90 ${10 + BAR_HEIGHT}V`) && d.endsWith("H100"));
  });
  test("leaves from the source's end when it finished before the target began, from its top when below", () => {
    assert.equal(linkPath(bar(0, 40, 10), bar(100, 50, 80)).dot.x, 40);
    assert.equal(linkPath(bar(0, 200, 80), bar(100, 50, 10)).dot.y, 80);
  });
  test("joins two bars on one line straight across", () => {
    assert.equal(linkPath(bar(0, 40, 10), bar(60, 20, 10)).d, `M40 ${10 + BAR_HEIGHT / 2}H60`);
  });
});
