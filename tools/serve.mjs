// Local stand-in for Vercel: serves web/public and runs web/api/*.js handlers. For tests only.
// Usage: BOOKREEL_PASSCODE=... node tools/serve.mjs [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web");
const PUB = path.join(ROOT, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };
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
