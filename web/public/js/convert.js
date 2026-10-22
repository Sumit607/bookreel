// Turns a saved book into a Bookreel by calling /api/convert step by step: one plan, then 20 chapters.
// Progress is saved after every chapter, so a closed tab or a used-up free quota just pauses the job; Resume
// picks up at the next chapter. The app subscribes with onJob() to redraw while it runs.
import * as store from "./store.js";

const PALETTE = [
  ["#6B5B3A", "#3A3020", "#F6EBD2"], ["#1F3A3A", "#0E1E1E", "#CFF2E8"], ["#7E1D22", "#3F0C10", "#F6E7D6"], ["#2B2440", "#121018", "#F6C976"],
  ["#59606A", "#2C3440", "#F0ECE4"], ["#A8232C", "#4A0C12", "#FFF3EC"], ["#1A1830", "#0B0A18", "#F6C976"], ["#C9A24A", "#7A5E1F", "#1A1306"],
  ["#22324A", "#0E141C", "#F4A23C"], ["#6E5A2E", "#3E321A", "#FFF1D0"], ["#2E3A30", "#141C16", "#E9F2DF"], ["#8C2F39", "#3F1419", "#FFEDEE"],
  ["#E0A15A", "#9A5B22", "#1E140A"], ["#8FB8DE", "#4E7A5C", "#0F1A14"], ["#5A3E6B", "#2A1D33", "#F4EAF8"], ["#3A2B1F", "#1C140D", "#E9D9C2"],
  ["#1F3B57", "#0E1C2A", "#E6EEF6"], ["#241A1E", "#120D10", "#E2B65A"], ["#2E9C5A", "#14512D", "#06190D"], ["#17191C", "#3A2410", "#F4A23C"],
];
const COVERS = ["#7E1D22", "#173B3F", "#1F3B57", "#6E5A2E", "#2B2440", "#8C2F39", "#2E3A30", "#22324A"];
export const MIN_WORDS = 3000;
const PACE_MS = 4000; // stay under the free tier's requests-per-minute limit
const MAX_WAIT_S = 300; // longer than this means the daily quota is used up: pause instead of waiting

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const wordCount = (t) => (t.match(/\S+/g) || []).length;

// ------------------------------------------------------------------ splitting

const HEAD = /^(chapter|letter|book|part|stave|canto|act|section|volume|epilogue|prologue)\b[\s.:—-]*([ivxlcdm]+|\d+|[a-z]+(-[a-z]+)?)?\b|^[IVXLC]{1,7}\.?$/i;

/** Cuts a book into 20 consecutive parts of similar length, preferring the book's own chapter breaks.
 *  A long preface or introduction (a translator's, say) gets at most 2 of the 20 parts, so it can't crowd out the book. */
export function splitBook(text) {
  // A table of contents (a block of short heading lines) would confuse the cut points and the first hook: drop it.
  const isContents = (block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.length >= 5 && lines.every((l) => l.length <= 70) && lines.filter((l) => HEAD.test(l)).length >= lines.length * 0.6;
  };
  let paras = text.split(/\n\s*\n/).filter((b) => !isContents(b)).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  if (paras.length < 60) {
    // Little paragraph structure (some PDFs): make ~150-word blocks at sentence ends.
    const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?"”’]*\s*/g) || [text];
    paras = [];
    let cur = "";
    for (const s of sentences) { cur += s; if (wordCount(cur) >= 150) { paras.push(cur.trim()); cur = ""; } }
    if (cur.trim()) paras.push(cur.trim());
  }
  const heads = headings(paras);
  const total = paras.reduce((a, p) => a + wordCount(p), 0);
  const firstMain = heads.find((i) => MAIN.test(paras[i]));
  if (firstMain > 0 && paras.slice(0, firstMain).some((p) => p.length <= 90 && FRONT.test(p))) {
    const front = paras.slice(0, firstMain).reduce((a, p) => a + wordCount(p), 0);
    if (front > total * 0.12) {
      return [...cutInto(paras.slice(0, firstMain), 2), ...cutInto(paras.slice(firstMain), 18)];
    }
  }
  return cutInto(paras, 20);
}

