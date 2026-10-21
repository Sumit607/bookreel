// GET ?q=&topic=&page= → free books from Project Gutenberg's catalogue (via the Gutendex API), English, most
// downloaded first. Trimmed to what the app shows. CATALOG_FIXTURES=<dir> serves saved pages instead (tests only).
const fs = require("fs");
const path = require("path");
const { send } = require("./_lib.js");

const TOPICS = { mystery: "detective", adventure: "adventure", romance: "love stories", scifi: "science fiction", horror: "horror", philosophy: "philosophy", children: "children", history: "history", poetry: "poetry" };

function person(name) {
  const m = String(name || "").match(/^([^,]+),\s*([^(]+?)(\s*\(.*\))?$/);
  return m ? `${m[2].trim()} ${m[1].trim()}` : String(name || "").trim();
}

function subjects(list) {
  const out = [];
  for (const s of list || []) {
    const clean = String(s).split(" -- ")[0].replace(/\(.*?\)/g, "").replace(/,\s*$/, "").trim();
    if (clean && !/^fiction$/i.test(clean) && !out.includes(clean)) out.push(clean);
    if (out.length === 4) break;
  }
  return out;
}

function trim(b) {
  const f = b.formats || {};
  const text = Object.keys(f).some((k) => k.startsWith("text/plain"));
  return {
    id: b.id,
    title: String(b.title || "").replace(/\s+/g, " ").trim(),
    authors: (b.authors || []).map((a) => ({ name: person(a.name), birth: a.birth_year ?? null, death: a.death_year ?? null })),
    subjects: subjects(b.subjects),
    languages: b.languages || [],
    downloads: b.download_count || 0,
    cover: f["image/jpeg"] || null,
    text,
  };
}

async function fetchPage(params) {
  if (process.env.CATALOG_FIXTURES) {
    const name = params.get("ids") ? "ids" : params.get("search") ? "search" : params.get("topic") ? "topic" : "popular";
    return JSON.parse(fs.readFileSync(path.join(process.env.CATALOG_FIXTURES, `gutendex-${name}.json`), "utf8"));
  }
  const url = `https://gutendex.com/books/?${params}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json", "user-agent": "Bookreel/1.0 (personal reading app)" } });
      if (r.ok) return await r.json();
    } catch (e) { /* retry once */ } finally { clearTimeout(timer); }
  }
  throw new Error("The free-books catalogue is not answering right now.");
}

module.exports = async (req, res) => {
  const q = new URL(req.url, "http://localhost").searchParams;
  const params = new URLSearchParams({ languages: "en", mime_type: "text/plain" });
  const search = (q.get("q") || "").trim().slice(0, 80);
  const topic = TOPICS[q.get("topic") || ""];
  const page = Math.max(1, Math.min(500, parseInt(q.get("page") || "1", 10) || 1));
  const ids = (q.get("ids") || "").replace(/[^0-9,]/g, "").split(",").filter(Boolean).slice(0, 32).join(",");
  if (ids) params.set("ids", ids);
  if (search) params.set("search", search);
  if (topic) params.set("topic", topic);
  if (page > 1) params.set("page", String(page));
  try {
    const data = await fetchPage(params);
    const books = (data.results || []).map(trim).filter((b) => b.text);
    return send(res, 200, { count: data.count || books.length, page, next: data.next ? page + 1 : null, books }, {
      "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
    });
  } catch (e) {
    return send(res, 502, { error: e.message });
  }
};
