import { build } from "esbuild";
import { createHash } from "node:crypto";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist/pages");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "site"), output, { recursive: true, filter: source => !source.endsWith(".tsx") });
await mkdir(path.join(output, "demo"), { recursive: true });
const bundle = await build({
  entryPoints: [path.join(root, "site/preview/entry.tsx")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  outdir: path.join(output, "demo"),
  entryNames: "preview-[hash]",
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
  external: ["./fonts/*"],
});
await mkdir(path.join(output, "demo/fonts"), { recursive: true });
for (const name of ["inter.woff2", "newsreader.ttf", "inter-OFL.txt", "newsreader-OFL.txt"]) {
  await cp(path.join(root, "app/font-assets", name), path.join(output, "demo/fonts", name));
}
const stylesheet = await readFile(path.join(root, "app/globals.css"), "utf8");
const styles = await postcss([tailwindcss()]).process(stylesheet, { from: path.join(root, "app/globals.css") });
const stylesName = `stoa-${createHash("sha256").update(styles.css).digest("hex").slice(0, 12)}.css`;
await writeFile(path.join(output, "demo", stylesName), styles.css);
// The same relative links work locally and under the repository's Pages prefix.
const outputs = Object.keys(bundle.metafile.outputs);
const scriptName = path.basename(outputs.find(name => name.endsWith(".js")));
const cssName = path.basename(outputs.find(name => name.endsWith(".css")));
const html = (await readFile(path.join(root, "site/preview/index.html"), "utf8"))
  .replace("./preview.js", `./${scriptName}`)
  .replace("./preview.css", `./${cssName}`)
  .replace("./stoa.css", `./${stylesName}`);
await writeFile(path.join(output, "demo/index.html"), html);
await cp(path.join(output, "demo"), path.join(output, "preview"), { recursive: true });
process.stdout.write(`Built GitHub Pages site with analytics preview in ${output}\n`);
