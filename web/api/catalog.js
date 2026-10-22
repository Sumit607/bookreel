// Free books from Project Gutenberg's own catalogue (its OPDS feeds), English, most downloaded first.
//   GET ?q=&topic=&page=  → { page, next, books: [{ id, title, authors, cover, ... }] }  (25 per page)
//   GET ?ids=<number>     → { books: [one book with subjects, downloads, language and summary] }
// CATALOG_FIXTURES=<dir> reads opds-*.xml files instead of calling Gutenberg (tests only).
const fs = require("fs");
const path = require("path");
const { send } = require("./_lib.js");

const SITE = "https://www.gutenberg.org";
const TOPICS = { mystery: "s.detective", adventure: "s.adventure", romance: "s.love", scifi: "s.science s.fiction", horror: "s.horror", philosophy: "s.philosophy", children: "s.juvenile", history: "s.history" };
const PER_PAGE = 25;

function entities(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
/** Text of an XML fragment, one string per line, tags removed. */
function lines(s) {
  return entities(String(s || "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")).split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}
const oneLine = (s) => lines(s).join(" ");
const cover = (id) => `${SITE}/cache/epub/${id}/pg${id}.cover.medium.jpg`;

/** "Shelley, Mary Wollstonecraft, 1797-1851" → { name: "Mary Wollstonecraft Shelley", birth: 1797, death: 1851 }.
 *  Also "Sunzi, active 6th century B.C." → "Sunzi" and "Marcus Aurelius, Emperor of Rome, 121-180" → "Marcus Aurelius". */
function person(raw) {
  let parts = raw.split(",").map((x) => x.replace(/\s*\([^)]*\)/g, "").trim()).filter(Boolean);
  let birth = null, death = null;
  const isDate = (x) => /\d|\bcentury\b|^active\b|^fl\.|^approximately\b|\bB\.?C\.?E?\b/i.test(x);
  while (parts.length > 1 && isDate(parts[parts.length - 1])) {
    const d = parts.pop().match(/^(\d{1,4})?\??\s*(BCE|B\.C\.)?\s*-\s*(\d{1,4})?\??\s*(BCE|B\.C\.)?$/i);
    if (d && birth === null && death === null) {
      birth = d[1] ? (d[2] ? -d[1] : +d[1]) : null;
      death = d[3] ? (d[4] ? -d[3] : +d[3]) : null;
    }
  }
  const title = parts.length === 2 && /\b(of|the|emperor|king|queen|saint|pope|earl|lord|lady|duke|baron)\b/i.test(parts[1]);
  const name = parts.length === 2 && !title ? `${parts[1]} ${parts[0]}` : parts[0] || raw.trim();
  return { name, birth, death };
}

async function get(url, fixture) {
  if (process.env.CATALOG_FIXTURES) return fs.readFileSync(path.join(process.env.CATALOG_FIXTURES, fixture), "utf8");
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { accept: "application/atom+xml", "user-agent": "Bookreel/1.0 (personal reading app)" } });
      if (r.ok) return await r.text();
    } catch (e) { /* retry once */ } finally { clearTimeout(timer); }
  }
  throw new Error("Project Gutenberg's catalogue is not answering right now.");
}

/** Book entries of a search feed. Navigation entries (no /ebooks/<n>.opds id) are skipped. */
function parseList(xml) {
  const books = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const id = (e.match(/<id>[^<]*\/ebooks\/(\d+)\.opds<\/id>/) || [])[1];
    if (!id) continue;
    const title = lines((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1])[0] || `Book #${id}`;
    const content = oneLine((e.match(/<content type="text">([\s\S]*?)<\/content>/) || [])[1]);
    const dl = content.match(/^(\d+) downloads?$/); // Gutenberg shows this in place of an author when there is none
    books.push({
      id: +id, title, authors: content && !dl ? [{ name: content, birth: null, death: null }] : [], subjects: [], languages: ["en"],
      downloads: dl ? +dl[1] : null, cover: cover(id), text: true,
    });
  }
  return books;
}

/** One book's feed: Gutenberg lists the details as <p>Label: value</p> or <p>Label:\nline\nline</p> blocks. */
function parseBook(xml, id) {
  const entry = (xml.match(/<entry>([\s\S]*?)<\/entry>/) || [])[1] || "";
  const blocks = [];
  for (const m of entry.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    const l = lines(m[1]);
    if (l.length >= 2 && /:$/.test(l[0])) blocks.push([l[0].slice(0, -1), ...l.slice(1)]);
    else if (l.length === 1) { const kv = l[0].match(/^([A-Za-z][A-Za-z .]{0,24}?):\s+(.+)$/); if (kv) blocks.push([kv[1], kv[2]]); }
  }
  const field = (label) => blocks.filter((l) => l[0] === label).map((l) => l.slice(1));
  const subjects = [];
  for (const [s] of field("Subject")) {
    if (/Fictitious character|^Fiction$/i.test(s)) continue;
    const clean = s.split(" -- ")[0].replace(/\s*\([^)]*\)/g, "").trim();
    if (clean && !subjects.includes(clean)) subjects.push(clean);
  }
  const summary = (field("Summary")[0] || []).join(" ").replace(/\s*\(This is an automatically generated summary\.\)\s*$/i, "").trim();
  const people = [...field("Author"), ...field("Editor")].map((l) => person(l.join(" ")));
  const lang = ((field("Language")[0] || [])[0] || "English").toLowerCase();
  const titleLines = field("Title")[0] || lines((entry.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
  return {
    id: +id, title: titleLines[0] || `Book #${id}`, authors: people.slice(0, 3), subjects: subjects.slice(0, 4),
    languages: [lang === "english" ? "en" : lang], downloads: parseInt((field("Downloads")[0] || [])[0], 10) || null,
    cover: cover(id), summary: summary.length > 900 ? summary.slice(0, 897).replace(/\s+\S*$/, "") + "…" : summary, detail: true, text: true,
  };
}

module.exports = async (req, res) => {
  const q = new URL(req.url, "http://localhost").searchParams;
  const one = (q.get("ids") || "").replace(/[^0-9]/g, "").slice(0, 6);
  try {
    if (one) {
      const xml = await get(`${SITE}/ebooks/${one}.opds`, `opds-${one}.xml`);
      if (!/<entry>/.test(xml)) return send(res, 404, { error: "Project Gutenberg has no book with that number." });
      return send(res, 200, { books: [parseBook(xml, one)] }, { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" });
    }
    const search = (q.get("q") || "").replace(/[^\p{L}\p{N}\s'’-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    const topic = TOPICS[q.get("topic") || ""] || "";
    const page = Math.max(1, Math.min(200, parseInt(q.get("page") || "1", 10) || 1));
    const query = [search || topic, "l.en"].filter(Boolean).join(" ");
    const params = new URLSearchParams({ query, sort_order: "downloads" });
    if (page > 1) params.set("start_index", String((page - 1) * PER_PAGE + 1));
    const fixture = search ? "opds-search.xml" : topic ? "opds-topic.xml" : "opds-popular.xml";
    const xml = await get(`${SITE}/ebooks/search.opds/?${params}`, fixture);
    const books = parseList(xml);
    const more = /<link rel="next"/.test(xml) && books.length > 0;
    return send(res, 200, { page, next: more ? page + 1 : null, books }, {
      "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
    });
  } catch (e) {
    return send(res, 502, { error: e.message });
  }
};

module.exports.parseList = parseList;
module.exports.parseBook = parseBook;
module.exports.person = person;