/** Main-text chapter headings (not "Preface"), and front-matter headings. */
const MAIN = /^(chapter|book|part|stave|canto|letter)\b[\s.:—-]*(the\s+)?([ivxlcdm]+|\d+|one|first)\b|^[IVXLC]{1,7}\.?(\s|$)/i;
const FRONT = /^(the\s+)?(preface|introduction|introductory|foreword|prefatory|translator|editor|biographical|a note|note on)/i;

/** Indexes of paragraphs that are real headings: short heading-like lines followed by real text (skips a contents list). */
function headings(paras) {
  const wc = paras.map(wordCount);
  const heads = [];
  paras.forEach((p, i) => {
    if (p.length > 90 || !HEAD.test(p)) return;
    let after = 0;
    for (let j = i + 1; j < paras.length && !(paras[j].length <= 90 && HEAD.test(paras[j])); j++) after += wc[j];
    if (after >= 150) heads.push(i);
  });
  return heads;
}

/** Cuts paragraphs into n consecutive parts of similar length, at headings where they fall close to an even cut. */
function cutInto(paras, n) {
  if (n <= 1) return [paras.join("\n\n")];
  if (paras.length < n) {
    const out = paras.slice();
    while (out.length < n) out.push(out[out.length - 1] || "");
    return out;
  }
  const wc = paras.map(wordCount);
  const cum = [0];
  wc.forEach((w, i) => cum.push(cum[i] + w));
  const total = cum[cum.length - 1];
  const size = total / n;
  const heads = headings(paras);
  const best = pickHeads(heads, cum, size, total, n);
  if (best) return [0, ...best, paras.length].slice(0, n + 1).map((c, k, a) => (k < n ? paras.slice(c, a[k + 1]).join("\n\n") : null)).filter((x) => x !== null);
  const cuts = [0];
  for (let k = 1; k < n; k++) {
    const want = k * size;
    const last = cuts[cuts.length - 1];
    const maxIdx = paras.length - (n - k);
    let pick = -1;
    for (const h of heads) if (h > last && h <= maxIdx && Math.abs(cum[h] - want) <= 0.35 * size && (pick < 0 || Math.abs(cum[h] - want) < Math.abs(cum[pick] - want))) pick = h;
    if (pick < 0) {
      pick = last + 1;
      while (pick < maxIdx && cum[pick] < want) pick++;
    }
    cuts.push(Math.min(Math.max(pick, last + 1), maxIdx));
  }
  cuts.push(paras.length);
  const parts = [];
  for (let k = 0; k < n; k++) parts.push(paras.slice(cuts[k], cuts[k + 1]).join("\n\n"));
  return parts;
}

/** With n-1 or more real chapter headings, choose the n-1 that cut the text into the most even parts (dynamic programming). */
function pickHeads(heads, cum, size, total, n = 20) {
  const H = heads.filter((h) => h > 0);
  const m = H.length;
  const cutsWanted = n - 1;
  if (m < cutsWanted) return null;
  const sq = (x) => x * x;
  let prev = H.map((h) => sq(cum[h] - size));
  const back = [new Array(m).fill(-1)];
  for (let k = 2; k <= cutsWanted; k++) {
    const cur = new Array(m).fill(Infinity), bk = new Array(m).fill(-1);
    let best = Infinity, bestIdx = -1;
    for (let j = 0; j < m; j++) {
      if (j > 0 && prev[j - 1] < best) { best = prev[j - 1]; bestIdx = j - 1; }
      if (bestIdx >= 0 && best < Infinity) { cur[j] = best + sq(cum[H[j]] - k * size); bk[j] = bestIdx; }
    }
    back.push(bk);
    prev = cur;
  }
  let j = -1, min = Infinity;
  prev.forEach((c, i) => { const v = c + sq(total - cum[H[i]] - size); if (v < min) { min = v; j = i; } });
  if (j < 0) return null;
  const cuts = [];
  for (let k = cutsWanted; k >= 1; k--) { cuts.unshift(H[j]); j = back[k - 1][j]; }
  return cuts;
}

