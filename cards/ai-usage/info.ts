import type { CardInfo } from "../../lib/cards/types"
export const info: CardInfo = { id: "ai-usage", title: "AI usage", category: "cost", description: "Explicitly opted-in local usage exports; reported costs only.", defaultLayout: { width: 6, height: 6 }, defaultEnabled: true, freshnessSeconds: 86400, requiresOptIn: true }
