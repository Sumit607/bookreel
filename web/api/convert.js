// Turns a downloaded book into a Bookreel, one request per step so each stays well inside the time limit:
//   GET                                  → { ready }   (is a Gemini key set up)
//   POST { step: "plan", title, authors, parts[20] }            → { plan, model }
//   POST { step: "chapter", n, title, authors, plan, text, prevCliff } → { chapter, extraCharacters, fixed, problems, model }
// No passcode: the app has one reader. Requests from other websites are refused, so no other page can spend the quota.
const { send, readJson } = require("./_lib.js");
const { generateJSON } = require("./_gemini.js");
const F = require("./_bookfmt.js");

const MAX_PLAN_WORDS = 95000;
const MAX_PART_WORDS = 30000;

function fromThisSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers["x-forwarded-host"] || req.headers.host); } catch (e) { return false; }
}

function capWords(text, max) {
  const w = String(text || "").split(/\s+/);
  if (w.length <= max) return String(text || "");
  const head = Math.round(max * 0.8);
  return `${w.slice(0, head).join(" ")}\n\n[… part of the middle is left out …]\n\n${w.slice(w.length - (max - head)).join(" ")}`;
}

async function plan(body) {
  const parts = Array.isArray(body.parts) ? body.parts.map((p) => String(p || "")) : [];
  if (parts.length !== 20) return [400, { error: "A plan needs the book in 20 parts." }];
  const perPart = Math.floor(MAX_PLAN_WORDS / 20);
  const total = parts.reduce((a, p) => a + F.words(p), 0);
  const trimmed = total > MAX_PLAN_WORDS ? parts.map((p) => capWords(p, perPart)) : parts;
  const req = { system: F.PLAN_SYSTEM, prompt: F.planPrompt({ title: body.title, authors: body.authors, parts: trimmed }), schema: F.planSchema, maxOutputTokens: 16384, temperature: 0.3, timeoutMs: 150000 };
  let r;
  try {
    r = await generateJSON({ kind: "flash", ...req });
  } catch (e) {
    // Flash's free daily quota is small; fall back to Flash-Lite when it says "come back much later".
    if (e.status === 429 && e.retryAfter > 60) r = await generateJSON({ kind: "lite", ...req });
    else throw e;
  }
  const p = F.normalizePlan(r.data, 20);
  if (p.characters.length < 2 || p.chapters.filter((c) => !c.summary).length > 4) return [502, { error: "The plan came back incomplete. Try again.", retryAfter: 5 }];
  return [200, { plan: p, model: r.model }];
}

async function chapter(body) {
  const n = parseInt(body.n, 10);
  if (!(n >= 1 && n <= 20)) return [400, { error: "Chapter number must be 1 to 20." }];
  const planIn = F.normalizePlan(body.plan || {}, 20);
  const p = { ...planIn, characters: Array.isArray(body.plan && body.plan.characters) ? planIn.characters.map((c, i) => ({ ...c, color: body.plan.characters[i].color || c.color })) : planIn.characters };
  const ask = p.loops.find((l) => l.askChapter === n) || null;
  const payoff = p.loops.find((l) => l.payoffChapter === n) || null;
  const ctx = { n, total: 20, plan: p.chapters[n - 1], characters: p.characters, ask, payoff };
  const text = capWords(body.text, MAX_PART_WORDS);
  let retry = [], out = null, model = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateJSON({
      kind: "lite", system: F.CHAPTER_SYSTEM, schema: F.chapterSchema, maxOutputTokens: 12000, temperature: 0.5, timeoutMs: 110000,
      prompt: F.chapterPrompt({ title: body.title, authors: body.authors, plan: p, n, text, prevCliff: String(body.prevCliff || "").slice(0, 600), ask, payoff, retry }),
    });
    model = r.model;
    out = F.normalizeChapter(r.data, ctx);
    if (!out.hard.length) break;
    retry = out.hard;
  }
  const posts = out.chapter.posts;
  const usable = posts.length === 10 && posts[0].type === "hook" && posts[9].type === "cliffhanger";
  if (!usable) return [502, { error: `Chapter ${n} did not come out right (${out.hard.join("; ")}). Try again.`, retryAfter: 5 }];
  return [200, { chapter: out.chapter, extraCharacters: out.extra, fixed: out.fixed, problems: out.hard, model }];
}

module.exports = async (req, res) => {
  if (req.method === "GET") {
    return send(res, 200, { ready: !!process.env.GEMINI_API_KEY || process.env.GEMINI_MOCK === "1" });
  }
  if (req.method !== "POST") return send(res, 405, { error: "GET or POST only" }, { Allow: "GET, POST" });
  if (!fromThisSite(req)) return send(res, 403, { error: "Only the Bookreel app can convert books." });
  const body = await readJson(req);
  try {
    const [status, out] = body.step === "plan" ? await plan(body) : body.step === "chapter" ? await chapter(body) : [400, { error: "Unknown step" }];
    return send(res, status, out);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500 && status !== 503 && status !== 504) console.error("convert", body.step, body.n || "", e.message);
    return send(res, status, { error: e.message || "Conversion failed", retryAfter: e.retryAfter || 0 });
  }
};
