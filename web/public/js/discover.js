// Discover: search Project Gutenberg's free books, download them to this phone, add your own PDF or text file,
// and turn any of them into a Bookreel. Screens: #/discover, #/gb/<gutenberg id>, #/mine/<item id>, #/convert/<item id>.
import * as store from "./store.js";
import * as C from "./convert.js";
import { esc, icon, compactCount } from "./util.js";

let app = null; // callbacks from app.js, set by init()
const up = (s) => esc(String(s ?? "").toUpperCase());

const TOPICS = [["", "Popular"], ["mystery", "Mystery"], ["adventure", "Adventure"], ["romance", "Romance"], ["scifi", "Sci-fi"], ["horror", "Horror"], ["philosophy", "Philosophy"], ["children", "Children"], ["history", "History"]];
const cat = { key: null, loading: false, error: "", books: [], page: 1, next: null, count: 0 };
const known = new Map(); // Gutenberg id → catalogue entry
let q = "";
let topic = "";
let items = new Map(); // item id → saved item
let status = { ready: null };
const downloading = new Set();
let searchTimer = 0;

export const pgId = (gid) => `pg-${gid}`;

export async function init(ctx) {
  app = ctx;
  C.onJob(() => {
    refreshItems().then(() => {
      syncNotices();
      const r = app.route().name;
      if (r === "discover") refreshResults();
      else if (["convert", "gb", "mine", "library"].includes(r) && !app.sheet()) app.render();
    });
  });
  C.onReady(async (item) => {
    await refreshItems();
    await addToLibrary(items.get(item.id) || item);
    native("cancelRelease", noticeKey(item.id));
    notified.delete(item.id);
    app.toast(`Your Bookreel of ${item.title} is ready`);
    if (!app.sheet()) app.render();
  });
  await refreshItems();
  // Finished Bookreels join the library like any other book.
  for (const item of items.values()) if (item.status === "ready") await addToLibrary(item);
  C.poll(0); // collect anything the cloud finished while the app was closed
}

const native = (...a) => (app && app.native ? app.native(...a) : undefined);
const noticeKey = (id) => `convert-${id}`;
const notified = new Map(); // item id → when its "ready" notification is set for

/** In the Android app: a notification when a cloud conversion should be done, moved when the estimate moves. */
function syncNotices() {
  for (const item of items.values()) {
    const st = C.statusOf(item.id);
    if (C.isActive(st)) {
      const at = Date.now() + (st.eta || 600) * 1000 + 2 * 60000;
      const prev = notified.get(item.id);
      if (prev && Math.abs(prev - at) < 5 * 60000) continue;
      notified.set(item.id, at);
      native("scheduleRelease", noticeKey(item.id), String(at), `${item.title}: your Bookreel should be ready`, "Tap to open it in Bookreel.", `#/convert/${item.id}`);
    } else if (notified.has(item.id) && st && st.status !== "collected") {
      native("cancelRelease", noticeKey(item.id));
      notified.delete(item.id);
    }
  }
}

async function refreshItems() {
  try { items = new Map((await store.allItems()).map((i) => [i.id, i])); } catch (e) { /* storage unavailable */ }
}

async function addToLibrary(item) {
  const pack = await store.getPack(item.id);
  if (!pack) return;
  app.BOOKS[item.id] = pack;
  const meta = C.metaFor(item, pack);
  const list = app.INDEX().books;
  const i = list.findIndex((b) => b.id === item.id);
  if (i >= 0) list[i] = meta; else list.push(meta);
}

async function loadStatus() {
  try { status = await (await fetch("/api/jobs", { credentials: "same-origin", cache: "no-store" })).json(); } catch (e) { status = { ready: null }; }
  return status;
}

// ------------------------------------------------------------------ catalogue