// ------------------------------------------------------------------ job

let job = null;
const listeners = new Set();
export const currentJob = () => job;
export function onJob(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => { try { fn(job); } catch (e) { /* a listener failed; keep going */ } }); }

class Stop extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(seconds) {
  job.waitUntil = Date.now() + seconds * 1000;
  emit();
  while (Date.now() < job.waitUntil) {
    if (job.cancelled) throw new Stop("cancelled");
    await sleep(1000);
    emit(); // lets the screen count down
  }
  job.waitUntil = 0;
  emit();
}

/** Local clock time of the next midnight in California, when Gemini's free daily quota resets (12:30 or 1:30 pm in India). */
export function quotaResetTime(from = new Date()) {
  const hourInLA = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" });
  let t = Math.ceil(from.getTime() / 3600000) * 3600000;
  for (let i = 0; i < 26 && +hourInLA.format(new Date(t)) !== 0; i++) t += 3600000;
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function call(body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (job.cancelled) throw new Stop("cancelled");
    let r;
    try {
      r = await fetch("/api/convert", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      await waitFor(5 * (attempt + 1));
      continue;
    }
    if (r.ok) return r.json();
    const data = await r.json().catch(() => ({}));
    if (r.status === 403 || r.status === 424 || (r.status === 503 && /not set up|missing/i.test(data.error || ""))) throw new Error(data.error);
    if ([429, 500, 502, 503, 504].includes(r.status)) {
      const s = data.retryAfter || 10 * (attempt + 1);
      if (r.status === 429 && s > MAX_WAIT_S) throw new Stop("quota");
      await waitFor(Math.min(s + 1, MAX_WAIT_S));
      continue;
    }
    throw new Error(data.error || `The server said ${r.status}.`);
  }
  throw new Error("Gemini kept refusing. Try again later.");
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request("screen");
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && job && job.running) keepAwake(true); });

/** Starts or resumes converting a saved item. Resolves when it finishes, pauses or fails. */
export async function start(id) {
  if (job && job.running) return;
  const item = await store.getItem(id);
  const text = await store.getText(id);
  if (!item || !text) throw new Error("This book is no longer saved on this phone.");
  const parts = splitBook(text);
  item.status = "converting";
  item.convert = item.convert || { chapters: [], extras: [] };
  item.convert.error = "";
  await store.putItem(item);
  const done = item.convert.chapters.filter(Boolean).length;
  job = { id, running: true, cancelled: false, stage: item.convert.plan ? "write" : "plan", n: done, total: 20, waitUntil: 0, error: "", lastHook: null, startedAt: Date.now(), chapterMs: [] };
  emit();
  keepAwake(true);
  const meta = { title: item.title, authors: item.authors };
  try {
    if (!item.convert.plan) {
      const r = await call({ step: "plan", ...meta, parts });
      item.convert.plan = r.plan;
      item.convert.planModel = r.model;
      await store.putItem(item);
    }
    for (let n = 1; n <= 20; n++) {
      if (item.convert.chapters[n - 1]) continue;
      job.stage = "write"; job.n = n - 1; emit();
      const t0 = Date.now();
      const prev = item.convert.chapters[n - 2];
      const r = await call({ step: "chapter", n, ...meta, plan: item.convert.plan, text: parts[n - 1], prevCliff: prev ? prev.posts[prev.posts.length - 1].text : "" });
      item.convert.chapters[n - 1] = r.chapter;
      for (const c of r.extraCharacters || []) if (!item.convert.extras.some((x) => x.id === c.id)) item.convert.extras.push(c);
      item.convert.model = r.model;
      await store.putItem(item);
      job.n = n; job.lastHook = { n, ...r.chapter.posts[0] }; job.chapterMs.push(Date.now() - t0); emit();
      if (n < 20) await sleep(PACE_MS);
      if (job.cancelled) throw new Stop("cancelled");
    }
    job.stage = "check"; emit();
    const pack = assemble(item);
    await store.putPack(id, pack);
    item.status = "ready";
    item.readyAt = Date.now();
    await store.putItem(item);
    job.stage = "done";
  } catch (e) {
    item.status = "paused";
    const reason = e instanceof Stop ? e.message : "error";
    item.convert.error = reason === "cancelled" ? "" : reason === "quota" ? `Today’s free Gemini quota is used up. Resume after ${quotaResetTime()}, when it resets.`
      : e.message || "Something went wrong.";
    await store.putItem(item);
    job.stage = reason === "cancelled" ? "paused" : "error";
    job.error = item.convert.error;
    job.reason = reason;
  } finally {
    job.running = false;
    keepAwake(false);
    emit();
  }
}

