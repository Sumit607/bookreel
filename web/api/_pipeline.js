// One step of a cloud conversion: plan the book, write one chapter, or put the pack together.
// The worker calls runStep() with a claimed job and saves the patch it returns.
const { generateJSON } = require("./_gemini.js");
const F = require("./_bookfmt.js");

const MAX_PLAN_WORDS = 60000; // the plan needs the gist of each part, and a smaller request is answered more reliably
const MAX_PART_WORDS = 30000;

function capWords(text, max) {
  const w = String(text || "").split(/\s+/);
  if (w.length <= max) return String(text || "");
  const head = Math.round(max * 0.8);
  return `${w.slice(0, head).join(" ")}\n\n[… part of the middle is left out …]\n\n${w.slice(w.length - (max - head)).join(" ")}`;
}

async function planStep(job, quota, deadline) {
  const parts = Array.isArray(job.parts) ? job.parts.map((p) => String(p || "")) : [];
  if (parts.length !== 20) throw Object.assign(new Error("The book was not cut into 20 parts."), { fatal: true });
  const total = parts.reduce((a, p) => a + F.words(p), 0);
  const trimmed = total > MAX_PLAN_WORDS ? parts.map((p) => capWords(p, Math.floor(MAX_PLAN_WORDS / 20))) : parts;
  const r = await generateJSON({
    tier: "best", allowLite: job.allow_lite, quota, system: F.PLAN_SYSTEM, schema: F.planSchema,
    prompt: F.planPrompt({ title: job.title, authors: job.authors, parts: trimmed }), maxOutputTokens: 20000, temperature: 0.3, timeoutMs: 140000, deadline,
  });
  const plan = F.normalizePlan(r.data, 20);
  if (!plan.characters.length || plan.chapters.filter((c) => !c.summary).length > 4) throw new Error("The plan came back incomplete.");
  return { plan, stage: "write", status: "queued", attempts: 0, models: { plan: r.model }, wait_reason: null, last_error: null };
}

/** Lower is better: problems that break the format count most, then quality notes. */
const score = (got) => got.hard.length * 10 + got.notes.length;

async function writeStep(job, quota, { canRetry, deadline }) {
  const n = job.n;
  const plan = job.plan;
  const ask = plan.loops.find((l) => l.askChapter === n) || null;
  const payoff = plan.loops.find((l) => l.payoffChapter === n) || null;
  const prevCliff = String(job.prev_cliff || "").slice(0, 600);
  const ctx = { n, total: 20, plan: plan.chapters[n - 1], characters: plan.characters, ask, payoff, prevCliff };
  const text = capWords(job.part, MAX_PART_WORDS);
  let best = null, retry = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await generateJSON({
      tier: "best", allowLite: job.allow_lite, quota, system: F.CHAPTER_SYSTEM[plan.kind === "ideas" ? "ideas" : "story"], schema: F.chapterSchema,
      maxOutputTokens: 16384, temperature: 0.6, timeoutMs: 90000, deadline,
      prompt: F.chapterPrompt({ title: job.title, authors: job.authors, plan, n, text, prevCliff, ask, payoff, retry }),
    });
    const got = F.normalizeChapter(r.data, ctx);
    const q = F.qualityNotes(got.chapter, { kind: plan.kind, text });
    Object.assign(got, { notes: q.notes, misquotes: q.misquotes, model: r.model });
    if (!best || score(got) < score(best)) best = got;
    if (!best.hard.length && best.notes.length < 2) break;
    if (!canRetry()) break;
    retry = [...got.hard, ...got.notes];
  }
  const posts = best.chapter.posts;
  if (!(posts.length === 10 && posts[0].type === "hook" && posts[9].type === "cliffhanger")) {
    throw new Error(`Chapter ${n} did not come out right (${best.hard.join("; ")}).`);
  }
  const unquoted = F.unquoteMisquotes(best.chapter, best.misquotes);
  const extras = [...(job.extras || [])];
  for (const c of best.extra) if (!extras.some((x) => x.id === c.id)) extras.push(c);
  const lite = /lite/.test(best.model);
  return {
    chapter: best.chapter, extras: best.extra.length ? extras : undefined, status: "queued", attempts: 0, wait_reason: null, last_error: null,
    note: { n, model: best.model, notes: best.notes, fixed: best.fixed, unquoted },
    models: { write: best.model, ...(lite ? { lite: true } : {}) },
  };
}

function finishStep(job) {
  const chapters = job.chapters || [];
  if (chapters.length !== 20 || chapters.some((c) => !c)) throw new Error("Some chapters are missing.");
  const pack = F.assemblePack({
    itemId: job.item_id, title: job.title, authors: job.authors, source: job.source, plan: job.plan, chapters, extras: job.extras,
    models: { plan: job.models.plan || "", chapters: job.models.write || "", ...(job.models.lite ? { someChaptersLite: true } : {}) },
  });
  return { pack, status: "done", stage: "finish", clear_parts: true, wait_reason: null, last_error: null };
}

/**
 * Runs the job's next step and returns what to save. Failures become a wait (quota, rate limit, busy) or,
 * after repeated errors, a failed job with a plain reason.
 */
async function runStep(job, quota, { canRetry = () => true, deadline = 0 } = {}) {
  try {
    if (job.stage === "plan") return await planStep(job, quota, deadline);
    if (job.stage === "write") return await writeStep(job, quota, { canRetry, deadline });
    return finishStep(job);
  } catch (e) {
    const now = Date.now();
    if (e.status === 429 && e.daily) {
      return { status: "waiting", wait_until: new Date(e.resetAt || now + 3600e3).toISOString(), wait_reason: "quota", last_error: null };
    }
    if (e.status === 429) return { status: "waiting", wait_until: new Date(now + Math.max(5, e.retryAfter || 30) * 1000).toISOString(), wait_reason: "rate" };
    const attempts = (job.attempts || 0) + 1;
    const busy = e.status === 503 || e.status === 504;
    // Google's free tier says "high demand" for minutes or hours at busy times: keep trying, more slowly, for about a day.
    if (e.status === 424 || e.fatal || attempts >= (busy ? 60 : 5)) {
      return { status: "failed", attempts, last_error: e.message || "Conversion failed.", wait_reason: null };
    }
    const delay = busy ? Math.min(600, 60 * 2 ** Math.min(attempts - 1, 4)) : 20 * attempts;
    return { status: "waiting", attempts, wait_until: new Date(now + delay * 1000).toISOString(), wait_reason: busy ? "busy" : "retry", last_error: e.message || "" };
  }
}

module.exports = { runStep, MAX_PART_WORDS };
