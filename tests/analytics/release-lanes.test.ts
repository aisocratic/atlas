import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseLanes, releaseLine } from "../../lib/charts/release-lanes";
import { layoutTimeline, ROW_HEIGHT, LANE_PADDING } from "../../lib/charts/timeline-layout";
import { releasesBetween, SAMPLE_NOW, sampleReleases } from "../../components/analytics/sample-data";

const release = (tag: string, day: string) => ({ tag, publishedAt: `${day}T12:00:00.000Z`, prerelease: tag.includes("-") });

test("a tag belongs to its major and minor line; anything else is its own line", () => {
  assert.deepEqual(releaseLine("v1.3.0-beta.1"), { major: "v1", line: "v1.3" });
  assert.deepEqual(releaseLine("2.10.4"), { major: "v2", line: "v2.10" });
  assert.deepEqual(releaseLine("nightly-2026-09-01"), { major: "Other", line: "nightly-2026-09-01" });
});

test("one lane per major, a bar per line from its first release to its last, the current line open", () => {
  const { lanes, links } = releaseLanes([
    release("v1.1.0", "2026-03-01"), release("v1.0.0", "2026-01-10"), release("v1.0.1", "2026-02-01"),
    release("v1.2.0-rc.1", "2026-04-01"), release("v1.1.1", "2026-04-15"), release("v2.0.0-alpha.1", "2026-05-01"),
  ]);
  assert.deepEqual(lanes.map(lane => lane.label), ["v1.x", "v2.x"]);
  const [v1, v2] = lanes;
  assert.deepEqual(v1.items.map(item => [item.label, item.state, item.start, item.end]), [
    ["v1.0", "superseded", "2026-01-10T12:00:00.000Z", "2026-02-01T12:00:00.000Z"],
    // The newest line with a stable release runs to today; a newer prerelease line is open too.
    ["v1.1", "current", "2026-03-01T12:00:00.000Z", null],
    ["v1.2", "prerelease", "2026-04-01T12:00:00.000Z", null],
  ]);
  assert.deepEqual(v2.items.map(item => [item.label, item.state, item.end]), [["v2.0", "prerelease", null]]);
  assert.equal(v1.items[1].detail, "v1.1.0 → v1.1.1 · 2 stable releases");
  assert.equal(v1.detail, "3 lines · 5 releases");
  assert.deepEqual(v1.marks?.filter(mark => mark.itemId === "v1:v1.1").map(mark => mark.kind), ["stable", "stable"]);
  assert.deepEqual(links.map(link => `${link.from}>${link.to}`), ["v1:v1.0>v1:v1.1", "v1:v1.1>v1:v1.2"]);
});

test("only the newest of several prerelease-only lines stays open, and unreadable dates are skipped", () => {
  const { lanes } = releaseLanes([release("v0.1.0-alpha", "2026-01-01"), release("v0.2.0-alpha", "2026-02-01"), { tag: "v0.3.0", publishedAt: "never", prerelease: false }]);
  assert.deepEqual(lanes[0].items.map(item => [item.label, item.state, item.end === null]), [["v0.1", "prerelease", false], ["v0.2", "prerelease", true]]);
});

test("the sample's backports overlap the next line, so its lane packs into two rows", () => {
  const { lanes, links } = releaseLanes(sampleReleases);
  const layout = layoutTimeline({ lanes, links, now: SAMPLE_NOW, from: SAMPLE_NOW - 200 * 86400_000, to: SAMPLE_NOW, width: 1000 });
  assert.deepEqual(layout.lanes.map(lane => lane.label), ["v1.x", "v2.x"]);
  assert.equal(layout.lanes[0].height, LANE_PADDING * 2 + 2 * ROW_HEIGHT);
  assert.equal(layout.lanes[0].marks.reduce((sum, mark) => sum + mark.count, 0), sampleReleases.filter(item => item.tag.startsWith("v1")).length);
  assert.ok(layout.lanes[0].bars.find(bar => bar.label === "v1.3")?.open);
  assert.equal(releasesBetween("2026-08-07", "2026-09-05"), 6);
  assert.equal(releasesBetween("2026-08-30", "2026-09-05"), 2);
});
