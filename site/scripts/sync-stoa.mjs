#!/usr/bin/env node
/**
 * Refresh site/vendor/stoa.css from @aisocratic/stoa.
 *
 *   node site/scripts/sync-stoa.mjs            # the published VERSION, via jsDelivr
 *   node site/scripts/sync-stoa.mjs ../stoa    # a local checkout's dist/css/tokens.css
 *
 * The landing page has no build step and must keep working over file://, so
 * the design tokens are vendored rather than installed. Bump VERSION and run.
 * Pass a path to a Stoa checkout to pull an unpublished build instead — the
 * version is then read from that checkout's package.json.
 */
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const VERSION = "0.2.0"
const TARGET = fileURLToPath(new URL("../vendor/stoa.css", import.meta.url))

const local = process.argv[2]
let css, version, source
if (local) {
  const root = resolve(local)
  version = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).version
  source = resolve(root, "dist/css/tokens.css")
  css = await readFile(source, "utf8")
} else {
  version = VERSION
  source = `https://cdn.jsdelivr.net/npm/@aisocratic/stoa@${VERSION}/dist/css/tokens.css`
  const res = await fetch(source)
  if (!res.ok) throw new Error(`${source} → ${res.status} ${res.statusText}`)
  css = await res.text()
}

// The roles the stylesheet leans on; a payload without them is the wrong file.
for (const token of ["--brand-gradient", "--tracking-eyebrow", "--radius-xl", "--oat-1"]) {
  if (!css.includes(token)) throw new Error(`unexpected payload: no ${token}`)
}

const banner = `/* @aisocratic/stoa ${version} — vendored; refresh with scripts/sync-stoa.mjs */\n`
await writeFile(TARGET, banner + css, "utf8")
console.log(`wrote ${TARGET} (${css.length} bytes) from ${source}`)
