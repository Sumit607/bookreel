// Turns a saved book into a Bookreel in the cloud: the app cuts the book into 20 parts and sends them to /api/jobs;
// Supabase and the Vercel worker write the chapters while the app is closed; the app collects the finished pack.
// The app subscribes with onJob() to redraw while a job runs, and onReady() when a Bookreel arrives.
import * as store from "./store.js";

const COVERS = ["#7E1D22", "#173B3F", "#1F3B57", "#6E5A2E", "#2B2440", "#8C2F39", "#2E3A30", "#22324A"];
export const MIN_WORDS = 3000;

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const wordCount = (t) => (t.match(/\S+/g) || []).length;

// ------------------------------------------------------------------ splitting

const ORD = "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth";
const HEAD = new RegExp(`^(chapter|letter|book|part|stave|canto|act|section|volume|epilogue|prologue)\\b[\\s.:—-]*([ivxlcdm]+|\\d+|[a-z]+(-[a-z]+)?)?\\b|^[IVXLC]{1,7}\\.?$|^(the\\s+)?(${ORD})\\s+(book|part|chapter|letter|canto|act|volume)\\b`, "i");

/** Cuts a book into 20 consecutive parts of similar length, preferring the book's own chapter breaks.
 *  An introduction (a translator's, say) gets 1 part, or 2 when it is long, so it can't crowd out the book, and
 *  back matter (appendix, glossary, notes, index) is left out. */
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
  paras = withoutBackMatter(withoutContentsList(paras));
  const heads = headings(paras);
  const total = paras.reduce((a, p) => a + wordCount(p), 0);
  const firstMain = heads.find((i) => MAIN.test(paras[i]));
  if (firstMain > 0 && paras.slice(0, firstMain).some((p) => p.length <= 90 && FRONT.test(p))) {
    const front = paras.slice(0, firstMain).reduce((a, p) => a + wordCount(p), 0);
    const n = front > total * 0.12 ? 2 : front >= total * 0.025 ? 1 : 0;
    if (n) return [...cutInto(paras.slice(0, firstMain), n), ...cutInto(paras.slice(firstMain), 20 - n)];
  }
  return cutInto(paras, 20);
}

/** Drops a contents list written as one short line per paragraph near the start (6 or more in a row). */
function withoutContentsList(paras) {
  for (let i = 0; i < Math.min(paras.length, 80); i++) {
    let j = i;
    while (j < paras.length && paras[j].length <= 40 && !/[.!?]$/.test(paras[j])) j++;
    if (j - i >= 6) return [...paras.slice(0, i), ...paras.slice(j - 1)]; // the run's last line heads what follows
  }
  return paras;
}

/** Drops an appendix, glossary, notes or index at the end: it would take whole chapters and has no story or ideas. */
function withoutBackMatter(paras) {
  const wc = paras.map(wordCount);
  const total = wc.reduce((a, b) => a + b, 0);
  let before = 0;
  for (let i = 0; i < paras.length; i++) {
    if (before >= total * 0.6 && paras[i].length <= 60 && BACK.test(paras[i])) {
      const after = total - before;
      if (after >= 100 && after <= total * 0.35) return paras.slice(0, i);
    }
    before += wc[i];
  }
  return paras;
}

/** Main-text chapter headings (not "Preface"), and front-matter headings. */
const MAIN = /^(chapter|book|part|stave|canto|letter)\b[\s.:—-]*(the\s+)?([ivxlcdm]+|\d+|one|first)\b|^[IVXLC]{1,7}\.?(\s|$)|^(the\s+)?first\s+(book|part|chapter|letter|canto)\b/i;
const BACK = /^(the\s+)?(appendix|appendices|glossary|index|notes|endnotes|footnotes|bibliography|transcriber'?s? notes?)\b/i;
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

// ------------------------------------------------------------------ cloud jobs

// The book goes to the cloud once, in 20 parts; the worker writes it there while the app is closed, and the app
// collects the finished Bookreel the next time it looks. statuses: item id → the server's status of its job.
const statuses = new Map();
const listeners = new Set();
const readyHandlers = new Set();
let pollTimer = 0;
const POLL_MS = 5000;

export const statusOf = (itemId) => statuses.get(itemId) || null;
export function onJob(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** fn(item, pack) when a Bookreel has been collected from the cloud. */
export function onReady(fn) { readyHandlers.add(fn); return () => readyHandlers.delete(fn); }
function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { /* a listener failed; keep going */ } }); }

