#!/usr/bin/env node
/**
 * Refresh site/vendor/stoa.css from the published @aisocratic/stoa package.
 *
 *   node site/scripts/sync-stoa.mjs
 *
 * The landing page has no build step and must keep working over file://, so
 * the design tokens are vendored rather than installed. Bump VERSION and run.
 */
import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const VERSION = "0.1.0"
const SOURCE = `https://cdn.jsdelivr.net/npm/@aisocratic/stoa@${VERSION}/dist/css/tokens.css`
const TARGET = fileURLToPath(new URL("../vendor/stoa.css", import.meta.url))
const BANNER = `/* @aisocratic/stoa ${VERSION} — vendored; refresh with scripts/sync-stoa.mjs */\n`

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`${SOURCE} → ${res.status} ${res.statusText}`)
const css = await res.text()
if (!css.includes("--brand-gradient")) throw new Error("unexpected payload: no --brand-gradient")

await writeFile(TARGET, BANNER + css, "utf8")
console.log(`wrote ${TARGET} (${css.length} bytes) from ${SOURCE}`)
