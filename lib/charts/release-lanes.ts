import { timeOf, type Lane, type LaneLink } from "./timeline-layout";

// Published releases as a lane timeline: one lane per major version, a bar per
// release line (v1.3: from its first published release to its last), and a mark
// on the bar for each release. The newest line with a stable release in each
// major is the current one and runs to today; a newer line with only
// prereleases so far is still open too. A line is linked to the one after it.
// GitHub records when a release was published, not when work on it began, so a
// bar is the time a line was shipping, not how long it took to build.

export type ReleaseRecord = { tag: string; publishedAt: string; prerelease: boolean };

export const RELEASE_STATES = {
  current: { label: "Current line", color: "#74c4a5" },
  superseded: { label: "Superseded line", color: "#72859c" },
  prerelease: { label: "Prerelease only", color: "#edbe49" },
} as const;
export type ReleaseState = keyof typeof RELEASE_STATES;
export const RELEASE_MARKS = { stable: ["stable release", "stable releases"], prerelease: ["prerelease", "prereleases"] } as const;
export const RELEASE_LINKS = { next: "After" } as const;

/** "v1.3.0-beta.1" → major "v1", line "v1.3"; a tag that is no version is its own line under "Other". */
export function releaseLine(tag: string): { major: string; line: string } {
  const match = /^v?(\d+)\.(\d+)/i.exec(tag.trim());
  return match ? { major: `v${Number(match[1])}`, line: `v${Number(match[1])}.${Number(match[2])}` } : { major: "Other", line: tag };
}

const plural = (count: number, [one, many]: readonly [string, string]) => `${count} ${count === 1 ? one : many}`;

export function releaseLanes(releases: readonly ReleaseRecord[]): { lanes: Lane[]; links: LaneLink[] } {
  const sorted = releases
    .filter(release => !Number.isNaN(timeOf(release.publishedAt)))
    .sort((a, b) => timeOf(a.publishedAt) - timeOf(b.publishedAt) || a.tag.localeCompare(b.tag));
  const majors = new Map<string, Map<string, ReleaseRecord[]>>();
  for (const release of sorted) {
    const { major, line } = releaseLine(release.tag);
    const lines = majors.get(major) ?? new Map<string, ReleaseRecord[]>();
    lines.set(line, [...(lines.get(line) ?? []), release]);
    majors.set(major, lines);
  }
  const lanes: Lane[] = [];
  const links: LaneLink[] = [];
  for (const [major, lines] of majors) {
    // Lines in the order they first shipped; the newest with a stable release is current.
    const ordered = [...lines].sort(([, a], [, b]) => timeOf(a[0].publishedAt) - timeOf(b[0].publishedAt));
    const current = ordered.findLastIndex(([, items]) => items.some(item => !item.prerelease));
    const items = ordered.map(([line, records], index) => {
      const stable = records.filter(record => !record.prerelease).length;
      const state: ReleaseState = index === current ? "current" : stable ? "superseded" : "prerelease";
      const first = records[0], last = records.at(-1)!;
      const counts = [stable ? plural(stable, RELEASE_MARKS.stable) : "", records.length - stable ? plural(records.length - stable, RELEASE_MARKS.prerelease) : ""].filter(Boolean).join(", ");
      return {
        id: `${major}:${line}`,
        label: line,
        state,
        start: first.publishedAt,
        // The current line, and the newest line when it is still in prerelease, are open: they run to today.
        end: index === current || (index > current && index === ordered.length - 1) ? null : last.publishedAt,
        detail: records.length === 1 ? `${first.tag} · ${counts}` : `${first.tag} → ${last.tag} · ${counts}`,
      };
    });
    items.slice(1).forEach((item, index) => links.push({ from: items[index].id, to: item.id, kind: "next" }));
    lanes.push({
      id: major,
      label: major === "Other" ? "Other tags" : `${major}.x`,
      detail: `${plural(items.length, ["line", "lines"])} · ${plural([...lines.values()].reduce((sum, records) => sum + records.length, 0), ["release", "releases"])}`,
      items,
      marks: ordered.flatMap(([line, records]) => records.map(record => ({ itemId: `${major}:${line}`, at: record.publishedAt, kind: record.prerelease ? "prerelease" : "stable" }))),
    });
  }
  return { lanes, links };
}
