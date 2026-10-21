// GET ?id=<Gutenberg number> → { id, text, words }: the plain text of a public-domain book with Project Gutenberg's
// licence header and footer removed, ready to save on the phone. BOOK_FIXTURES=<dir> reads pg<id>.txt (tests only).
const fs = require("fs");
const path = require("path");
const { send } = require("./_lib.js");

function mirrorPath(id) {
  return id.length === 1 ? `0/${id}` : `${id.slice(0, -1).split("").join("/")}/${id}`;
}

async function download(id) {
  if (process.env.BOOK_FIXTURES) return fs.readFileSync(path.join(process.env.BOOK_FIXTURES, `pg${id}.txt`), "utf8");
  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,
    `https://gutenberg.pglaf.org/${mirrorPath(id)}/${id}-0.txt`,
    `https://gutenberg.pglaf.org/${mirrorPath(id)}/${id}.txt`,
  ];
  for (const url of urls) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": "Bookreel/1.0 (personal reading app)" } });
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        const utf8 = buf.toString("utf8");
        return utf8.includes("�") ? buf.toString("latin1") : utf8;
      }
    } catch (e) { /* try the next source */ } finally { clearTimeout(timer); }
  }
  return null;
}

/** Keep only the book: drop Project Gutenberg's header, footer and licence. */
function clean(raw) {
  let t = raw.replace(/\r\n?/g, "\n").replace(/^﻿/, "");
  const start = t.search(/\*{3}\s*START OF (THE|THIS) PROJECT GUTENBERG E(BOOK|TEXT)[^\n]*\*{3}/i);
  if (start >= 0) t = t.slice(t.indexOf("\n", start) + 1);
  const end = t.search(/\*{3}\s*END OF (THE|THIS) PROJECT GUTENBERG E(BOOK|TEXT)/i);
  if (end >= 0) t = t.slice(0, end);
  const endAlt = t.search(/\n\s*End of (the )?Project Gutenberg'?s? /i);
  if (endAlt >= 0) t = t.slice(0, endAlt);
  t = t.replace(/^\s*(Produced by|Transcribed from|E-text prepared by)[^\n]*(\n[^\n]+)*\n/i, "");
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = async (req, res) => {
  const id = (new URL(req.url, "http://localhost").searchParams.get("id") || "").trim();
  if (!/^\d{1,6}$/.test(id)) return send(res, 400, { error: "Not a Project Gutenberg book number." });
  let raw;
  try { raw = await download(id); } catch (e) { raw = null; }
  if (!raw) return send(res, 502, { error: "Could not download this book from Project Gutenberg. Try again in a minute." });
  const text = clean(raw);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 3000) return send(res, 422, { error: "This book is too short to make 20 chapters." });
  if (text.length > 4000000) return send(res, 413, { error: "This book is too long for Bookreel." });
  return send(res, 200, { id: +id, text, words }, { "Cache-Control": "public, max-age=86400, s-maxage=604800" });
};