/** Local clock time of the next midnight in California, when Gemini's free daily quota resets (12:30 or 1:30 pm in India). */
export function quotaResetTime(from = new Date()) {
  const hourInLA = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23" });
  let t = Math.ceil(from.getTime() / 3600000) * 3600000;
  for (let i = 0; i < 26 && +hourInLA.format(new Date(t)) !== 0; i++) t += 3600000;
  return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function api(body) {
  const r = await fetch("/api/jobs", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `The server said ${r.status}.`);
  return data;
}

export const isActive = (st) => !!st && ["queued", "working", "waiting"].includes(st.status);

/** Sends a saved book to the cloud converter. A book that is already a Bookreel keeps it until the new one is ready. */
export async function start(id, { allowLite = false } = {}) {
  const item = await store.getItem(id);
  const text = await store.getText(id);
  if (!item || !text) throw new Error("This book is no longer saved on this phone.");
  const parts = splitBook(text);
  const source = item.source === "gutenberg" ? { kind: "gutenberg", gid: item.gid } : { kind: "file" };
  const r = await api({ action: "create", itemId: id, title: item.title, authors: item.authors || [], source, parts, allowLite });
  const remaking = item.status === "ready";
  item.job = { id: r.id, startedAt: Date.now() };
  item.remaking = remaking;
  if (!remaking) item.status = "converting";
  delete item.convert; // progress from the old in-app converter
  await store.putItem(item);
  statuses.set(id, { id: r.id, item_id: id, status: "queued", stage: "plan", done: 0, has_plan: false, eta: 21 * 40 + 60, wait_until: new Date().toISOString() });
  emit();
  poll(1500);
}

async function forJob(id) {
  const item = await store.getItem(id);
  if (!item || !item.job) throw new Error("This book is not converting.");
  return item;
}

/** Stops the cloud job. Chapters already written are dropped; a remake leaves the old Bookreel in place. */
export async function cancel(id) {
  const item = await forJob(id);
  await api({ action: "cancel", id: item.job.id }).catch(() => {});
  delete item.job;
  item.remaking = false;
  if (item.status !== "ready") item.status = "saved";
  await store.putItem(item);
  statuses.delete(id);
  emit();
}

/** Stop waiting for the better model's daily quota and finish with Flash-Lite. */
export async function finishWithLite(id) {
  const item = await forJob(id);
  await api({ action: "lite", id: item.job.id });
  const st = statuses.get(id);
  if (st) Object.assign(st, { status: "queued", wait_reason: null, allow_lite: true, wait_until: new Date().toISOString() });
  emit();
  poll(1500);
}

export async function retry(id) {
  const item = await forJob(id);
  await api({ action: "retry", id: item.job.id });
  poll(1500);
}

/** Checks every converting book; collects finished ones. Polls while something is converting and the app is visible. */
export function poll(delay = 0) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(checkNow, delay);
}

async function checkNow() {
  let items = [];
  try { items = (await store.allItems()).filter((i) => i.job && i.job.id); } catch (e) { return; }
  if (!items.length) return;
  try {
    const r = await fetch(`/api/jobs?ids=${items.map((i) => i.job.id).join(",")}`, { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const { jobs } = await r.json();
    const byJob = new Map(jobs.map((j) => [j.id, j]));
    for (const item of items) {
      const j = byJob.get(item.job.id);
      if (!j) continue;
      statuses.set(item.id, j);
      if (j.status === "done") await collect(item, j);
    }
  } catch (e) { /* offline or the server is busy: try again later */ }
  emit();
  if ([...statuses.values()].some(isActive) && (typeof document === "undefined" || document.visibilityState === "visible")) poll(POLL_MS);
}

async function collect(item, j) {
  const r = await fetch(`/api/jobs?result=${encodeURIComponent(j.id)}`, { credentials: "same-origin", cache: "no-store" });
  if (!r.ok) return;
  const { pack } = await r.json();
  if (!pack || !Array.isArray(pack.chapters) || pack.chapters.length !== 20) return;
  pack.id = item.id;
  await store.putPack(item.id, pack);
  item.status = "ready";
  item.readyAt = Date.now();
  item.madeWith = pack.madeWith || null;
  item.remaking = false;
  delete item.job;
  await store.putItem(item);
  statuses.set(item.id, { ...j, status: "collected" });
  readyHandlers.forEach((fn) => { try { fn(item, pack); } catch (e) { /* keep going */ } });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") poll(300); });
  addEventListener("bookreel-resume", () => poll(300));
}

/** Seconds until the converting book should be ready (from the server's estimate). */
export function etaSeconds(id) {
  const st = statuses.get(id);
  if (!isActive(st)) return 0;
  return st.eta || 0;
}

/** A Bookreel made before the cloud writer (on the phone, with Flash-Lite): worth making again. */
export function madeWithOldWriter(item, pack) {
  const m = (pack && pack.madeWith) || item.madeWith || {};
  return !(pack && pack.packVersion >= 2) || !!m.someChaptersLite || /lite/.test(String(m.chapters || ""));
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
