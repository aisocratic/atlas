#!/usr/bin/env node
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const metadataPath = resolve(root, "vendor/design.json")
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")
if (process.argv[2] === "--check") {
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"))
  const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"))
  if (manifest.dependencies[metadata.package] !== `file:vendor/${metadata.archive}`) throw new Error("Design manifest/archive mismatch")
  if (digest(await readFile(resolve(root, "vendor", metadata.archive))) !== metadata.sha256) throw new Error("Design archive integrity mismatch")
  console.log(`Verified ${metadata.package}@${metadata.version}`)
} else {
  if (!process.argv[2]) throw new Error("Usage: pnpm design:sync /path/to/built/stoa")
  const source = resolve(process.argv[2])
  const pkg = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"))
  if (pkg.name !== "@aisocratic/design") throw new Error("Expected @aisocratic/design")
  await readFile(resolve(source, "dist/css/tailwind.css"))
  const temporary = await mkdtemp(resolve(tmpdir(), "atlas-design-"))
  try {
    execFileSync("pnpm", ["pack", "--pack-destination", temporary], { cwd: source, stdio: "inherit" })
    const archives = (await readdir(temporary)).filter((name) => name.endsWith(".tgz"))
    if (archives.length !== 1) throw new Error("Expected one packed design archive")
    const archive = archives[0]
    await mkdir(resolve(root, "vendor"), { recursive: true })
    await copyFile(resolve(temporary, archive), resolve(root, "vendor", archive))
    const manifestPath = resolve(root, "package.json")
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    manifest.dependencies[pkg.name] = `file:vendor/${archive}`
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim()
    const sha256 = digest(await readFile(resolve(root, "vendor", archive)))
    await writeFile(metadataPath, JSON.stringify({ package: pkg.name, version: pkg.version, sourceCommit, archive, sha256 }, null, 2) + "\n")
    execFileSync("pnpm", ["install", "--force"], { cwd: root, stdio: "inherit" })
    execFileSync("pnpm", ["install", "--lockfile-only", "--ignore-scripts"], { cwd: root, stdio: "inherit" })
    execFileSync("pnpm", ["install", "--frozen-lockfile"], { cwd: root, stdio: "inherit" })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
