import { TelemetryCard } from "../../components/telemetry-card"
import type { CardProps } from "../../lib/cards/types"
import { info } from "./info"
export function Card(props: CardProps) { return <TelemetryCard {...props} info={info} /> }
