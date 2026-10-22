// Local stand-in for Vercel: serves web/public and runs web/api/*.js handlers. For tests only.
// Usage: node tools/serve.mjs [port]
// Offline test mode (no Gemini, Gutenberg or Supabase): GEMINI_MOCK=1 BOOKREEL_DB_MOCK=1 CATALOG_FIXTURES=tools/fixtures BOOK_FIXTURES=tools/fixtures
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const PUB = path.join(ROOT, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".mjs": "text/javascript; charset=utf-8", ".txt": "text/plain; charset=utf-8" };
const port = +(process.argv[2] || 4173);

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
    const file = path.join(ROOT, "api", name + ".js");
    if (!name || name.startsWith("_") || !fs.existsSync(file)) { res.statusCode = 404; return res.end("not found"); }
    try { return await require(file)(req, res); } catch (e) { console.error(e); res.statusCode = 500; return res.end("error"); }
  }
  let p = path.normalize(path.join(PUB, decodeURIComponent(url.pathname)));
  if (!p.startsWith(PUB)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end("not found"); }
  res.setHeader("Content-Type", TYPES[path.extname(p)] || "application/octet-stream");
  if (p.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
  fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log(`serving web/ on http://localhost:${port}`));

// Stand-in for Supabase's pg_cron: with the in-memory job store, run the cloud worker every 1.5 s.
if (process.env.BOOKREEL_DB_MOCK === "1") {
  const worker = require(path.join(ROOT, "api", "worker.js"));
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    const res = { statusCode: 200, setHeader() {}, end() {} };
    try { await worker({ method: "POST", headers: { "x-bookreel-token": "mock-token" }, url: "/api/worker" }, res); } catch (e) { console.error("worker", e); }
    busy = false;
  }, 1500);
}
