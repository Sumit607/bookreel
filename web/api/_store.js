// Where cloud conversion jobs live: the "bookreel" schema in Supabase (see db/bookreel.sql), reached only through
// public.bookreel_rpc with a shared token. BOOKREEL_DB_MOCK=1 (local tests) keeps jobs in memory instead.
const DB_URL = (process.env.BOOKREEL_DB_URL || "").replace(/\/+$/, "");
const DB_KEY = process.env.BOOKREEL_DB_KEY || "";
const TOKEN = process.env.BOOKREEL_TOKEN || "";
const MOCK = process.env.BOOKREEL_DB_MOCK === "1";

const configured = () => MOCK || !!(DB_URL && DB_KEY && TOKEN);

async function rpc(action, args = {}) {
  if (MOCK) return mock(action, JSON.parse(JSON.stringify(args)));
  if (!configured()) throw Object.assign(new Error("Cloud conversion is not set up yet."), { status: 503 });
  const r = await fetch(`${DB_URL}/rest/v1/rpc/bookreel_rpc`, {
    method: "POST",
    headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ p_token: TOKEN, p_action: action, p_args: args }),
  });
  const text = await r.text();
  if (!r.ok) throw Object.assign(new Error(`Job store error ${r.status}: ${text.slice(0, 160)}`), { status: 502 });
  return text ? JSON.parse(text) : null;
}

/** Models whose daily quota is used up, shared by every job, with mark() to add one. */
async function quotaState() {
  const exhausted = {};
  for (const [m, until] of Object.entries((await rpc("quota")) || {})) exhausted[m] = Date.parse(until);
  return {
    exhausted,
    async mark(model, untilMs) {
      exhausted[model] = untilMs;
      await rpc("quota_set", { model, until: new Date(untilMs).toISOString() });
    },
  };
}

// ------------------------------------------------------------------ in-memory stand-in (tests)

const M = { jobs: new Map(), quota: new Map() };
const iso = (ms) => new Date(ms).toISOString();

function mock(action, a) {
  const now = Date.now();
  const active = (j) => ["queued", "working", "waiting"].includes(j.status);
  const p = a.patch || {};
  switch (action) {
    case "create": {
      for (const j of M.jobs.values()) if (j.item_id === a.item_id && active(j)) j.status = "cancelled";
      const id = `job-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      M.jobs.set(id, { id, item_id: a.item_id, title: a.title, authors: a.authors || [], source: a.source || {}, status: "queued", stage: "plan", parts: a.parts,
        words: a.words || 0, plan: null, chapters: Array(20).fill(null), extras: [], notes: [], pack: null, models: {}, allow_lite: !!a.allow_lite, attempts: 0,
        wait_until: now, wait_reason: null, last_error: null, locked_until: 0, created_at: now, updated_at: now, finished_at: null });
      return { id };
    }
    case "status":
      return (a.ids || []).map((id) => M.jobs.get(id)).filter(Boolean).map((j) => {
        const written = j.chapters.filter(Boolean);
        const last = written[written.length - 1];
        return { id: j.id, item_id: j.item_id, title: j.title, status: j.status, stage: j.stage, done: written.length, wait_until: iso(j.wait_until), wait_reason: j.wait_reason,
          last_error: j.last_error, allow_lite: j.allow_lite, models: j.models, has_plan: !!j.plan, created_at: iso(j.created_at), updated_at: iso(j.updated_at),
          finished_at: j.finished_at && iso(j.finished_at), working: j.locked_until > now, last_hook: last ? { ...last.posts[0], n: last.n } : null };
      });
    case "result": { const j = M.jobs.get(a.id); return j ? { id: j.id, item_id: j.item_id, status: j.status, pack: j.pack } : null; }
    case "cancel": { const j = M.jobs.get(a.id); if (j && active(j)) Object.assign(j, { status: "cancelled", locked_until: 0, updated_at: now }); return { ok: true }; }
    case "lite": { const j = M.jobs.get(a.id); if (j && active(j)) Object.assign(j, { allow_lite: true, wait_until: Math.min(j.wait_until, now), wait_reason: null, updated_at: now }); return { ok: true }; }
    case "retry": { const j = M.jobs.get(a.id); if (j && ["failed", "cancelled"].includes(j.status) && j.parts) Object.assign(j, { status: "queued", attempts: 0, last_error: null, wait_until: now, wait_reason: null }); return { ok: true }; }
    case "claim": {
      const j = [...M.jobs.values()].filter((x) => active(x) && x.wait_until <= now && !(x.locked_until > now)).sort((x, y) => x.created_at - y.created_at)[0];
      if (!j) return null;
      Object.assign(j, { locked_until: now + (a.lease || 300) * 1000, status: "working", updated_at: now });
      const base = { id: j.id, item_id: j.item_id, title: j.title, authors: j.authors, source: j.source, allow_lite: j.allow_lite, attempts: j.attempts, models: j.models };
      if (j.stage === "plan") return { ...base, stage: "plan", parts: j.parts };
      if (j.stage === "write") {
        const i = j.chapters.findIndex((c) => !c);
        if (i >= 0) return { ...base, stage: "write", n: i + 1, plan: j.plan, part: j.parts[i], extras: j.extras, prev_cliff: i > 0 ? j.chapters[i - 1].posts[9].text : null };
        j.stage = "finish";
      }
      return { ...base, stage: "finish", plan: j.plan, chapters: j.chapters, extras: j.extras, notes: j.notes, created_at: iso(j.created_at) };
    }
    case "save": {
      const j = M.jobs.get(a.id);
      if (!j || j.status === "cancelled") return { ok: true };
      if (p.plan) j.plan = p.plan;
      if (p.chapter) j.chapters[p.chapter.n - 1] = p.chapter;
      if (p.extras) j.extras = p.extras;
      if (p.note) j.notes.push(p.note);
      if (p.models) Object.assign(j.models, p.models);
      for (const k of ["stage", "status", "attempts", "pack"]) if (p[k] !== undefined) j[k] = p[k];
      if (p.wait_until) j.wait_until = Date.parse(p.wait_until);
      if ("wait_reason" in p) j.wait_reason = p.wait_reason;
      if ("last_error" in p) j.last_error = p.last_error;
      if (p.clear_parts) j.parts = null;
      if (p.status === "done") j.finished_at = now;
      Object.assign(j, { locked_until: 0, updated_at: now });
      return { ok: true };
    }
    case "quota": return Object.fromEntries([...M.quota].filter(([, t]) => t > now).map(([m, t]) => [m, iso(t)]));
    case "quota_set": M.quota.set(a.model, Date.parse(a.until)); return { ok: true };
    default: throw new Error(`unknown action ${action}`);
  }
}

module.exports = { rpc, quotaState, configured, TOKEN: () => (MOCK ? "mock-token" : TOKEN) };
