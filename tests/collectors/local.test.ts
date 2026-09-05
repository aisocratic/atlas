import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer } from "node:http"
import { once } from "node:events"
import { withDatabase, services } from "./support"
import { inspectRepository, readBoundedSource, safeFile } from "../../cards/repo-metrics/collector"
import { parseUsage } from "../../cards/ai-usage/collector"
import type { TelemetryPresentation } from "../../lib/cards/presentation"

test("explicit repository inspection excludes credentials/dependencies/symlinks and publishes real source metrics", () => withDatabase(async db => {
  const root = await mkdtemp(join(tmpdir(), "atlas-repo-")), outside = await mkdtemp(join(tmpdir(), "atlas-outside-"))
  const server = createServer((req, res) => { if (req.url === "/known") res.end(JSON.stringify({ "dist-tags": { latest: "2.0.0" }, versions: { "1.0.0": {}, "1.5.0": {}, "2.0.0": {} } })); else { res.writeHead(503); res.end("registry-private") } })
  server.listen(0, "127.0.0.1"); await once(server, "listening"); const address = server.address(); assert.ok(address && typeof address !== "string")
  try {
    await mkdir(join(root, "node_modules")); await mkdir(join(root, ".git")); await mkdir(join(root, "dist"))
    const code = "// excluded comment\nexport function choose(x: boolean) {\n  if (x) return 1\n  return 2\n}\n"
    await writeFile(join(root, "code.ts"), code)
    for (const path of [join(root, "node_modules", "dependency.ts"), join(root, "dist", "build.ts"), join(root, ".env.ts"), join(root, "credentials.ts"), join(outside, "private.ts")]) await writeFile(path, "PRIVATE_SOURCE_SHOULD_NOT_APPEAR")
    await symlink(join(outside, "private.ts"), join(root, "escape.ts")); await symlink(outside, join(root, "external"))
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { install: "MUST_NOT_EXECUTE" }, dependencies: { known: "^1.0.0", unknown: "^1.0.0" } }))
    const inspection = await inspectRepository(root, new AbortController().signal)
    assert.equal(inspection.files, 1); assert.equal(inspection.loc, 4); assert.equal(inspection.complexity, 2)
    const app = services(db, { repositoryPath: root }, { NPM_REGISTRY_URL: `http://127.0.0.1:${address.port}/` })
    assert.equal((await app.collect("repo-metrics")).status, "succeeded")
    const response = await app.dataset("repo-metrics"), data = response.data as TelemetryPresentation
    assert.equal(response.status, "ready"); assert.equal(data.metrics[0].value, "4")
    assert.deepEqual(data.rows.find(row => row[0] === "known"), ["known", "^1.0.0", "1.5.0", "2.0.0", 1])
    assert.equal(data.rows.find(row => row[0] === "unknown")?.[3], null)
    assert.doesNotMatch(JSON.stringify(response), /PRIVATE_SOURCE|registry-private|MUST_NOT_EXECUTE/)
    assert.equal((await services(db, { repositoryPath: outside }).dataset("repo-metrics")).status, "empty")
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) }
}))
test("AI parser deduplicates Claude message IDs and repeated Codex cumulative counters", () => {
  const timestamp = "2026-09-05T12:00:00Z"
  const claude = [1, 2].map(output_tokens => ({ type: "assistant", timestamp, message: { id: "same", model: "claude-fixture", content: "PRIVATE_PROMPT", usage: { input_tokens: 10, output_tokens, cache_read_input_tokens: 3 } } }))
  const rows = parseUsage(claude.map(row => JSON.stringify(row)).join("\n"), "2026-09-05")
  assert.equal(rows.length, 1); assert.equal(rows[0].input, 10); assert.equal(rows[0].output, 2); assert.equal(rows[0].cost, undefined)
  const codex = [100, 100, 150].map(input_tokens => ({ type: "event_msg", timestamp, payload: { type: "token_count", info: { total_token_usage: { input_tokens, output_tokens: 20, cached_input_tokens: 40 } } } }))
  const parsed = parseUsage(codex.map(row => JSON.stringify(row)).join("\n"), "2026-09-05")
  assert.equal(parsed.length, 2); assert.equal(parsed.reduce((sum, row) => sum + row.input, 0), 150)
  assert.doesNotMatch(JSON.stringify(rows), /PRIVATE_PROMPT/)
})
test("AI opt-in and explicit fixture files gate all reads; imports remain source-isolated and idempotent", () => withDatabase(async db => {
  const root = await mkdtemp(join(tmpdir(), "atlas-ai-")), path = join(root, "claude.jsonl")
  try {
    await writeFile(path, JSON.stringify({ type: "result", timestamp: new Date().toISOString(), session_id: "fixture", total_cost_usd: 0.012, usage: { input_tokens: 123, output_tokens: 45, cache_read_input_tokens: 10 }, result: "PRIVATE_PROMPT_OR_RESULT" }))
    const disabled = services(db, { cards: { "ai-usage": { options: { sourcePaths: ["/nonexistent/private.jsonl"] } } } })
    assert.equal((await disabled.collect("ai-usage")).status, "missing-config")
    const app = services(db, { cards: { "ai-usage": { optIn: true, options: { sourcePaths: [path] } } } })
    for (let i = 0; i < 2; i++) assert.equal((await app.collect("ai-usage")).status, "succeeded")
    assert.equal((await db.query(`SELECT * FROM ${db.table("ai_usage")}`)).rowCount, 1)
    const envelope = await app.dataset("ai-usage")
    assert.equal(envelope.status, "ready"); assert.doesNotMatch(JSON.stringify(envelope), /PRIVATE_PROMPT_OR_RESULT|claude\.jsonl/)
    assert.equal((envelope.data as TelemetryPresentation).rows[0][2], "123")
    const otherPath = join(root, "other.jsonl"); await writeFile(otherPath, "{}")
    assert.equal((await services(db, { cards: { "ai-usage": { optIn: true, options: { sourcePaths: [otherPath] } } } }).dataset("ai-usage")).status, "empty")
  } finally { await rm(root, { recursive: true, force: true }) }
}))


