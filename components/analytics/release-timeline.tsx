"use client";

import { useMemo, useState } from "react";
import { DAY_MS, timeOf } from "@/lib/charts/timeline-layout";
import { RELEASE_LINKS, RELEASE_MARKS, RELEASE_STATES, releaseLanes, type ReleaseRecord } from "@/lib/charts/release-lanes";
import { LaneTimeline } from "./lane-timeline";

const SPANS = [
  { value: "fit", label: "Fit", title: "From the first release to today" },
  { value: 30 * DAY_MS, label: "30d", title: "The last 30 days" },
  { value: 90 * DAY_MS, label: "90d", title: "The last 90 days" },
  { value: 365 * DAY_MS, label: "1y", title: "The last 12 months" },
] as const;
const MARKS = {
  stable: { label: RELEASE_MARKS.stable, color: "var(--foreground)" },
  prerelease: { label: RELEASE_MARKS.prerelease, color: "#c9921a" },
};

/** Release lines as a lane timeline: a lane per major version, a bar per line, a mark per release. */
export function ReleaseTimeline({ releases, now: fixedNow, hiddenStates, legend = "full", nowLabel = "Today" }: { releases: readonly ReleaseRecord[]; now?: number; hiddenStates?: ReadonlySet<string>; legend?: "full" | "marks"; nowLabel?: string }) {
  // Live data runs to the browser's today; synthetic data to its own fixed date.
  const [clock] = useState(() => Date.now());
  const now = fixedNow ?? clock;
  const { lanes, links } = useMemo(() => releaseLanes(releases), [releases]);
  // The window reaches back to the first release (a year at least), so every zoom level can move through it.
  const max = useMemo(() => {
    const first = Math.min(...releases.map(release => timeOf(release.publishedAt)).filter(Number.isFinite));
    return Math.max(365 * DAY_MS, Number.isFinite(first) ? (now - first) * 1.04 : 0);
  }, [releases, now]);
  return <LaneTimeline
    label="Release lines by major version"
    lanes={lanes}
    links={links}
    now={now}
    spans={SPANS}
    max={max}
    states={RELEASE_STATES}
    marks={MARKS}
    linkLabels={RELEASE_LINKS}
    hiddenStates={hiddenStates}
    nowLabel={nowLabel}
    legend={legend}
    empty="No published releases in this window."
  />;
}
