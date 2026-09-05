import type { CardInfo } from "../../lib/cards/types"

export const info = {
  id: "region-latency",
  title: "Region latency",
  category: "Performance",
  description: "Time to first byte from distributed HTTP probes. Lower values mean a faster initial response.",
  defaultLayout: { width: 6, height: 6 },
  defaultEnabled: true,
  freshnessSeconds: 3600,
} satisfies CardInfo