test("bounded source reads handle short reads, growth, exact limits, and invalid readers", async () => {
  const content = Buffer.from("é-fixture")
  const read = async (buffer: Buffer, position: number) => {
    const count = Math.min(2, buffer.length, content.length - position)
    content.copy(buffer, 0, position, position + count)
    return count
  }
  assert.equal(await readBoundedSource(read, content.length), "é-fixture")
  await assert.rejects(readBoundedSource(read, content.length - 1), /file size limit/)
  let bytesRequested = 0
  await assert.rejects(readBoundedSource(async buffer => { bytesRequested += buffer.length; buffer.fill(65); return buffer.length }, 64_001), /file size limit/)
  assert.equal(bytesRequested, 64_002)
  for (const invalid of [-1, 0.5, 20]) await assert.rejects(readBoundedSource(async () => invalid, 4), /read completely/)
  const root = await mkdtemp(join(tmpdir(), "atlas-bounded-"))
  try {
    const path = join(root, "source.json")
    await writeFile(path, content)
    assert.equal(await safeFile(path, content.length), "é-fixture")
    await assert.rejects(safeFile(path, content.length - 1), /file size limit/)
    await symlink(path, join(root, "link.json"))
    await assert.rejects(safeFile(join(root, "link.json"), 100))
    await assert.rejects(safeFile(root, 100))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("mixed AI exports preserve other sessions, later steps and Codex records while rejecting ambiguous Claude totals", () => {
  const assistant = (session_id: string | undefined, id: string, input_tokens: number) => ({ type: "assistant", session_id, message: { id, usage: { input_tokens, output_tokens: 1 } } })
  const result = { type: "result", session_id: "a", uuid: "result-a", usage: { input_tokens: 30, output_tokens: 2 } }
  const events = [assistant("a", "one", 10), assistant("b", "one", 20), result, result, assistant("a", "one", 10), assistant("a", "later", 5), { type: "turn.completed", usage: { input_tokens: 7, output_tokens: 1 } }]
  const parsed = parseUsage(JSON.stringify(events), "2026-09-05")
  assert.equal(parsed.filter(row => row.tool === "claude").reduce((sum, row) => sum + row.input, 0), 55)
  assert.equal(parsed.filter(row => row.tool === "codex").reduce((sum, row) => sum + row.input, 0), 7)
  for (const ambiguous of [[assistant(undefined, "one", 10), result], [assistant("a", "one", 10), { ...result, session_id: undefined }]]) {
    assert.throws(() => parseUsage(JSON.stringify(ambiguous), "2026-09-05"), /require session IDs/)
  }
})

test("AI invalid later source leaves prior source snapshots unchanged", () => withDatabase(async db => {
  const root = await mkdtemp(join(tmpdir(), "atlas-ai-atomic-")), first = join(root, "first.json"), second = join(root, "second.json")
  const usage = (input_tokens: number) => JSON.stringify({ type: "turn.completed", usage: { input_tokens, output_tokens: 1 } })
  try {
    await writeFile(first, usage(10)); await writeFile(second, usage(20))
    const app = services(db, { cards: { "ai-usage": { optIn: true, options: { sourcePaths: [first, second] } } } })
    assert.equal((await app.collect("ai-usage")).status, "succeeded")
    await writeFile(first, usage(100)); await writeFile(second, "{}")
    assert.equal((await app.collect("ai-usage")).status, "failed")
    const rows = await db.query(`SELECT input_tokens FROM ${db.table("ai_usage")} ORDER BY input_tokens`)
    assert.deepEqual(rows.rows.map(row => Number(row.input_tokens)), [10, 20])
  } finally { await rm(root, { recursive: true, force: true }) }
}))
