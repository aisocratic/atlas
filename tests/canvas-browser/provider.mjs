// Run with pnpm exec tsx tests/canvas-browser/provider.mjs.
// Explicit local provider fixture; the real collector still performs HTTP I/O.
import { createProvider } from "../region-latency/provider-fixture.ts"

const provider = await createProvider({ port: 4183 })
console.log(`Globalping fixture ready: ${provider.endpoint}`)
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void provider.close().finally(() => process.exit(0)) })
