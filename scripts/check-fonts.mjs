#!/usr/bin/env node
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const directory = new URL("../app/font-assets/", import.meta.url)
const manifest = JSON.parse(await readFile(new URL("manifest.json", directory), "utf8"))
for (const entry of manifest.files) {
  const bytes = await readFile(new URL(entry.file, directory))
  if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error(`Font asset integrity mismatch: ${entry.file}`)
  if (entry.file.endsWith("-OFL.txt") && !bytes.toString().includes("SIL OPEN FONT LICENSE Version 1.1")) throw new Error(`Missing OFL license: ${entry.file}`)
}
console.log(`Verified ${manifest.files.length} vendored OFL font and license assets`)