export function cancel() { if (job && job.running) { job.cancelled = true; emit(); } }

/** Seconds left, estimated from the chapters written so far (or a typical pace before the first one lands). */
export function etaSeconds() {
  if (!job || !job.running) return 0;
  const per = job.chapterMs.length ? job.chapterMs.reduce((a, b) => a + b, 0) / job.chapterMs.length + PACE_MS : 25000;
  const left = 20 - job.n + (job.stage === "plan" ? 1 : 0);
  return Math.round((left * per) / 1000);
}

// ------------------------------------------------------------------ assembling the pack

/** Builds the finished book pack from the plan and the 20 chapters, and drops guess loops that never paid off. */
export function assemble(item) {
  const plan = item.convert.plan;
  const offset = hash(item.id) % PALETTE.length;
  const chapters = item.convert.chapters.map((c, i) => {
    const [bg, bg2, fg] = PALETTE[(i + offset) % PALETTE.length];
    return { n: i + 1, title: c.title, hook: c.hook, bg, bg2, fg, minutes: 3, recap: c.recap, posts: c.posts.map((p) => ({ ...p })) };
  });
  const payoffAt = new Map();
  chapters.forEach((c) => c.posts.forEach((p) => { if (p.type === "idea" && p.payoffLoopId) payoffAt.set(p.payoffLoopId, c.n); }));
  const askAt = new Map();
  chapters.forEach((c) => c.posts.forEach((p) => {
    if (p.type !== "guess") return;
    if ((payoffAt.get(p.loopId) || 0) > c.n && !askAt.has(p.loopId)) { askAt.set(p.loopId, c.n); return; }
    p.type = "poll"; delete p.loopId; p.hint = "Pick one to see what actually happened.";
  }));
  chapters.forEach((c) => c.posts.forEach((p) => { if (p.type === "idea" && p.payoffLoopId && !((askAt.get(p.payoffLoopId) || 99) < c.n)) delete p.payoffLoopId; }));
  const characters = [...plan.characters];
  for (const x of item.convert.extras || []) if (!characters.some((c) => c.id === x.id)) characters.push(x);
  return {
    schemaVersion: 1, id: item.id, packVersion: 1, title: item.title, authors: item.authors, category: plan.category, blurb: plan.blurb,
    ...(plan.narrator ? { narrator: plan.narrator } : {}),
    rights: item.source === "gutenberg" ? { status: "public-domain", source: `Project Gutenberg #${item.gid}` } : { status: "personal", source: "Your own file, kept on this phone" },
    madeWith: { plan: item.convert.planModel || "", chapters: item.convert.model || "", at: Date.now() },
    characters, chapters,
  };
}

/** The library card for a finished Bookreel. */
export function metaFor(item, pack) {
  const motif = { Mystery: "lens", Horror: "bolt", Romance: "diamond", Philosophy: "sun", History: "sun", "Sci-fi": "bolt" }[pack.category] || "";
  const bg = COVERS[hash(item.id) % COVERS.length];
  return {
    id: item.id, title: item.title, authors: item.authors.length ? item.authors : ["Unknown"], category: pack.category || "Classic", blurb: pack.blurb || "",
    hook: pack.chapters[0].hook, status: "ready", minutes: 60, cover: { bg, fg: "#F6E7D6", motif, tag: "Yours" }, access: "local", source: item.source,
  };
}

export const coverColor = (key) => COVERS[hash(String(key)) % COVERS.length];
