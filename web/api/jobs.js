// Cloud conversion jobs for the app. The phone sends the book once, in 20 parts; the worker (/api/worker) does the
// rest while the app is closed, and the app collects the finished Bookreel later.
//   GET                          → { ready }                 (Gemini key and job store set up)
//   GET ?ids=<id,id>             → { jobs: [status, ...] }   (no book text)
//   GET ?result=<id>             → { pack }                  (when done)
//   POST { action: "create", itemId, title, authors, source, parts[20], allowLite } → { id }
//   POST { action: "cancel" | "lite" | "retry", id }
// Requests from other websites are refused, so no other page can spend the Gemini quota.
const { send, readJson } = require("./_lib.js");
const { rpc, configured } = require("./_store.js");
const { MAX_PART_WORDS } = require("./_pipeline.js");

// A chapter takes about 40 s when Gemini answers at once, but the free Flash models often say "high demand" first:
// on the first live book a chapter took about 3.5 minutes on average, so estimates use that.
const STEP_SECONDS = 210;

function fromThisSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === (req.headers["x-forwarded-host"] || req.headers.host); } catch (e) { return false; }
}

const wordsOf = (s) => (String(s || "").match(/\S+/g) || []).length;

/** Seconds until the job should be done: the steps left, plus any wait it is in. */
function eta(j) {
  if (["done", "failed", "cancelled"].includes(j.status)) return 0;
  const steps = (j.has_plan ? 0 : 1) + (20 - j.done) + 1;
  const wait = Math.max(0, (Date.parse(j.wait_until) - Date.now()) / 1000);
  return Math.round(wait + steps * STEP_SECONDS + 60);
}

async function create(body) {
  const parts = Array.isArray(body.parts) ? body.parts.map((p) => String(p || "")) : [];
  if (parts.length !== 20) return [400, { error: "The book must come in 20 parts." }];
  const capped = parts.map((p) => (wordsOf(p) > MAX_PART_WORDS ? p.split(/\s+/).slice(0, MAX_PART_WORDS).join(" ") : p));
  const words = capped.reduce((a, p) => a + wordsOf(p), 0);
  if (words < 3000) return [400, { error: "This book is too short to make 20 chapters." }];
  const itemId = String(body.itemId || "").slice(0, 80);
  if (!/^[\w.-]{2,80}$/.test(itemId)) return [400, { error: "Missing book id." }];
  const source = body.source && body.source.kind === "gutenberg" ? { kind: "gutenberg", gid: parseInt(body.source.gid, 10) || 0 } : { kind: "file" };
  const authors = (Array.isArray(body.authors) ? body.authors : []).map((a) => String(a).slice(0, 80)).slice(0, 4);
  const r = await rpc("create", { item_id: itemId, title: String(body.title || "Untitled").slice(0, 120), authors, source, parts: capped, words, allow_lite: !!body.allowLite });
  return [200, { id: r.id }];
}

module.exports = async (req, res) => {
  const ready = !!process.env.GEMINI_API_KEY || process.env.GEMINI_MOCK === "1";
  const q = new URL(req.url, "http://localhost").searchParams;
  try {
    if (req.method === "GET") {
      if (q.get("result")) {
        const r = await rpc("result", { id: q.get("result") });
        if (!r) return send(res, 404, { error: "No such conversion." });
        if (r.status !== "done" || !r.pack) return send(res, 409, { error: "Not finished yet.", status: r.status });
        return send(res, 200, { pack: r.pack });
      }
      if (q.get("ids")) {
        const ids = q.get("ids").split(",").map((s) => s.trim()).filter((s) => /^[\w-]{6,64}$/.test(s)).slice(0, 20);
        const jobs = ids.length ? (await rpc("status", { ids })) || [] : [];
        return send(res, 200, { jobs: jobs.map((j) => ({ ...j, eta: eta(j) })), now: new Date().toISOString() }, { "Cache-Control": "no-store" });
      }
      if (q.get("ping")) await rpc("quota"); // daily Vercel cron: keeps the free Supabase project from pausing
      return send(res, 200, { ready: ready && configured() }, { "Cache-Control": "no-store" });
    }
    if (req.method !== "POST") return send(res, 405, { error: "GET or POST only" }, { Allow: "GET, POST" });
    if (!fromThisSite(req)) return send(res, 403, { error: "Only the Bookreel app can convert books." });
    if (!ready || !configured()) return send(res, 503, { error: "Converting isn’t set up yet." });
    const body = await readJson(req);
    if (body.action === "create") { const [status, out] = await create(body); return send(res, status, out); }
    if (["cancel", "lite", "retry"].includes(body.action)) {
      if (!/^[\w-]{6,64}$/.test(String(body.id || ""))) return send(res, 400, { error: "Missing job id." });
      return send(res, 200, await rpc(body.action, { id: body.id }));
    }
    return send(res, 400, { error: "Unknown action." });
  } catch (e) {
    console.error("jobs", e.message);
    return send(res, e.status || 500, { error: e.message || "Something went wrong." });
  }
};