async function loadCatalog(more = false) {
  const key = `${q}|${topic}`;
  if (cat.loading) return;
  if (!more && cat.key === key && !cat.error) return;
  if (!more) Object.assign(cat, { key, books: [], page: 1, next: null, count: 0 });
  cat.loading = true; cat.error = "";
  refreshResults();
  try {
    const page = more ? cat.next : 1;
    const params = new URLSearchParams({ q, topic, page: String(page || 1) });
    const r = await fetch(`/api/catalog?${params}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "The catalogue did not answer.");
    if (cat.key !== key) return;
    data.books.forEach((b) => known.set(b.id, b));
    cat.books = more ? [...cat.books, ...data.books] : data.books;
    cat.next = data.next; cat.count = data.count; cat.page = page || 1;
  } catch (e) {
    cat.error = navigator.onLine === false ? "You’re offline. Your downloaded books are in the Library." : e.message || "Something went wrong.";
  } finally {
    cat.loading = false;
    refreshResults();
  }
}

function author(b) {
  const a = b.authors && b.authors[0];
  return a ? a.name : "Unknown author";
}

function drawnCover(title, key, extra = "") {
  return `<span class="dcover" style="background:${C.coverColor(key)}"><span class="dcover-t">${up(title.split(/[;:]/)[0])}</span>${extra}</span>`;
}

function badgeFor(id) {
  const item = items.get(id);
  const st = C.statusOf(id);
  if (C.isActive(st)) return `<span class="dbadge busy">${st.done} / 20</span>`;
  if (!item) return "";
  if (item.status === "ready") return `<span class="dbadge ready">BOOKREEL</span>`;
  return `<span class="dbadge">SAVED</span>`;
}

// ------------------------------------------------------------------ screens

function results() {
  const cards = cat.books.map((b) => `<button class="dcard" data-act="gb" data-gid="${b.id}">
      ${drawnCover(b.title, b.id, `${b.cover ? `<img src="${esc(b.cover)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}${badgeFor(pgId(b.id))}`)}
      <span class="dtitle">${esc(b.title.split(/[;:]/)[0])}</span><span class="dauthor">${esc(author(b))}</span></button>`).join("");
  const body = cat.error
    ? `<div class="empty">${icon("info", { size: 36 })}<p>${esc(cat.error)}</p><button class="btn secondary" data-act="cat-retry">Try again</button></div>`
    : `<div class="dgrid">${cards}${cat.loading ? `<span class="dskel"></span>`.repeat(cat.books.length ? 3 : 9) : ""}</div>
       ${!cat.loading && !cat.books.length ? `<p class="muted center" style="padding:24px 0">No free books match “${esc(q)}”.</p>` : ""}
       ${cat.next && !cat.loading ? `<button class="btn secondary wide" data-act="cat-more" style="margin-top:16px">Show more</button>` : ""}`;
  const heading = q ? `RESULTS FOR “${up(q)}”` : topic ? up(TOPICS.find((t) => t[0] === topic)[1]) : "MOST DOWNLOADED";
  return `<div class="row-h"><h2>${heading}</h2><span>${cat.count && !cat.loading ? `${compactCount(cat.count)} books` : ""}</span></div>${body}`;
}

function refreshResults() {
  const el = document.getElementById("dres");
  if (el) el.innerHTML = results();
  else if (["gb", "mine", "convert", "library"].includes(app.route().name)) app.render();
}

export function discoverScreen() {
  if (cat.key !== `${q}|${topic}` && !cat.loading) setTimeout(() => loadCatalog(), 0);
  return `<div class="pad16 disc">
    <header class="disc-head"><div><div class="lbl muted">Free books</div><h1 class="big">DISCOVER</h1></div>
      <button class="pill-btn" data-act="pick-file">${icon("file", { size: 17 })}<span>Add a PDF</span></button>
      <input id="filepick" type="file" accept=".pdf,.txt,application/pdf,text/plain" hidden></header>
    <p class="disc-sub">75,000+ free books from Project Gutenberg. Download any of them, then make it a Bookreel.</p>
    <label class="search">${icon("search", { size: 18 })}<input id="dq" type="search" placeholder="Search a title or an author" value="${esc(q)}" autocomplete="off" enterkeyhint="search"></label>
    <div class="chips" role="tablist">${TOPICS.map(([k, l]) => `<button class="chip${k === topic && !q ? " on" : ""}" data-act="topic" data-topic="${k}" role="tab" aria-selected="${k === topic && !q}">${l}</button>`).join("")}</div>
    <div id="dres">${results()}</div>
    <p class="fine">Books come from Project Gutenberg, free and in the public domain in the US. Downloads stay on this phone.</p>
  </div>`;
}

/** Book page for a Gutenberg book, from the catalogue (or the saved copy when offline). */
export function gbScreen(gid) {
  const b = known.get(+gid);
  const item = items.get(pgId(gid));
  if (!b && !item) {
    setTimeout(() => fetchOne(gid), 0);
    return `<div class="pad16"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon("back")}</button><span>Project Gutenberg #${esc(gid)}</span></div><div class="center muted" style="padding:48px 0">Loading…</div></div>`;
  }
  if (b && !b.detail && !detailAsked.has(+gid)) setTimeout(() => fetchOne(gid), 0);
  const title = (b ? b.title : item.title).split(/[;:]/)[0];
  const a = b ? b.authors[0] : null;
  const yr = (n) => (n == null ? "" : n < 0 ? `${-n} BC` : String(n));
  const years = a && (a.birth != null || a.death != null) ? ` · ${yr(a.birth) || "?"}–${yr(a.death)}` : "";
  const subjects = (b && b.subjects.length ? b.subjects : item?.subjects) || [];
  const coverUrl = b ? b.cover : item.cover;
  const dl = b && b.downloads ? `<div><span>LAST 30 DAYS</span><b>${compactCount(b.downloads)} downloads</b></div>` : `<div><span>PRICE</span><b>Free</b></div>`;
  return `<div class="pad16 gb">
    <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon("back")}</button><span class="lbl muted">Project Gutenberg #${esc(gid)}</span></div>
    <div class="gb-cover">${drawnCover(title, +gid, coverUrl ? `<img src="${esc(coverUrl)}" alt="" onerror="this.remove()">` : "")}</div>
    <h1 class="gb-t hl">${up(title)}</h1>
    <div class="muted center">${esc(a ? a.name : (item?.authors[0] || "Unknown author"))}${esc(years)}</div>
    ${subjects.length ? `<div class="gb-subj">${subjects.map((s) => `<span>${esc(s)}</span>`).join("")}</div>` : ""}
    <div class="gb-facts"><div><span>LANGUAGE</span><b>${!b || b.languages.includes("en") ? "English" : esc(b.languages[0])}</b></div>
      <div><span>RIGHTS</span><b>Public domain</b></div>${b ? dl : `<div><span>SAVED</span><b>On this phone</b></div>`}</div>
    ${actions(pgId(gid), { gid: +gid, title, book: b })}
    ${b && b.summary ? `<div class="gb-sum"><div class="lbl muted">ABOUT THIS BOOK</div><p>${esc(b.summary)}</p><span class="fine">Summary from Project Gutenberg.</span></div>` : ""}
  </div>`;
}

/** Page for the reader's own file. */
export function mineScreen(id) {
  const item = items.get(id);
  if (!item) return `<div class="pad16"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon("back")}</button><span>Your file</span></div><div class="center muted" style="padding:48px 0">This file is no longer on this phone.</div></div>`;
  return `<div class="pad16 gb">
    <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon("back")}</button><span class="lbl muted">Your own file</span></div>
    <div class="gb-cover">${drawnCover(item.title, item.id, `<span class="dbadge file">${esc((item.fileType || "PDF").toUpperCase())}</span>`)}</div>
    <h1 class="gb-t hl">${up(item.title)}</h1>
    <div class="muted center">${esc(item.authors[0] || item.fileName || "")}</div>
    <div class="gb-facts"><div><span>WORDS</span><b>${compactCount(item.words)}</b></div><div><span>KEPT</span><b>On this phone</b></div><div><span>SHARED</span><b>Never</b></div></div>
    ${actions(id, { title: item.title })}
  </div>`;
}

function actions(id, { gid, title }) {
  const item = items.get(id);
  const st = C.statusOf(id);
  if (downloading.has(id)) return `<button class="btn primary wide" disabled>${icon("download", { size: 18 })} Downloading…</button>`;
  if (!item) {
    return `<button class="btn primary wide big-btn" data-act="download" data-gid="${gid}">${icon("download", { size: 20 })} DOWNLOAD FREE</button>
      <p class="gb-note">Saved on this phone and readable offline. Then you can make it a Bookreel: 20 chapters, 10 posts each.</p>`;
  }
  const saved = `<div class="gb-saved">${icon("check", { size: 15 })} Saved on this phone · ${compactCount(item.words)} words</div>`;
  const remove = `<button class="link-btn danger" data-act="remove" data-id="${id}">Remove from this phone</button>`;
  const converting = C.isActive(st) || (item.job && !st);
  if (item.status === "ready") {
    const remake = converting
      ? `<button class="link-btn" data-act="view-convert" data-id="${id}">${icon("clock", { size: 16 })} Remaking in the cloud · ${st ? st.done : 0} of 20</button>`
      : C.madeWithOldWriter(item, app.BOOKS[id]) ? `<button class="link-btn" data-act="convert" data-id="${id}">${icon("compass", { size: 16 })} Make it again with the better writer</button>` : "";
    return `${saved}<button class="btn primary wide big-btn" data-act="open-book" data-id="${id}">READ THE BOOKREEL</button>${remake}${remove}`;
  }
  if (converting) return `${saved}<button class="btn primary wide big-btn" data-act="view-convert" data-id="${id}">CONVERTING · ${st ? st.done : 0} OF 20</button>`;
  if (st && st.status === "failed") {
    return `${saved}<div class="gb-err">${esc(st.last_error || "The conversion stopped.")}</div>
      <button class="btn primary wide big-btn" data-act="convert-retry" data-id="${id}">TRY AGAIN</button>${remove}`;
  }
  return `${saved}<button class="btn primary wide big-btn" data-act="convert" data-id="${id}">MAKE IT A BOOKREEL</button>${remove}`;
}

// ------------------------------------------------------------------ converting screen

export function convertScreen(id) {
  const item = items.get(id);
  if (!item) return `<div class="pad16"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon("back")}</button></div><div class="center muted" style="padding:48px 0">This book is no longer on this phone.</div></div>`;
  const st = C.statusOf(id);
  const active = C.isActive(st) || (!!item.job && !st);
  if (item.status === "ready" && app.BOOKS[id] && !active) return readyView(item);
  const n = st ? st.done : 0;
  const hasPlan = !!(st && st.has_plan);
  const failed = st && st.status === "failed";
  const step = (state, num, title, sub) => `<li class="st ${state}"><span class="st-dot">${state === "done" ? icon("check", { size: 14 }) : num}</span><span class="st-m"><b>${title}</b>${sub ? `<span>${sub}</span>` : ""}</span></li>`;
  const planState = hasPlan ? "done" : active ? "now" : "todo";
  const writeState = n >= 20 ? "done" : hasPlan && active ? "now" : "todo";
  const checkState = st && (st.status === "collected" || st.status === "done") ? "done" : n >= 20 && active ? "now" : "todo";
  const hook = st && st.last_hook ? st.last_hook : null;
  const waitMs = st && st.status === "waiting" ? Date.parse(st.wait_until) - Date.now() : 0;
  const mins = Math.max(1, Math.round(C.etaSeconds(id) / 60));
  const where = native("version") ? "You can close Bookreel: it carries on in the cloud and tells you when it’s ready." : "You can close Bookreel: it carries on in the cloud. Open the app later to collect it.";
  let foot = "", extra = "";
  if (!st && item.job) foot = `${icon("clock", { size: 16 })} Checking on it…`;
  else if (failed) { foot = `<span class="err">${esc(st.last_error || "The conversion stopped.")}</span>`; extra = `<button class="btn primary wide" data-act="convert-retry" data-id="${id}">Try again</button>`; }
  else if (st && st.status === "waiting" && st.wait_reason === "quota" && waitMs > 0) {
    foot = `${icon("clock", { size: 16 })} Paused: today’s free quota for Gemini’s best writer is used up. It resets at ${esc(new Date(st.wait_until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))} and the conversion carries on by itself.`;
    extra = `<button class="btn secondary wide" data-act="convert-lite" data-id="${id}">Finish now with Flash-Lite (simpler writing)</button>`;
  } else if (st && st.status === "waiting" && waitMs > 0) foot = `${icon("clock", { size: 16 })} A short pause for Gemini’s limits, then it carries on. ${where}`;
  else if (active) foot = `${icon("clock", { size: 16 })} About ${mins} minute${mins === 1 ? "" : "s"} left. ${where}`;
  else foot = "Not started yet.";
  const title = item.status === "ready" ? "MAKING IT AGAIN" : active ? "CONVERTING IN THE CLOUD" : failed ? "STOPPED" : "READY TO CONVERT";
  return `<div class="pad16 conv">
    <div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon("back")}</button><span class="lbl muted">${active ? "Converting" : "Make it a Bookreel"}</span></div>
    <div class="conv-head">${drawnCover(item.title, item.gid || item.id)}<div><div class="lbl conv-k">${title}</div><h1 class="conv-t hl">${up(item.title)}</h1></div></div>
    <ol class="steps">
      ${step("done", 1, "Read the whole book", `${compactCount(item.words)} words`)}
      ${step(planState, 2, "Plan 20 chapters", hasPlan ? "Done" : active ? "Reading it through…" : "")}
      ${step(writeState, 3, "Write the posts", `${n} of 20 chapters`)}
      ${step(checkState, 4, "Check every post", "Quotes against the text, length, order, the 20 × 10 rules")}
      ${step(st && st.status === "collected" ? "done" : "todo", 5, "Ready to read", "")}
    </ol>
    <div class="conv-bar" role="progressbar" aria-label="Chapters written" aria-valuemin="0" aria-valuemax="20" aria-valuenow="${n}"><i style="width:${(n / 20) * 100}%"></i></div>
    ${hook ? `<div class="lbl muted" style="margin-top:16px">Just written · chapter ${hook.n} hook</div>
      <div class="conv-hook"><span class="lbl">${up(`Chapter ${String(hook.n).padStart(2, "0")} of 20 · ${hook.kicker || ""}`)}</span><b class="hl">${up(hook.head)}</b><i>${esc(hook.sub || "")}</i></div>` : ""}
    <div class="conv-foot">${foot}</div>
    ${extra}
    ${active ? `<button class="btn secondary wide" data-act="convert-cancel" data-id="${id}">Stop converting</button>`
      : !failed ? `<button class="btn primary wide" data-act="convert" data-id="${id}">Start converting</button>` : ""}
  </div>`;
}

function readyView(item) {
  const pack = app.BOOKS[item.id];
  return `<div class="complete conv-ready">
    <div class="stamp-wrap"><div class="stamp">READY</div><div class="lbl">${up(item.title)} · YOUR BOOKREEL</div></div>
    <div class="cstats"><div><b>20</b><span>CHAPTERS</span></div><div><b>${pack.chapters.reduce((a, c) => a + c.posts.length, 0)}</b><span>POSTS</span></div><div><b>~60</b><span>MINUTES</span></div></div>
    <p class="conv-note">${icon("lock", { size: 15 })} Saved on this phone. Only you can see it.</p>
    <button class="btn primary wide" data-act="open-book" data-id="${item.id}">Open the book</button>
    <button class="btn ghost wide" data-nav="#/">Back to library</button></div>`;
}

// ------------------------------------------------------------------ library shelf

export function shelf() {
  const list = [...items.values()];
  if (!list.length) {
    return `<button class="disc-promo" data-nav="#/discover">${icon("compass", { size: 26 })}<span><b>75,000+ free books</b><span>Download any classic and make it a Bookreel.</span></span>${icon("arrow", { size: 18 })}</button>`;
  }
  const rows = list.map((item) => {
    const st = C.statusOf(item.id);
    const converting = C.isActive(st) || (item.job && !st);
    const n = st ? st.done : 0;
    let line, btn;
    if (item.status === "ready") { line = `<span class="ok">Bookreel ready · 20 chapters${converting ? " · remaking" : ""}</span>`; btn = `<button class="sbtn" data-act="open-book" data-id="${item.id}">Read</button>`; }
    else if (converting) {
      const paused = st && st.status === "waiting" && st.wait_reason === "quota";
      line = `<span class="busy">${paused ? `Paused for Gemini’s quota · ${n} of 20` : `Converting in the cloud · ${n} of 20`}</span><span class="sbar"><i style="width:${(n / 20) * 100}%"></i></span>`;
      btn = `<button class="sbtn ghost" data-act="view-convert" data-id="${item.id}">View</button>`;
    } else if (st && st.status === "failed") { line = `<span class="busy">Conversion stopped</span>`; btn = `<button class="sbtn" data-act="view-convert" data-id="${item.id}">View</button>`; }
    else { line = `<span class="ok">Saved on this phone</span>`; btn = `<button class="sbtn" data-act="convert" data-id="${item.id}">Make it a Bookreel</button>`; }
    const open = item.source === "gutenberg" ? `#/gb/${item.gid}` : `#/mine/${item.id}`;
    return `<div class="srow"><a class="srow-c" href="${open}" data-nav="${open}">${drawnCover(item.title, item.gid || item.id)}</a>
      <div class="srow-m"><a href="${open}" data-nav="${open}"><b>${esc(item.title)}</b><span class="muted">${esc(item.authors[0] || (item.source === "gutenberg" ? "" : "Your own file"))}</span></a>${line}${btn}</div></div>`;
  }).join("");
  return `<div class="row-h"><h2>YOUR DOWNLOADS</h2><span>${list.length}</span></div><div class="shelf">${rows}</div>
    <button class="link-btn" data-nav="#/discover">${icon("compass", { size: 16 })} Find more free books</button>`;
}

// ------------------------------------------------------------------ sheets

export function sheetBody(s) {
  if (s.kind === "remove") {
    const item = items.get(s.id);
    return `<div class="lbl muted">REMOVE FROM THIS PHONE</div><h2 class="s-title hl">${up(item ? item.title : "This book")}</h2>
      <p>${item && item.status === "ready" ? "This deletes the download and its Bookreel from this phone. Your reading progress stays." : "This deletes the download from this phone."}</p>
      <button class="btn primary wide" data-act="remove-yes" data-id="${esc(s.id)}">Remove</button><button class="btn secondary wide" data-act="sheet-close">Keep it</button>`;
  }
  if (s.kind !== "convert") return "";
  const item = items.get(s.id);
  if (!item) return "";
  const notReady = status.ready === false;
  const bars = (n, cls) => `<div class="cv-bars">${Array.from({ length: n }, (_, i) => `<i class="${cls(i)}"></i>`).join("")}</div>`;
  const minutes = Math.max(10, Math.round((21 * 40 + 60) / 60));
  const again = item.status === "ready";
  return `<div class="lbl muted">${again ? "MAKE IT AGAIN" : "MAKE IT A BOOKREEL"}</div><h2 class="s-title hl">${up(`${item.title.split(/[;:]/)[0]} in 20 chapters`)}</h2>
    ${again ? `<p>Your current Bookreel stays readable until the new one is ready, then the new one replaces it. Your reading progress is kept.</p>` : ""}
    <p>Bookreel reads the whole book and retells it as 200 short posts, in its own words, with the twists in the right order.</p>
    <div class="lbl muted">20 chapters</div>${bars(20, () => "c")}
    <div class="cv-every"><div class="lbl muted">Every chapter</div>${bars(10, (i) => (i === 0 ? "h" : i === 4 ? "p" : i === 9 ? "x" : ""))}<div class="cv-legend"><span>Hook</span><span>Poll or guess</span><span>Cliffhanger</span></div></div>
    <fieldset class="cv-mode"><legend class="lbl muted">When it’s ready</legend>
      <label class="${s.mode !== "daily" ? "on" : ""}"><input type="radio" name="cvmode" value="binge" ${s.mode !== "daily" ? "checked" : ""}> Read it all now</label>
      <label class="${s.mode === "daily" ? "on" : ""}"><input type="radio" name="cvmode" value="daily" ${s.mode === "daily" ? "checked" : ""}> One a day</label></fieldset>
    <p class="cv-time">${icon("clock", { size: 16 })} About ${minutes}–${minutes + 10} minutes, in the cloud. You can close Bookreel while it works.</p>
    <p class="muted mono">The book is sent to Bookreel’s cloud and to Google’s Gemini, which writes the posts. The finished Bookreel comes back to this phone.</p>
    ${notReady ? `<div class="gb-err">Converting isn’t switched on yet: the Gemini key hasn’t been added.</div>` : ""}
    <button class="btn primary wide" data-act="convert-go" data-id="${esc(s.id)}" ${notReady ? "disabled" : ""}>Start converting</button>
    <button class="btn secondary wide" data-act="sheet-close">Not now</button>`;
}

// ------------------------------------------------------------------ actions

const detailAsked = new Set();
/** Full details of one book (subjects, downloads, summary); the search lists only carry title and author. */
async function fetchOne(gid) {
  gid = +gid;
  if (detailAsked.has(gid)) return;
  detailAsked.add(gid);
  try {
    const r = await fetch(`/api/catalog?ids=${encodeURIComponent(gid)}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    (data.books || []).forEach((b) => known.set(b.id, { ...(known.get(b.id) || {}), ...b }));
  } catch (e) {
    setTimeout(() => detailAsked.delete(gid), 30000); // allow another try later, without a retry loop now
    if (!known.has(gid)) known.set(gid, { id: gid, title: `Book #${gid}`, authors: [], subjects: [], languages: ["en"], downloads: null, cover: null, detail: false });
  }
  const r = app.route();
  if (r.name === "gb" && +r.gid === gid) app.render();
}

async function download(gid) {
  const id = pgId(gid);
  const b = known.get(+gid);
  downloading.add(id);
  app.render();
  try {
    const r = await fetch(`/api/book?id=${gid}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Download failed.");
    store.askToPersist();
    await store.putText(id, data.text);
    await store.putItem({
      id, source: "gutenberg", gid: +gid, title: b ? b.title.split(/[;:]/)[0].trim() : `Book #${gid}`, authors: b ? b.authors.map((a) => a.name) : [],
      subjects: b ? b.subjects : [], cover: b ? b.cover : null, words: data.words, savedAt: Date.now(), status: "saved",
    });
    await refreshItems();
    app.toast(store.isPersistent() ? "Saved on this phone" : "Saved for now (this browser blocks storage)");
  } catch (e) {
    app.toast(e.message || "Download failed");
  } finally {
    downloading.delete(id);
    app.render();
  }
}

async function readFile(file) {
  const name = file.name.replace(/\.(pdf|txt)$/i, "");
  const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
  let text = "", title = name, authors = [];
  if (isPdf) {
    app.toast("Reading the PDF…");
    const pdfjs = await import("/vendor/pdfjs-4.10.38/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs-4.10.38/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const meta = await doc.getMetadata().catch(() => null);
    if (meta && meta.info) {
      if (meta.info.Title && String(meta.info.Title).trim().length > 2) title = String(meta.info.Title).trim();
      if (meta.info.Author) authors = [String(meta.info.Author).trim()];
    }
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let line = "";
      const lines = [];
      for (const it of content.items) {
        line += it.str;
        if (it.hasEOL) { lines.push(line); line = ""; } else if (it.str && !/\s$/.test(it.str)) line += " ";
      }
      if (line) lines.push(line);
      pages.push(lines.join("\n"));
    }
    // Lines inside a paragraph are joined; a short line or a page end closes a paragraph.
    text = pages.map((pg) => pg.split("\n").reduce((acc, l) => {
      const t = l.trim();
      if (!t) return acc + "\n\n";
      return acc + t + (t.length < 55 || /[.!?"”]$/.test(t) && t.length < 70 ? "\n\n" : " ");
    }, "")).join("\n\n").replace(/-\s+(?=[a-z])/g, "").replace(/\n{3,}/g, "\n\n");
  } else {
    text = await file.text();
  }
  return { text: text.trim(), title, authors, fileType: isPdf ? "pdf" : "txt" };
}

async function importFile(file) {
  if (!file) return;
  if (file.size > 60 * 1024 * 1024) return app.toast("That file is too big (over 60 MB).");
  try {
    const { text, title, authors, fileType } = await readFile(file);
    const words = C.wordCount(text);
    if (words < C.MIN_WORDS) return app.toast(fileType === "pdf" && words < 200 ? "This PDF has no selectable text (it may be scanned)." : "This file is too short to make 20 chapters.");
    const id = `my-${C.hash(`${file.name}|${file.size}|${file.lastModified}`).toString(16)}`;
    store.askToPersist();
    await store.putText(id, text);
    await store.putItem({ id, source: "file", fileType, fileName: file.name, title: title.slice(0, 80), authors, words, savedAt: Date.now(), status: "saved" });
    await refreshItems();
    app.toast("Saved on this phone");
    app.go(`#/mine/${id}`);
  } catch (e) {
    app.toast("Couldn’t read that file.");
  }
}

async function openConvertSheet(id) {
  app.openSheet({ kind: "convert", id, mode: "binge" });
  await loadStatus();
  const s = app.sheet();
  if (s && s.kind === "convert") app.openSheet({ ...s });
}

async function go(id, mode) {
  app.closeSheet({ silent: true });
  app.setMode(id, mode === "daily" ? "daily" : "binge", true);
  app.go(`#/convert/${id}`);
  try {
    await C.start(id);
    app.toast("Converting in the cloud. You can close Bookreel.");
  } catch (e) {
    app.toast(e.message || "Couldn’t start converting.");
  }
  await refreshItems();
  app.render();
}

/** Handles Discover's buttons. Returns true when the action was ours. */
export function onAct(act, d) {
  switch (act) {
    case "gb": app.go(`#/gb/${d.gid}`); return true;
    case "topic": {
      topic = d.topic; q = "";
      const inp = document.getElementById("dq");
      if (inp) inp.value = "";
      document.querySelectorAll(".disc .chip").forEach((c) => { const on = c.dataset.topic === topic; c.classList.toggle("on", on); c.setAttribute("aria-selected", on); });
      loadCatalog();
      return true;
    }
    case "cat-more": loadCatalog(true); return true;
    case "cat-retry": cat.key = null; loadCatalog(); return true;
    case "pick-file": document.getElementById("filepick")?.click(); return true;
    case "download": download(d.gid); return true;
    case "convert": {
      if (C.isActive(C.statusOf(d.id))) { app.go(`#/convert/${d.id}`); return true; }
      openConvertSheet(d.id); return true;
    }
    case "convert-go": go(d.id, document.querySelector("input[name=cvmode]:checked")?.value); return true;
    case "convert-cancel": C.cancel(d.id).then(() => { native("cancelRelease", noticeKey(d.id)); notified.delete(d.id); app.toast("Stopped"); }).catch((e) => app.toast(e.message)); return true;
    case "convert-lite": C.finishWithLite(d.id).then(() => app.toast("Carrying on with Flash-Lite")).catch((e) => app.toast(e.message)); return true;
    case "convert-retry": C.retry(d.id).then(() => app.toast("Trying again")).catch((e) => app.toast(e.message)); return true;
    case "view-convert": app.go(`#/convert/${d.id}`); return true;
    case "open-book": app.go(`#/book/${d.id}`); return true;
    case "remove": app.openSheet({ kind: "remove", id: d.id }); return true;
    case "remove-yes": {
      const stop = C.isActive(C.statusOf(d.id)) ? C.cancel(d.id).catch(() => {}) : Promise.resolve();
      native("cancelRelease", noticeKey(d.id));
      stop.then(() => store.removeAll(d.id)).then(async () => {
        delete app.BOOKS[d.id];
        const list = app.INDEX().books;
        const i = list.findIndex((b) => b.id === d.id);
        if (i >= 0) list.splice(i, 1);
        await refreshItems();
        app.closeSheet({ silent: true });
        app.toast("Removed from this phone");
        app.render();
      });
      return true;
    }
    default: return false;
  }
}

export function onInput(e) {
  if (e.target.id !== "dq") return false;
  q = e.target.value.trim();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    document.querySelectorAll(".disc .chip").forEach((c) => { const on = !q && c.dataset.topic === topic; c.classList.toggle("on", on); c.setAttribute("aria-selected", on); });
    loadCatalog();
  }, 450);
  return true;
}

export function onChange(e) {
  if (e.target.id === "filepick") { importFile(e.target.files && e.target.files[0]); e.target.value = ""; return true; }
  if (e.target.name === "cvmode") {
    document.querySelectorAll(".cv-mode label").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked));
    return true;
  }
  return false;
}

export const hasItems = () => items.size > 0;
export const jobStatus = (id) => C.statusOf(id);
