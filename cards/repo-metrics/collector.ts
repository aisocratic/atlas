import { constants } from "node:fs"
import { lstat, readdir, open, realpath } from "node:fs/promises"
import { basename, extname, isAbsolute, join, relative, sep } from "node:path"
import { createHash } from "node:crypto"
import ts from "typescript"
import { maxSatisfying, validRange, major, valid } from "semver"
import type { CardContext, CollectionContext } from "../../lib/cards/define"
import { CollectorError } from "../../lib/collectors/execute"
import { providerEndpoint, record, requestJson } from "../../lib/collectors/http"
import { insertTelemetry } from "../../lib/db/telemetry"

const excluded = new Set([".git", "node_modules", "vendor", ".next", "dist", "build", "coverage", "target", ".venv", "venv", ".cache", "out"])
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"])
export function requirements(context: CardContext) { return context.config.repositoryPath && isAbsolute(context.config.repositoryPath) ? [] : [{ id: "checkout", reason: "Set ATLAS_REPOSITORY_PATH to an explicit absolute checkout path. No repository is discovered automatically." }] }
export function repositorySource(context: CardContext) { return `checkout:${createHash("sha256").update(context.config.repositoryPath ?? "").digest("hex")}` }
export async function readBoundedSource(read: (buffer: Buffer, position: number) => Promise<number>, maximum: number): Promise<string> {
  const chunks: Buffer[] = []; let position = 0
  while (position <= maximum) {
    const buffer = Buffer.alloc(Math.min(64_000, maximum + 1 - position)), bytesRead = await read(buffer, position)
    if (bytesRead === 0) break
    if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length) throw new CollectorError("Configured source could not be read completely.")
    position += bytesRead
    if (position > maximum) throw new CollectorError("Configured source exceeds the file size limit.")
    chunks.push(buffer.subarray(0, bytesRead))
  }
  return Buffer.concat(chunks).toString("utf8")
}
export async function safeFile(path: string, maximum: number): Promise<string> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > maximum) throw new CollectorError("Configured source exceeds the file size limit.")
    return await readBoundedSource(async (buffer, position) => (await handle.read(buffer, 0, buffer.length, position)).bytesRead, maximum)
  } finally { await handle.close() }
}
export async function inspectRepository(path: string, signal: AbortSignal) {
  if (!isAbsolute(path) || (await lstat(path)).isSymbolicLink()) throw new CollectorError("Repository must be an explicit directory, not a symlink.")
  const root = await realpath(path), files: { name: string; text: string }[] = []; let bytes = 0, visited = 0
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      signal.throwIfAborted()
      if (++visited > 10_000) throw new CollectorError("Repository entry limit exceeded.")
      if (entry.isSymbolicLink() || entry.name.startsWith(".") || excluded.has(entry.name) || /(?:secret|credential|\.pem$|\.key$)/i.test(entry.name)) continue
      const target = join(directory, entry.name)
      if (entry.isDirectory()) { await walk(target); continue }
      if (!entry.isFile() || !sourceExtensions.has(extname(entry.name))) continue
      const resolved = await realpath(target), rel = relative(root, resolved)
      if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) continue
      const text = await safeFile(target, 512_000); bytes += Buffer.byteLength(text)
      if (bytes > 10_000_000 || files.length >= 2000) throw new CollectorError("Repository source budget exceeded (2000 files / 10 MB).")
      files.push({ name: rel, text })
    }
  }
  await walk(root)
  let loc = 0; const functions: number[] = [], blocks = new Map<string, number>(), totals: string[] = []
  for (const file of files) {
    const tree = ts.createSourceFile(file.name, file.text, ts.ScriptTarget.Latest, true)
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, file.text), lines = new Set<number>()
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) if (![ts.SyntaxKind.WhitespaceTrivia, ts.SyntaxKind.NewLineTrivia, ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia, ts.SyntaxKind.ShebangTrivia].includes(token)) {
      const first = tree.getLineAndCharacterOfPosition(scanner.getTokenPos()).line, last = tree.getLineAndCharacterOfPosition(Math.max(scanner.getTokenPos(), scanner.getTextPos() - 1)).line
      for (let line = first; line <= last; line++) lines.add(line)
    }
    loc += lines.size
    function visit(node: ts.Node) {
      if (ts.isFunctionLike(node) && "body" in node && node.body) {
        let complexity = 1
        const decisions = (part: ts.Node) => {
          if (part !== node && ts.isFunctionLike(part)) return
          if (ts.isIfStatement(part) || ts.isForStatement(part) || ts.isForInStatement(part) || ts.isForOfStatement(part) || ts.isWhileStatement(part) || ts.isDoStatement(part) || ts.isCaseClause(part) || ts.isCatchClause(part) || ts.isConditionalExpression(part) || (ts.isBinaryExpression(part) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(part.operatorToken.kind))) complexity++
          ts.forEachChild(part, decisions)
        }
        decisions(node); functions.push(complexity)
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
    const content = file.text.split(/\r?\n/).filter((_, index) => lines.has(index)).map(line => line.trim())
    // Non-overlapping five-line blocks; reported formula deliberately differs from token-clone analyzers.
    for (let i = 0; i + 5 <= content.length; i += 5) { const key = createHash("sha256").update(content.slice(i, i + 5).join("\n")).digest("hex"); blocks.set(key, (blocks.get(key) ?? 0) + 1); totals.push(key) }
  }
  functions.sort((a, b) => a - b)
  let manifest: Record<string, unknown> = {}
  try { manifest = record(JSON.parse(await safeFile(join(root, "package.json"), 512_000))) } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  const dependencies = ["dependencies", "devDependencies"].flatMap(kind => Object.entries(record(manifest[kind])).map(([name, range]) => ({ name, range: String(range).slice(0, 200), kind: kind === "dependencies" ? "runtime" as const : "development" as const })))
  if (dependencies.length > 500) throw new CollectorError("Repository dependency limit exceeded (500).")
  return { label: basename(root), loc, files: files.length, duplication: totals.length ? 100 * totals.filter(key => blocks.get(key)! > 1).length / totals.length : 0, complexity: functions.length ? functions[Math.ceil(functions.length * 0.95) - 1] : undefined, dependencies }
}
export const collector = { async collect(context: CollectionContext) {
  const result = await inspectRepository(context.config.repositoryPath!, context.signal)
  const dependencies = result.dependencies.map(dep => ({ ...dep, latest: undefined as string | undefined, wanted: undefined as string | undefined, behind: undefined as number | undefined }))
  let index = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (index < Math.min(40, dependencies.length)) {
      const dep = dependencies[index++]
      if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(dep.name) || !validRange(dep.range)) continue
      try {
        const base = providerEndpoint(context.env.NPM_REGISTRY_URL, "https://registry.npmjs.org/")
        const value = record(await requestJson(context, new URL(encodeURIComponent(dep.name), base.href.endsWith("/") ? base : `${base.href}/`), { maximum: 4_000_000, timeoutMs: 10_000 }))
        const latest = record(value["dist-tags"]).latest, versions = Object.keys(record(value.versions))
        if (typeof latest === "string" && valid(latest)) { dep.latest = latest; dep.wanted = maxSatisfying(versions, dep.range) ?? undefined; if (dep.wanted) dep.behind = Math.max(0, major(latest) - major(dep.wanted)) }
      } catch { if (context.signal.aborted) context.signal.throwIfAborted() /* Unavailable registry data remains unknown. */ }
    }
  }))
  return { async publish(tx: Parameters<typeof insertTelemetry>[0]) {
    const row = await insertTelemetry(tx, "repo_metrics", { run_id: context.runId, repository: repositorySource(context), source_loc: result.loc, source_files: result.files, dependency_count: dependencies.length, duplication_percentage: result.duplication, complexity_p95: result.complexity, metrics: { label: result.label, supportedLanguages: ["JavaScript", "TypeScript", "JSX", "TSX"], registryChecked: dependencies.filter(dep => dep.latest).length, wanted: Object.fromEntries(dependencies.map(dep => [dep.name, dep.wanted ?? null])) } })
    for (const dep of dependencies) await insertTelemetry(tx, "dependency_health", { metric_id: row.id, package_name: dep.name, current_version: dep.range, latest_version: dep.latest, dependency_type: dep.kind, majors_behind: dep.behind })
    return { rowsWritten: dependencies.length + 1 }
  } }
} }
