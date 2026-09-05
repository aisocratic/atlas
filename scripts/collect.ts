import "./env"
import { pathToFileURL } from "node:url"
import { closeDatabase } from "../lib/db/index"
import { getCardServices } from "../lib/cards/runtime"
import type { CardServices } from "../lib/cards/service"

export async function runCollectCommand(args: string[], services: () => CardServices = getCardServices, output: (text: string) => void = console.log): Promise<number> {
  if (args.length !== 1 || !/^[a-z][a-z0-9-]{0,63}$/.test(args[0])) { output("Usage: pnpm collect <card-id>"); return 2 }
  try {
    const result = await services().collect(args[0])
    output(JSON.stringify(result))
    return result.status === "succeeded" ? 0 : result.status === "already-running" ? 3 : 1
  } catch {
    output(JSON.stringify({ error: "Unknown card or invalid configuration." }))
    return 1
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await runCollectCommand(process.argv.slice(2)) } finally { await closeDatabase() }
}
