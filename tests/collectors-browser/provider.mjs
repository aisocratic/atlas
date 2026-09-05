import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import ts from "typescript";
const origin = "http://127.0.0.1:4185";
const beacon = ts.transpileModule(readFileSync("examples/browser-beacon.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replace('from "web-vitals"', 'from "/web-vitals.js"');
const vitals = readFileSync(new URL("../../node_modules/web-vitals/dist/web-vitals.js", import.meta.url), "utf8");
const server = createServer((request, response) => {
  const url = new URL(request.url, origin);
  if (url.pathname === "/health") { response.end("OK"); return; }
  if (url.pathname === "/browser-beacon.js" || url.pathname === "/web-vitals.js") { response.setHeader("Content-Type", "application/javascript"); response.end(url.pathname === "/browser-beacon.js" ? beacon : vitals); return; }
  if (url.pathname === "/beacon") { response.setHeader("Content-Type", "text/html"); response.end(`<h1>Measured browser fixture</h1><button id="interact">Exercise interaction</button><script type="module">import { installAtlasVitals } from '/browser-beacon.js'; installAtlasVitals({endpoint:'http://127.0.0.1:4184',writeKey:'public-browser-e2e-write-key'}); document.querySelector('button').onclick=()=>document.querySelector('h1').textContent='Interaction measured';</script>`); return; }
  if (url.pathname === "/pagespeed") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ lighthouseResult: { requestedUrl: url.searchParams.get("url"), fetchTime: new Date().toISOString(), categories: Object.fromEntries(["performance", "seo", "accessibility", "best-practices"].map(name => [name, { score: 0.95 }])), audits: { "largest-contentful-paint": { numericValue: 1400 }, "cumulative-layout-shift": { numericValue: 0.03 }, "total-blocking-time": { numericValue: 60 } } } })); return; }
  if (url.pathname === "/repos/atlas/browser/releases") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify([{ id: 101, tag_name: "v1.2.3", name: "Measured browser release", published_at: new Date().toISOString(), draft: false, prerelease: false, html_url: "https://github.com/atlas/browser/releases/tag/v1.2.3" }])); return; }
  response.setHeader("Content-Type", "text/html"); response.end(`<title>Atlas measured test page</title><meta name="description" content="This local provider page supplies a real bounded HTTP response for browser verification."><link rel="canonical" href="${origin}/"><meta property="og:title" content="Atlas"><meta property="og:description" content="Telemetry"><h1>Atlas measured provider</h1>`);
});
server.listen(4185, "127.0.0.1");
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
