#!/usr/bin/env node
/** Vendor the exact @aisocratic/design static stylesheet, with provenance.
 * node site/scripts/sync-design.mjs ../stoa
 * node site/scripts/sync-design.mjs --check
 * node site/scripts/sync-design.mjs --version <published-version>
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../vendor/design.css", import.meta.url));
const metadataPath = fileURLToPath(new URL("../vendor/design.json", import.meta.url));
const args = process.argv.slice(2);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

if (args.length === 1 && args[0] === "--check") {
  const [css, metadata] = await Promise.all([
    readFile(target), readFile(metadataPath, "utf8").then(JSON.parse),
  ]);
  if (metadata.package !== "@aisocratic/design" || metadata.file !== "dist/css/site.css" || hash(css) !== metadata.sha256) {
    throw new Error("Vendored design does not match its recorded package and SHA-256. Refresh from a trusted Stoa build.");
  }
  console.log(`Verified ${metadata.package}@${metadata.version}: ${metadata.sha256}`);
} else {
  let css, version, source;
  if (args.length === 2 && args[0] === "--version" && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(args[1])) {
    version = args[1];
    source = `https://cdn.jsdelivr.net/npm/@aisocratic/design@${version}/dist/css/site.css`;
    const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Unable to fetch ${source}: ${response.status}`);
    css = Buffer.from(await response.arrayBuffer());
  } else if (args.length === 1 && !args[0].startsWith("--")) {
    const root = resolve(args[0]);
    const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
    if (pkg.name !== "@aisocratic/design") throw new Error("Source must be an @aisocratic/design checkout; run pnpm build there first.");
    version = pkg.version;
    source = "local Stoa build";
    css = await readFile(resolve(root, "dist/css/site.css"));
  } else {
    throw new Error("Usage: node site/scripts/sync-design.mjs <stoa-checkout> | --check | --version <published-version>");
  }
  for (const marker of ["--brand-gradient", "--tracking-eyebrow", "--radius-xl", ".project-hero", ".site-header", ".site-footer"]) {
    if (!css.includes(marker)) throw new Error(`Unexpected stylesheet: missing ${marker}`);
  }
  const metadata = { package: "@aisocratic/design", version, file: "dist/css/site.css", source, sha256: hash(css) };
  await mkdir(dirname(target), { recursive: true });
  await writeFile(`${target}.tmp`, css);
  await writeFile(`${metadataPath}.tmp`, JSON.stringify(metadata, null, 2) + "\n");
  await rename(`${target}.tmp`, target);
  await rename(`${metadataPath}.tmp`, metadataPath);
  console.log(`Vendored ${metadata.package}@${version} (${css.length} bytes), SHA-256 ${metadata.sha256}`);
}
