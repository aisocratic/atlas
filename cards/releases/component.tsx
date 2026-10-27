import { TelemetryCard } from "../../components/telemetry-card"
import { ReleaseTimeline } from "../../components/analytics/release-timeline"
import type { CardProps } from "../../lib/cards/types"
import type { ReleasesPresentation } from "./dataset"
import { info } from "./info"
export function Card(props: CardProps) {
  const releases = (props.dataset.data as ReleasesPresentation | null)?.releases
  // A synthetic fixture runs to its own fixed date; live releases run to today.
  const now = props.dataset.provenance === "synthetic" && props.dataset.updatedAt ? Date.parse(props.dataset.updatedAt) : undefined
  return <TelemetryCard {...props} info={info} chart={releases?.length ? <ReleaseTimeline releases={releases} now={now} nowLabel={now === undefined ? "Today" : "Fixture date"} /> : null} />
}
