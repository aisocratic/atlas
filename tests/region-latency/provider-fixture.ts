import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import type { measurementRequest } from "../../cards/region-latency/provider"

export function resultFixture(country = "US", target = "example.test") {
  return {
    id: "fixture-id", type: "http", target, status: "finished", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), probesCount: 1,
    results: [{ probe: { country, city: "Fixture City", continent: "NA", region: "Northern America", state: null, asn: 64500, network: "Local fixture", latitude: 0, longitude: 0, tags: [], resolvers: [] }, result: {
      status: "finished", statusCode: 200, statusCodeName: "OK", timings: { dns: 5, tcp: 15, tls: 20, firstByte: 80, download: 10, total: 130 },
      rawOutput: "private provider body must not be exposed", rawHeaders: "", rawBody: null, truncated: false, headers: {}, resolvedAddress: "192.0.2.1", tls: null,
    } }],
  }
}
export async function createProvider({ pendingPolls = 0, rateLimit = false, port = 0, measuredAt }: { pendingPolls?: number; rateLimit?: boolean; port?: number; measuredAt?: string } = {}) {
  const requests: ReturnType<typeof measurementRequest>[] = []
  const authorizations: (string | undefined)[] = []
  const measurements = new Map<string, { body: ReturnType<typeof measurementRequest>; polls: number }>()
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json")
    if (request.url === "/health") { response.end(JSON.stringify({ status: "fixture-ready" })); return }
    if (rateLimit) { response.writeHead(429, { "Retry-After": "60" }); response.end(JSON.stringify({ error: "private token should never appear" })); return }
    if (request.method === "POST" && request.url === "/v1/measurements") {
      let body = ""
      for await (const chunk of request) { body += chunk; if (body.length > 20_000) { response.writeHead(413); response.end("{}"); return } }
      const parsed = JSON.parse(body) as ReturnType<typeof measurementRequest>
      requests.push(parsed); authorizations.push(request.headers.authorization)
      const id = `fixture-${requests.length}`
      measurements.set(id, { body: parsed, polls: 0 })
      response.writeHead(202); response.end(JSON.stringify({ id, probesCount: 1 })); return
    }
    const id = request.url?.split("/").at(-1) ?? ""
    const saved = measurements.get(id)
    if (!saved) { response.writeHead(404); response.end("{}"); return }
    const country = saved.body.locations[0].country
    const result = resultFixture(country, saved.body.target)
    if (measuredAt) result.createdAt = measuredAt
    result.id = id
    if (saved.polls++ < pendingPolls) { result.status = "in-progress"; result.results = [] }
    else if (country === "DE") (result.results[0].result.timings as Record<string, unknown>).firstByte = null
    else if (country === "SG") { result.results[0].result.status = "failed"; result.results[0].result.rawOutput = "secret failure text" }
    response.end(JSON.stringify(result))
  })
  await new Promise<void>(resolve => server.listen(port, "127.0.0.1", resolve))
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/`
  return { endpoint, requests, authorizations, close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => error ? reject(error) : resolve()) }) }
}
