import assert from "node:assert/strict"
import { test } from "node:test"
import { createRegistry, defineCard } from "../../lib/cards/define"
import { resolveConfig } from "../../lib/config"
import { CardServices, parseDatasetQuery, targetKey, cardContext } from "../../lib/cards/service"
import { cardRegistry } from "../../cards/registry"
import { info } from "../../cards/region-latency/info"

const definition = defineCard({ info, dataset: async () => ({ data: null }) })
test("registry rejects duplicate/invalid metadata and config rejects unknown settings and non-JSON options", () => {
  assert.throws(() => createRegistry([definition, definition]), /Duplicate/)
  assert.throws(() => defineCard({ ...definition, info: { ...info, id: "../secret" } }))
  assert.throws(() => defineCard({ ...definition, info: { ...info, defaultLayout: { width: 20, height: 2 } } }))
  for (const value of [null, { unknown: true }, { siteUrl: "javascript:alert(1)" }, { siteUrl: "https://name:password@example.com" }, { repository: "not a repo" }, { cacheTtlSeconds: 0 }, { cards: { "region-latency": { enabled: "yes" } } }, { cards: { "region-latency": { options: { value: Infinity } } } }]) assert.throws(() => resolveConfig(value, {}))
  assert.throws(() => new CardServices({ registry: createRegistry([definition]), config: resolveConfig({ cards: { unknown: true } }, {}), env: {}, database: () => { throw new Error("unused") } }), /not registered/)
  assert.deepEqual(cardRegistry.map(card => card.id), ["region-latency", "lighthouse", "seo-audit", "releases", "repo-metrics", "ai-usage", "real-users", "server-errors", "anomalies"])
})

test("missing/disabled/opt-in cards stay described and never initialize DB or execute collectors", async () => {
  let calls = 0
  const sensitive = defineCard({ ...definition, info: { ...info, requiresOptIn: true }, requirements: () => [{ id: "provider", reason: "Configure a provider." }], collector: { collect: async () => { calls++; return { publish: async () => ({ rowsWritten: 0 }) } } } })
  const services = new CardServices({ registry: createRegistry([sensitive]), config: resolveConfig({}, {}), env: {}, database: () => { calls++; throw new Error("unused") } })
  const visible = services.list()[0]
  assert.equal(visible.enabled, true)
  assert.deepEqual(visible.missing.map(item => item.id), ["database", "opt-in", "provider"])
  assert.equal((await services.dataset(info.id)).status, "missing-config")
  assert.equal((await services.collect(info.id)).status, "missing-config")
  await assert.rejects(services.collect("unknown"), /Unknown/)
  const disabled = new CardServices({ ...services.dependencies, config: resolveConfig({ cards: { [info.id]: false } }, {}) })
  assert.equal((await disabled.dataset(info.id)).status, "disabled")
  assert.equal((await disabled.collect(info.id)).status, "disabled")
  assert.equal(calls, 0)
})

test("target identity includes source and options; dataset query inputs are bounded", () => {
  const base = cardContext(definition, resolveConfig({ siteUrl: "https://example.com" }, {}), {})
  const other = cardContext(definition, resolveConfig({ siteUrl: "https://example.com", cards: { [info.id]: { options: { region: "EU" } } } }, {}), {})
  assert.notEqual(targetKey(definition, base), targetKey(definition, other))
  assert.doesNotMatch(targetKey(definition, base), /example/)
  assert.deepEqual(parseDatasetQuery(new URL("http://localhost/?limit=10&since=2026-01-01")), { limit: 10, since: "2026-01-01T00:00:00.000Z" })
  for (const query of ["limit=0", "limit=1001", "limit=NaN", "since=no", "since=2026-02-01&until=2026-01-01", "target=https://other.test"]) assert.throws(() => parseDatasetQuery(new URL(`http://localhost/?${query}`)))
})
