import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist/pages");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "site"), output, { recursive: true, filter: source => !source.endsWith(".tsx") });
await build({
  entryPoints: [path.join(root, "site/preview/entry.tsx")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  outfile: path.join(output, "preview/preview.js"),
  define: { "process.env.NODE_ENV": '"production"' },
  external: ["./fonts/*"],
});
await mkdir(path.join(output, "preview/fonts"), { recursive: true });
for (const name of ["space-grotesk.ttf", "newsreader.ttf", "spacegrotesk-OFL.txt", "newsreader-OFL.txt"]) {
  await cp(path.join(root, "app/font-assets", name), path.join(output, "preview/fonts", name));
}
// The same relative links work locally and under the repository's Pages prefix.
const html = await readFile(path.join(root, "site/preview/index.html"), "utf8");
await writeFile(path.join(output, "preview/index.html"), html);
process.stdout.write(`Built GitHub Pages site with analytics preview in ${output}\n`);
