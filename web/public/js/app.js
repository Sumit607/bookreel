// Bookreel web app: state, routing, screens, reader and sheets. Ported from the Android app (AppViewModel + screens).
import * as R from "./rules.js";
import { esc, pad2, icon, compactCount } from "./util.js";
import { renderCard } from "./cards.js";

const VERSION = "web 0.2.0";
const STORE_KEY = "bookreel-state-v1";
const CATEGORIES = ["All", "Business", "Classics", "Mystery", "Strategy", "Thriller"];
const app = document.getElementById("app");
const sheetEl = document.getElementById("sheet");
const toastEl = document.getElementById("toast");
const now = () => Date.now();
const up = (s) => esc(String(s ?? "").toUpperCase());

// ------------------------------------------------------------------ state

let S = loadState();
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const base = R.emptyState();
      return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
    }
  } catch (e) { /* private window or blocked storage: start fresh */ }
  return R.emptyState();
}
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}
function update(fn) {
  S = fn(S);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 300);
}
addEventListener("pagehide", persist);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persist(); });

// ------------------------------------------------------------------ data

let INDEX = { books: [] };
const BOOKS = {};
const PRIVATE_LOCKED = new Set();
let dataReady = null;

async function loadData() {
  try {
    const r = await fetch("/books/index.json", { cache: "no-cache" });
    INDEX = await r.json();
  } catch (e) { INDEX = { books: [] }; }
  await Promise.all(INDEX.books.filter((b) => b.status === "ready").map(loadBook));
}

async function loadBook(meta) {
  const url = meta.access === "private" ? `/api/pack?id=${encodeURIComponent(meta.id)}` : `/books/${meta.file}`;
  try {
    const r = await fetch(url, { credentials: "same-origin", cache: "no-cache" });
    if (r.status === 401 || r.status === 403) { PRIVATE_LOCKED.add(meta.id); return; }
    if (!r.ok) return;
    const book = await r.json();
    book.chapters.forEach((c, i) => c.posts.forEach((p, j) => { if (!p.id) p.id = `${i + 1}-${j + 1}`; }));
    BOOKS[meta.id] = book;
    PRIVATE_LOCKED.delete(meta.id);
  } catch (e) { /* offline and not cached */ }
}

const metaOf = (id) => INDEX.books.find((b) => b.id === id);
const lockOf = (bookId, ch) => R.lockState(S, bookId, ch, now());
function nextChapter(bookId) {
  const b = BOOKS[bookId];
  if (!b) return 1;
  for (let n = 1; n <= b.chapters.length; n++) if (!R.isComplete(S, bookId, n)) return n;
  return b.chapters.length;
}
function resumePost(bookId, ch) {
  if (R.isComplete(S, bookId, ch)) return 0;
  return S.progress[R.key(bookId, ch)] || 0;
}

// ------------------------------------------------------------------ theme and preferences

const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
function applyPrefs() {
  const t = S.settings.theme;
  const dark = t === "dark" || (t === "system" && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.setProperty("--ts", String(S.settings.textScale || 1));
  document.documentElement.classList.toggle("rm", !!S.settings.reduceMotion || motionQuery.matches);
}
const reduceMotion = () => document.documentElement.classList.contains("rm");
darkQuery.addEventListener?.("change", () => { applyPrefs(); });
motionQuery.addEventListener?.("change", applyPrefs);

function setThemeColor(immersive) {
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = immersive ? "#0B0D10" : document.documentElement.dataset.theme === "dark" ? "#111418" : "#FBFBFC";
}

// ------------------------------------------------------------------ routing

let depth = 0;
function parseRoute() {
  const h = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  const q = new URLSearchParams(qs || "");
  const p = path.split("/").filter(Boolean);
  if (p[0] === "notebook") return { name: "notebook" };
  if (p[0] === "profile") return { name: "profile" };
  if (p[0] === "book" && p[1]) return { name: "book", id: p[1] };
  if (p[0] === "read" && p[1]) return { name: "read", id: p[1], ch: +p[2] || 1, post: q.has("p") ? +q.get("p") : null, preview: q.get("preview") === "1" };
  if (p[0] === "done" && p[1]) return { name: "done", id: p[1], ch: +p[2] || 1 };
  return { name: "library" };
}
let route = parseRoute();

function go(hash) {
  if (sheet) { closeSheet({ silent: true }); history.replaceState(null, "", hash); depth++; return render(); }
  if (location.hash === hash) return render();
  depth++;
  location.hash = hash;
}
function replace(hash) {
  if (sheet) closeSheet({ silent: true });
  history.replaceState(null, "", hash);
  render();
}
function back() {
  if (depth > 0) history.back();
  else replace("#/");
}
let renderQueued = false;
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
addEventListener("popstate", (e) => {
  if (sheet && !(e.state && e.state.sheet)) { sheet = null; hideSheet(); return; }
  depth = Math.max(0, depth - 1);
  queueRender();
});
addEventListener("hashchange", queueRender);

// ------------------------------------------------------------------ toast

let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

// ------------------------------------------------------------------ render

let reader = null;
let lastKey = "";
function render() {
  const prevScroll = app.querySelector(".screen")?.scrollTop || 0;
  route = parseRoute();
  const routeKey = location.hash;
  if (reader) { reader.destroy(); reader = null; }
  applyPrefs();
  const immersive = route.name === "read" || route.name === "done";
  document.body.classList.toggle("immersive", immersive);
  setThemeColor(immersive);
  let html;
  switch (route.name) {
    case "notebook": html = notebookScreen(); break;
    case "profile": html = profileScreen(); break;
    case "book": html = bookScreen(route.id); break;
    case "read": html = readerShell(route); break;
    case "done": html = completeScreen(route); break;
    default: html = libraryScreen();
  }
  app.innerHTML = immersive ? html : `<main class="screen">${html}</main>${bottomNav()}`;
  if (route.name === "read") reader = mountReader(route);
  fitHeadlines(app);
  const scr = app.querySelector(".screen");
  if (scr) scr.scrollTop = routeKey === lastKey ? prevScroll : 0;
  lastKey = routeKey;
}

function bottomNav() {
  const tab = route.name === "notebook" ? 1 : route.name === "profile" ? 2 : 0;
  const item = (i, label, ic, hash) => `<a class="nav-i${tab === i ? " on" : ""}" href="${hash}" data-nav="${hash}">${icon(ic, { size: 25 })}<span>${label}</span></a>`;
  return `<nav class="bnav">${item(0, "Library", "home", "#/")}${item(1, "Notebook", "bookmark", "#/notebook")}${item(2, "Profile", "person", "#/profile")}</nav>`;
}

/** Shrinks display headlines just enough for their widest word to fit, so words never break mid-word. */
function fitHeadlines(root) {
  root.querySelectorAll(".hl").forEach((el) => {
    el.style.fontSize = "";
    const base = parseFloat(getComputedStyle(el).fontSize);
    let size = base;
    let guard = 0;
    while (el.scrollWidth > el.clientWidth + 1 && size > 10 && guard++ < 30) {
      size *= 0.94;
      el.style.fontSize = size + "px";
    }
  });
}
addEventListener("resize", () => fitHeadlines(app));

// ------------------------------------------------------------------ covers

function cover(meta, small = false) {
  const c = meta.cover;
  const motifs = {
    factory: `<rect width="100" height="11" fill="#F4A23C"/><rect x="78" y="21" width="12" height="21" rx="1" fill="#D63A2F"/>`,
    lens: `<circle cx="66" cy="37" r="20" fill="none" stroke="${c.fg}" stroke-opacity=".9" stroke-width="3.5"/><line x1="80" y1="54" x2="92" y2="69" stroke="${c.fg}" stroke-opacity=".9" stroke-width="4" stroke-linecap="round"/>`,
    diamond: `<circle cx="50" cy="37" r="20" fill="none" stroke="${c.fg}" stroke-width="1.2"/><path d="M50 24L63 37L50 50L37 37Z" fill="none" stroke="${c.fg}" stroke-width="1.2"/><circle cx="50" cy="37" r="4" fill="${c.fg}"/>`,
    sun: `<circle cx="50" cy="37" r="24" fill="#C8312A"/>`,
    bolt: `<path d="M78 7L60 37L72 37L62 65L88 30L76 30Z" fill="#E8D35A"/>`,
  };
  return `<div class="cover${small ? " small" : ""}" style="background:${esc(c.bg)};color:${esc(c.fg)}">
    <svg viewBox="0 0 100 125" preserveAspectRatio="xMidYMin slice" aria-hidden="true">${motifs[c.motif] || ""}<rect width="3" height="125" fill="#000" fill-opacity=".25"/></svg>
    <div class="cover-t">${up(meta.title)}</div></div>`;
}

// ------------------------------------------------------------------ library

let query = "";
let category = "All";
function filteredBooks() {
  const q = query.trim().toLowerCase();
  return INDEX.books.filter((b) => (category === "All" || b.category.toLowerCase() === category.toLowerCase()) &&
    (!q || b.title.toLowerCase().includes(q) || b.authors.some((a) => a.toLowerCase().includes(q)) || b.category.toLowerCase().includes(q)));
}
function libraryScreen() {
  const streak = R.displayedStreak(S, now());
  return `<div class="pad16">
    <header class="lib-head"><div class="logo">book<span>reel</span></div>
      <span class="hchip">${icon("flame", { size: 18 })}<b>${streak}</b></span>
      <a class="avatar-btn" href="#/profile" data-nav="#/profile" aria-label="Profile">${icon("person", { size: 20 })}</a></header>
    <h1 class="big">PICK YOUR NEXT BOOK</h1>
    <div class="sub-mono">Every book · 20 chapters × 10 posts · about 1 hour</div>
    <label class="search">${icon("search", { size: 18 })}<input id="q" type="search" placeholder="Search books, authors, ideas" value="${esc(query)}" autocomplete="off" enterkeyhint="search"></label>
    <div class="chips" role="tablist">${CATEGORIES.map((c) => `<button class="chip${c === category ? " on" : ""}" data-act="cat" data-cat="${c}" role="tab" aria-selected="${c === category}">${c}</button>`).join("")}</div>
    ${continueCard()}
    <div id="grid">${bookGrid()}</div>
    <p class="fine">Free classics are open to everyone. The Goal is private: it opens only with your passcode.</p>
  </div>`;
}
function bookGrid() {
  const books = filteredBooks();
  const cards = books.map((m) => {
    const ready = m.status === "ready";
    const locked = PRIVATE_LOCKED.has(m.id);
    const tag = !ready ? "Coming soon" : locked ? "Private" : m.cover.tag;
    return `<button class="bcard" data-act="book" data-id="${m.id}">${cover(m)}<span class="btag">${locked ? icon("lock", { size: 11 }) : ""}${up(tag)}</span>
      <span class="bhook">${esc(m.hook)}</span><span class="bmeta">${ready ? `20 ch · ${m.minutes} min` : "Coming soon"}</span></button>`;
  }).join("");
  return `<div class="row-h"><h2>START WITH A HOOK</h2><span>${books.length} books</span></div>
    <div class="bgrid">${cards || `<p class="muted">No books match “${esc(query)}”.</p>`}</div>`;
}
function continueCard() {
  const last = S.lastOpened;
  if (!last) return "";
  const book = BOOKS[last.bookId];
  const meta = metaOf(last.bookId);
  if (!book || !meta) return "";
  const n = book.chapters.length;
  if (R.completedCount(S, book.id) >= n) return "";
  const ch = Math.min(Math.max(last.ch, 1), n);
  const chapter = book.chapters[ch - 1];
  const segs = book.chapters.map((_, i) => `<i class="${R.isComplete(S, book.id, i + 1) ? "on" : ""}"></i>`).join("");
  return `<button class="cont" data-act="continue" data-id="${book.id}" data-ch="${ch}">${cover(meta, true)}
    <span class="cont-m"><span class="cont-k">CONTINUE · CHAPTER ${ch} OF ${n}</span><span class="cont-t">${up(chapter.title)}</span>
    <span class="cont-h">${esc(chapter.hook)}</span><span class="segs thin">${segs}</span></span>
    <span class="cont-play">${icon("play", { size: 18, label: "Continue reading" })}</span></button>`;
}

// ------------------------------------------------------------------ book page

function bookScreen(id) {
  const meta = metaOf(id);
  const book = BOOKS[id];
  if (!meta) return `<div class="pad16 center muted">Loading…</div>`;
  if (!book) {
    if (PRIVATE_LOCKED.has(id)) setTimeout(() => openSheet({ kind: "passcode", id }), 0);
    return `<div class="pad16"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon("back")}</button><span>${esc(meta.title)}</span></div>
      <div class="center muted" style="padding:48px 0">${PRIVATE_LOCKED.has(id) ? "This book is private. Enter your passcode to open it." : "Loading…"}</div></div>`;
  }
  const n = book.chapters.length;
  const done = R.completedCount(S, id);
  const next = nextChapter(id);
  const m = R.mode(S, id);
  const posts = book.chapters.reduce((a, c) => a + c.posts.length, 0);
  const startLabel = done >= n ? "Read again from Chapter 1"
    : done === 0 && !S.progress[R.key(id, 1)] ? `Start Chapter 1: ${book.chapters[0].title}`
    : `Continue Chapter ${next}: ${book.chapters[next - 1].title}`;
  const segs = book.chapters.map((_, i) => `<i class="${R.isComplete(S, id, i + 1) ? "on" : ""}"></i>`).join("");
  const reached = Math.max(next, 1);
  const chars = book.characters.map((c) => {
    const unlocked = c.firstChapter <= reached || R.isComplete(S, id, c.firstChapter);
    return `<button class="cb" data-act="char" data-id="${c.id}"><span class="cb-ring${unlocked ? " on" : ""}"><span class="cb-av" style="${unlocked ? `background:${esc(c.color)}` : ""}">${unlocked ? esc(c.initials) : icon("lock", { size: 20 })}</span></span><span class="cb-n${unlocked ? "" : " muted"}">${unlocked ? esc(c.short) : "Ch " + c.firstChapter}</span></button>`;
  }).join("");
  const tiles = book.chapters.map((c) => tile(book, c, next, done < n)).join("");
  const earned = done >= n;
  return `<div class="book">
    <div class="pad16"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="Back">${icon("back")}</button><span>${esc(book.title)}</span>
      <button class="icon-btn" data-act="how" aria-label="How it works">${icon("info", { size: 22 })}</button></div>
    <div class="bk-top">${cover(meta, true)}<div class="stats"><div><b>${n}</b><span>chapters</span></div><div><b>${posts}</b><span>posts</span></div><div><b>~${meta.minutes}</b><span>minutes</span></div></div></div>
    <h1 class="bk-t">${up(book.title)}</h1><div class="muted small">${esc(book.authors.join(" & "))}</div>
    <p class="bk-blurb">${esc(book.blurb)}</p>
    <div class="segs fat">${segs}</div>
    <div class="bk-prog"><span>${done} of ${n} chapters</span><span>${R.totalXp(S)} XP</span></div>
    <button class="btn primary wide" data-act="start" data-id="${id}">${esc(startLabel)}</button>
    <div class="moderow"><span class="muted">Next chapter</span><div class="seg">
      <button class="${m === R.BINGE ? "on" : ""}" data-act="mode" data-mode="${R.BINGE}">Right away</button>
      <button class="${m === R.DAILY ? "on" : ""}" data-act="mode" data-mode="${R.DAILY}">Daily at ${R.hourLabel(S.settings.releaseHour)}</button></div></div>
    <div class="chars">${chars}</div>
    <div class="divider"></div><div class="grid-h">${icon("grid", { size: 17 })} ${n} chapters · 10 posts each</div></div>
    <div class="tiles">${tiles}
      <button class="tile badge${earned ? " earned" : ""}" data-act="badge">${icon("medal", { size: 44 })}${earned ? "" : `<span class="tl-lock">${icon("lock", { size: 16 })}</span>`}<span class="tl-t">BOOK BADGE</span></button></div>
  </div>`;
}

function tile(book, c, next, notDone) {
  const lock = lockOf(book.id, c.n);
  const open = lock.kind === "open";
  const done = R.isComplete(S, book.id, c.n);
  const isNext = c.n === next && notDone;
  let corner = "";
  if (done) corner = `<span class="tl-done">${icon("check", { size: 15, label: "Read" })}</span>`;
  else if (lock.kind === "waiting") corner = `<span class="tl-opens">OPENS<br>${R.hourLabel(new Date(lock.at).getHours())}</span>`;
  else if (!open) corner = `<span class="tl-lock">${icon("lock", { size: 16, label: "Locked" })}</span>`;
  const style = open ? `background:${esc(c.bg)};color:${esc(c.fg)}` : "";
  return `<button class="tile${open ? "" : " locked"}${isNext ? " next" : ""}" style="${style}" data-act="chapter" data-ch="${c.n}"><span class="tl-n">${pad2(c.n)}</span>${corner}<span class="tl-t">${up(c.title)}</span></button>`;
}

// ------------------------------------------------------------------ reader

function readerShell(r) {
  const book = BOOKS[r.id];
  if (!book) {
    if (PRIVATE_LOCKED.has(r.id)) setTimeout(() => openSheet({ kind: "passcode", id: r.id }), 0);
    return `<div class="reader"><div class="center" style="padding:80px 20px;color:#F0ECE4">Loading…</div></div>`;
  }
  const n = book.chapters.length;
  const ch = Math.min(Math.max(r.ch, 1), n);
  const chapter = book.chapters[ch - 1];
  const count = r.preview ? 1 : chapter.posts.length;
  const ctx = cardCtx(book, ch, r.preview);
  const pages = chapter.posts.slice(0, count).map((p, i) => `<section class="page" data-i="${i}" aria-label="Post ${i + 1} of ${chapter.posts.length}"><div class="card">${renderCard(ctx, p, i)}</div></section>`).join("");
  return `<div class="reader">
    <div class="rhead"><div class="segs rsegs">${chapter.posts.map(() => "<i></i>").join("")}</div>
      <div class="rbar"><span class="rav" style="background:${esc(chapter.bg)};color:${esc(chapter.fg)}">${pad2(ch)}</span>
        <span class="rtitle"><b>${esc(book.title)}</b><span>Chapter ${ch} · ${esc(chapter.title)}${r.preview ? " · preview" : ""}</span></span>
        <span class="rcount"></span><button class="icon-btn light" data-act="close" aria-label="Close chapter">${icon("close")}</button></div></div>
    <div class="pager" tabindex="0">${pages}</div>
    <div class="rail"></div></div>`;
}

function cardCtx(book, ch, preview, extra = {}) {
  return { book, ch, state: S, previewOnly: preview, ...extra };
}

function mountReader(r) {
  const book = BOOKS[r.id];
  if (!book) return null;
  const n = book.chapters.length;
  const ch = Math.min(Math.max(r.ch, 1), n);
  const chapter = book.chapters[ch - 1];
  const posts = chapter.posts;
  const count = r.preview ? 1 : posts.length;
  const root = app.querySelector(".reader");
  const pager = root.querySelector(".pager");
  const segs = [...root.querySelectorAll(".rsegs i")];
  const countEl = root.querySelector(".rcount");
  const rail = root.querySelector(".rail");
  let cur = Math.min(Math.max(r.post ?? resumePost(r.id, ch), 0), count - 1);
  let viewTimer = 0;
  let settleTimer = 0;
  let lastCross = null;
  const timers = [];

  const step = () => pager.clientWidth;
  pager.scrollLeft = cur * step();

  function paintChrome() {
    segs.forEach((s, i) => s.classList.toggle("on", i <= cur));
    countEl.textContent = `${cur + 1}/${posts.length}`;
    const p = posts[cur];
    const pk = R.postKey(r.id, p.id);
    const liked = S.likes.includes(pk);
    const saved = !!S.saves[pk];
    const likes = 420 + ((ch * 131 + cur * 197) % 41) * 61 + (liked ? 1 : 0);
    rail.innerHTML = `<button class="rb${liked ? " liked" : ""}" data-act="like" aria-label="Like">${icon("heart", { size: 25, filled: liked })}<span>${compactCount(likes)}</span></button>
      <button class="rb" data-act="comment" aria-label="Discussion">${icon("comment", { size: 25 })}<span>${9 + ((ch * 17 + cur * 29) % 57)}</span></button>
      <button class="rb" data-act="share" aria-label="Share">${icon("send", { size: 25 })}</button><span class="flex1"></span>
      ${cur === 0 && !r.preview ? '<span class="rhint">Tap right · swipe</span>' : ""}
      <button class="rb${saved ? " saved" : ""}" data-act="save" aria-label="${saved ? "Remove from notebook" : "Save to notebook"}">${icon("bookmark", { size: 25, filled: saved })}</button>`;
  }

  function makeLive(i) {
    const page = pager.children[i];
    if (!page || page.classList.contains("live")) return;
    page.classList.add("live");
    const b = page.querySelector('[data-anim="board"]');
    if (b && !reduceMotion()) animateBoard(b, timers);
    meterNeedles(page);
  }

  function settled(i) {
    cur = i;
    paintChrome();
    makeLive(i);
    if (r.preview) return;
    // Keep the address in step with the post, so a reload or a shared link reopens the same post.
    if (route.name === "read") history.replaceState(history.state, "", `#/read/${r.id}/${ch}?p=${i}`);
    update((s) => ({ ...s, progress: { ...s.progress, [R.key(r.id, ch)]: i }, lastOpened: { bookId: r.id, ch, post: i } }));
    clearTimeout(viewTimer);
    viewTimer = setTimeout(() => {
      const k = R.key(r.id, ch);
      const seen = S.viewed[k] || [];
      if (!seen.includes(i)) update((s) => ({ ...s, viewed: { ...s.viewed, [k]: [...(s.viewed[k] || []), i] } }));
    }, 1200);
  }

  function goTo(i) {
    if (i < 0) return;
    if (i >= count) {
      if (r.preview) openSheet({ kind: "locked", id: r.id, ch });
      else finishChapter(r.id, ch);
      return;
    }
    pager.scrollTo({ left: i * step(), behavior: reduceMotion() ? "auto" : "smooth" });
    if (reduceMotion()) settled(i);
  }

  function onScroll() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const i = Math.round(pager.scrollLeft / step());
      if (i !== cur || !pager.children[i].classList.contains("live")) settled(Math.min(Math.max(i, 0), count - 1));
    }, 90);
  }
  pager.addEventListener("scroll", onScroll, { passive: true });
  // Start a card's entrance animations as soon as most of it is on screen, not only once the swipe settles.
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) makeLive(+en.target.dataset.i); }), { root: pager, threshold: 0.6 })
    : null;
  if (io) [...pager.children].forEach((p) => io.observe(p));

  function rerenderPage(i) {
    const page = pager.children[i];
    if (!page) return;
    const card = page.querySelector(".card");
    const body = card.querySelector(".body");
    const scroll = body ? body.scrollTop : 0;
    card.innerHTML = renderCard(cardCtx(book, ch, r.preview, { lastCross }), posts[i], i);
    const nb = card.querySelector(".body");
    if (nb) nb.scrollTop = scroll;
    fitHeadlines(card);
  }

  function onClick(e) {
    const t = e.target.closest("[data-act]");
    if (t && root.contains(t)) {
      const act = t.dataset.act;
      if (act === "close") { e.preventDefault(); return back(); }
      if (act === "answer") return answer(+t.dataset.post, +t.dataset.opt);
      if (act === "cross") return cross(+t.dataset.post, +t.dataset.item);
      if (act === "finish") return goTo(count);
      if (act === "like") return like();
      if (act === "comment") return toast("Reader discussions arrive with accounts in a later version.");
      if (act === "share") return share();
      if (act === "save") return save();
    }
    if (!pager.contains(e.target)) return;
    if (e.target.closest("a, button, input")) return;
    if (window.getSelection && String(window.getSelection()).length > 0) return;
    const rect = pager.getBoundingClientRect();
    goTo(e.clientX - rect.left < rect.width * 0.3 ? cur - 1 : cur + 1);
  }
  root.addEventListener("click", onClick);

  // Vertical swipe on a card that does not scroll: up = next, down = previous.
  let sx = 0, sy = 0, tracking = false;
  function onDown(e) {
    const body = e.target.closest(".body, .cl-text");
    tracking = !(body && body.scrollHeight > body.clientHeight + 2);
    sx = e.clientX; sy = e.clientY;
  }
  function onUp(e) {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dy) > 140 && Math.abs(dy) > Math.abs(dx) * 1.5) goTo(dy < 0 ? cur + 1 : cur - 1);
  }
  pager.addEventListener("pointerdown", onDown);
  pager.addEventListener("pointerup", onUp);

  function onKey(e) {
    if (sheet) return;
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goTo(cur + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(cur - 1); }
    else if (e.key === "Escape") back();
  }
  addEventListener("keydown", onKey);

  function answer(i, opt) {
    const post = posts[i];
    const k = R.postKey(r.id, post.id);
    if (S.answers[k] !== undefined) return;
    update((s) => {
      let next = { ...s, answers: { ...s.answers, [k]: opt } };
      if (post.type === "guess") next = { ...next, guesses: { ...next.guesses, [R.postKey(r.id, post.loopId)]: post.options[opt].text } };
      return R.answerXp(next, k);
    });
    rerenderPage(i);
  }

  function cross(i, item) {
    const post = posts[i];
    const k = R.postKey(r.id, post.id);
    const curX = S.crossed[k] || [];
    if (curX.includes(item)) return;
    lastCross = `${post.id}:${item}`;
    update((s) => {
      const next = { ...s, crossed: { ...s.crossed, [k]: [...curX, item] } };
      return curX.length + 1 >= post.items.length ? R.answerXp(next, k) : next;
    });
    rerenderPage(i);
  }

  function like() {
    const k = R.postKey(r.id, posts[cur].id);
    update((s) => ({ ...s, likes: s.likes.includes(k) ? s.likes.filter((x) => x !== k) : [...s.likes, k] }));
    paintChrome();
  }

  function save() {
    const p = posts[cur];
    const k = R.postKey(r.id, p.id);
    const saved = !!S.saves[k];
    update((s) => {
      const saves = { ...s.saves };
      if (saved) delete saves[k]; else saves[k] = { bookId: r.id, ch, index: cur, at: now() };
      return { ...s, saves };
    });
    paintChrome();
    toast(saved ? "Removed from your notebook" : "Saved to your notebook");
  }

  async function share() {
    const p = posts[cur];
    const text = `${p.t}: from Chapter ${ch} of ${book.title} on Bookreel.\n\n${chapter.hook}`;
    try {
      if (navigator.share) await navigator.share({ title: book.title, text, url: location.origin });
      else { await navigator.clipboard.writeText(text); toast("Copied to share"); }
    } catch (e) { /* share cancelled */ }
  }

  paintChrome();
  if (r.preview) makeLive(0); else settled(cur);
  const fontsReady = document.fonts?.ready;
  if (fontsReady) fontsReady.then(() => fitHeadlines(root));
  const onResize = () => { pager.scrollLeft = cur * step(); };
  addEventListener("resize", onResize);

  return {
    destroy() {
      clearTimeout(viewTimer); clearTimeout(settleTimer);
      timers.forEach((t) => clearInterval(t));
      if (io) io.disconnect();
      removeEventListener("keydown", onKey);
      removeEventListener("resize", onResize);
    },
  };
}

function animateBoard(el, timers) {
  const flaps = [...el.querySelectorAll(".flap")];
  const finals = flaps.map((f) => f.dataset.c);
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let step = 0;
  const t = setInterval(() => {
    flaps.forEach((f, i) => {
      const fin = finals[i];
      if (fin === " ") return;
      f.textContent = step >= 4 + (i % 10) ? fin : letters[(i * 7 + step * 5) % letters.length];
    });
    if (++step > 14) { clearInterval(t); flaps.forEach((f, i) => { f.innerHTML = finals[i] === " " ? "&nbsp;" : esc(finals[i]); }); }
  }, 60);
  timers.push(t);
}

function meterNeedles(page) {
  page.querySelectorAll(".meter").forEach((m) => m.classList.add("go"));
}

function finishChapter(bookId, ch) {
  const book = BOOKS[bookId];
  if (!book) return;
  const n = book.chapters.length;
  let gained = 0;
  update((s) => {
    const viewed = (s.viewed[R.key(bookId, ch)] || []).length;
    const res = R.complete(s, bookId, ch, n, viewed, now());
    gained = res.xpGained;
    return { ...res.state, lastOpened: ch < n ? { bookId, ch: ch + 1, post: 0 } : s.lastOpened };
  });
  persist();
  lastGained[`${bookId}:${ch}`] = gained;
  replace(`#/done/${bookId}/${ch}`);
}
const lastGained = {};

// ------------------------------------------------------------------ complete screen

function completeScreen(r) {
  const book = BOOKS[r.id];
  if (!book) return `<div class="complete center">Loading…</div>`;
  const n = book.chapters.length;
  const chapter = book.chapters[r.ch - 1];
  const next = r.ch < n ? book.chapters[r.ch] : null;
  const bookDone = R.completedCount(S, r.id) >= n;
  const savedHere = Object.values(S.saves).filter((x) => x.bookId === r.id && x.ch === r.ch).length;
  const gained = lastGained[`${r.id}:${r.ch}`] ?? 0;
  const streak = Math.max(R.displayedStreak(S, now()), 1);
  const reminder = S.reminders[r.id];
  const scheduled = reminder && reminder > now() && R.mode(S, r.id) === R.DAILY;
  const nextBlock = next ? `<div class="next">
      <div class="next-art" style="background:linear-gradient(135deg, ${esc(next.bg)}, ${esc(next.bg2 || next.bg)});color:${esc(next.fg)}"><span>${pad2(next.n)}</span></div>
      <div class="next-m"><div class="lbl">UP NEXT</div><h3 class="hl">${up(next.title)}</h3><p>${esc(next.hook)}</p></div>
      <div class="next-b"><button class="btn primary wide" data-act="readnow">Read Chapter ${next.n} now</button>
        ${scheduled
          ? `<div class="btn ghost wide static">Unlocks ${esc(R.timeLabel(reminder))}</div><button class="link-btn" data-act="ics">${icon("calendar", { size: 16 })} Add a calendar reminder</button>`
          : `<button class="btn ghost wide" data-act="tomorrow">Release it to me tomorrow at ${R.hourLabel(S.settings.releaseHour)}</button>`}</div></div>`
    : `<div class="badge-earned">${icon("medal", { size: 40 })}<h3>BOOK BADGE EARNED</h3><p>You read all ${n} chapters of ${esc(book.title)}. Your saved posts are waiting in the Notebook.</p></div>`;
  return `<div class="complete">
    <div class="stamp-wrap"><div class="stamp">${bookDone && !next ? "FINISHED" : "SHIPPED"}</div>
      <div class="lbl">CHAPTER ${pad2(r.ch)} · ${up(chapter.title)} · COMPLETE</div></div>
    <div class="cstats"><div>${icon("flame", { size: 18 })}<b>${streak}</b><span>DAY STREAK</span></div><div><b>+${gained}</b><span>XP</span></div><div><b>${savedHere}</b><span>SAVED</span></div></div>
    <div class="lbl">THE CHAPTER IN 3 LINES</div>
    <ol class="recap">${chapter.recap.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
    ${nextBlock}
    <button class="btn ghost wide" data-act="tobook">Back to the book</button></div>`;
}

function releaseTomorrow(bookId, ch) {
  const book = BOOKS[bookId];
  const done = S.completions[R.key(bookId, ch)];
  if (!book || !done) return;
  const at = R.releaseAt(done.at, S.settings.releaseHour);
  update((s) => ({ ...s, modes: { ...s.modes, [bookId]: R.DAILY }, reminders: { ...s.reminders, [bookId]: at } }));
  toast(`Chapter ${ch + 1} unlocks ${R.timeLabel(at)}`);
  render();
}

function downloadIcs(bookId, ch) {
  const book = BOOKS[bookId];
  const at = S.reminders[bookId];
  if (!book || !at) return;
  const next = book.chapters[ch];
  const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escIcs = (s) => String(s).replace(/[\\,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Bookreel//EN", "BEGIN:VEVENT",
    `UID:bookreel-${bookId}-${ch + 1}@bookreel`, `DTSTAMP:${stamp(now())}`, `DTSTART:${stamp(at)}`, "DURATION:PT10M",
    `SUMMARY:${escIcs(`Chapter ${next.n} of ${book.title} is ready`)}`, `DESCRIPTION:${escIcs(next.hook)}`,
    `URL:${location.origin}/#/read/${bookId}/${next.n}`,
    "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", "DESCRIPTION:Bookreel", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url; a.download = `bookreel-chapter-${next.n}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ------------------------------------------------------------------ notebook

function notebookScreen() {
  const saved = Object.values(S.saves).sort((a, b) => a.bookId.localeCompare(b.bookId) || a.ch - b.ch || a.index - b.index);
  const items = saved.map((s) => {
    const book = BOOKS[s.bookId];
    const post = book?.chapters[s.ch - 1]?.posts[s.index];
    if (!post) return "";
    const chapter = book.chapters[s.ch - 1];
    return `<button class="nb" data-act="openpost" data-id="${s.bookId}" data-ch="${s.ch}" data-i="${s.index}">
      <span class="lbl">${up(`${book.title} · Ch ${pad2(s.ch)} · ${chapter.title} · post ${s.index + 1}`)}</span>
      <span class="nb-t">${up(post.t)}</span>${post.take ? `<span class="nb-take">${esc(post.take)}</span>` : ""}
      <span class="nb-open">Open post ${icon("arrow", { size: 16 })}</span></button>`;
  }).join("");
  return `<div class="pad16 nbook"><div class="lbl muted">YOUR NOTEBOOK</div><h1 class="big">SAVED POSTS</h1>
    <p class="muted">${saved.length} saved. Tap the bookmark under any post to keep it here.</p>
    ${saved.length ? items : `<div class="empty">${icon("bookmark", { size: 40 })}<p>Nothing saved yet. The ideas you save stay with you after the book ends.</p></div>`}</div>`;
}

// ------------------------------------------------------------------ profile

let installPrompt = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; if (route.name === "profile") render(); });

function profileScreen() {
  const ready = Object.values(BOOKS);
  const chaptersDone = Object.keys(S.completions).length;
  const booksDone = ready.filter((b) => R.completedCount(S, b.id) >= b.chapters.length).length;
  const badges = R.badges(S, ready);
  const seg = (name, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(v) === String(cur) ? "on" : ""}" data-act="set" data-k="${name}" data-v="${v}">${l}</button>`).join("")}</div>`;
  const ts = S.settings.textScale < 0.95 ? 0.9 : S.settings.textScale > 1.1 ? 1.15 : 1;
  return `<div class="pad16 prof">
    <div class="p-top"><span class="p-av">${icon("person", { size: 30 })}</span><div><h1 class="big">READER</h1><div class="muted small">Guest · progress saved in this browser</div></div></div>
    <div class="p-stats"><div><b>${R.displayedStreak(S, now())}</b><span>streak</span></div><div><b>${S.bestStreak}</b><span>best</span></div><div><b>${R.totalXp(S)}</b><span>XP</span></div><div><b>${chaptersDone}</b><span>chapters</span></div><div><b>${booksDone}</b><span>books</span></div></div>
    <div class="lbl muted sec">BADGES</div>
    <div class="badges">${badges.map((b) => `<div class="bdg${b.earned ? " on" : ""}">${icon(b.earned ? "medal" : "lock", { size: 26 })}<div><b>${esc(b.title)}</b><span>${esc(b.detail)}</span></div></div>`).join("")}</div>
    <div class="lbl muted sec">READING</div>
    <div class="setrow"><span>Theme</span>${seg("theme", [["system", "System"], ["light", "Light"], ["dark", "Dark"]], S.settings.theme)}</div>
    <div class="setrow"><span>Text size</span>${seg("textScale", [[0.9, "S"], [1, "M"], [1.15, "L"]], ts)}</div>
    <div class="setrow"><span>Daily release time</span>${seg("releaseHour", [[19, "7 PM"], [20, "8 PM"], [21, "9 PM"]], S.settings.releaseHour)}</div>
    <div class="setrow"><span><b class="fw">Reduce motion</b><small>Turns off card and stamp animations</small></span>
      <button class="switch${S.settings.reduceMotion ? " on" : ""}" role="switch" aria-checked="${!!S.settings.reduceMotion}" aria-label="Reduce motion" data-act="rm"><i></i></button></div>
    ${installPrompt ? `<button class="rowbtn" data-act="install">${icon("download", { size: 20 })}<span>Install Bookreel on this phone</span></button>` : ""}
    <p class="muted small">For full-screen reading, open the browser menu and choose “Add to Home screen”. Your progress stays in this browser on this phone.</p>
    <div class="lbl muted sec">ABOUT</div>
    <p class="muted small">Bookreel ${VERSION}. The Goal is private to you and opens only with your passcode; please don’t share it. A Study in Scarlet and the other classics are in the public domain.</p>
    <button class="rowbtn" data-act="how">${icon("info", { size: 20 })}<span>How Bookreel works</span></button>
    <button class="rowbtn danger" data-act="reset">${icon("close", { size: 20 })}<span>Reset reading progress</span></button></div>`;
}

// ------------------------------------------------------------------ sheets

let sheet = null;
function openSheet(s) {
  if (sheet) { sheet = s; return renderSheet(); }
  sheet = s;
  history.pushState({ sheet: 1 }, "", location.hash || "#/");
  renderSheet();
}
function closeSheet({ silent = false } = {}) {
  if (!sheet) return;
  sheet = null;
  hideSheet();
  if (!silent && history.state && history.state.sheet) history.back();
}
function hideSheet() {
  sheetEl.classList.remove("open");
  setTimeout(() => { if (!sheet) { sheetEl.hidden = true; sheetEl.innerHTML = ""; } }, 180);
}
function renderSheet() {
  sheetEl.innerHTML = `<div class="scrim" data-act="sheet-close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${sheetBody(sheet)}</div>`;
  sheetEl.hidden = false;
  requestAnimationFrame(() => sheetEl.classList.add("open"));
  fitHeadlines(sheetEl);
  const input = sheetEl.querySelector("input");
  if (input) setTimeout(() => input.focus(), 220);
}
const sTitle = (kicker, title) => `<div class="lbl muted">${up(kicker)}</div><h2 class="s-title hl">${up(title)}</h2>`;

function sheetBody(s) {
  switch (s.kind) {
    case "locked": {
      const book = BOOKS[s.id];
      const c = book.chapters[s.ch - 1];
      const lock = lockOf(s.id, s.ch);
      const why = lock.kind === "waiting" ? `Daily mode: unlocks ${R.timeLabel(lock.at)}.` : lock.kind === "previous" ? `Unlocks when you finish Chapter ${s.ch - 1}.` : "Open now.";
      return `${sTitle(`Chapter ${pad2(s.ch)} of ${book.chapters.length}`, c.title)}<p class="s-hook">${esc(c.hook)}</p>
        <div class="s-why">${icon("lock", { size: 16 })}<span>${esc(why)}</span></div>
        ${lock.kind === "waiting" ? `<button class="btn primary wide" data-act="binge-read" data-id="${s.id}" data-ch="${s.ch}">Switch to “right away” and read now</button>` : ""}
        ${lock.kind !== "open" ? `<button class="btn secondary wide" data-act="preview" data-id="${s.id}" data-ch="${s.ch}">Preview the hook post</button>` : ""}
        <button class="btn secondary wide" data-act="sheet-close">Got it</button>`;
    }
    case "char": {
      const book = BOOKS[s.id];
      const c = book.characters.find((x) => x.id === s.charId);
      const reached = Math.max(nextChapter(s.id), 1);
      const unlocked = c.firstChapter <= reached || R.isComplete(S, s.id, c.firstChapter);
      if (!unlocked) return `<div class="center"><div class="s-av locked">${icon("lock", { size: 30 })}</div><h2 class="s-title">NOT YET</h2>
        <p class="muted">You’ll meet this person in Chapter ${c.firstChapter}. Characters appear here as the story introduces them.</p></div>
        <button class="btn secondary wide" data-act="sheet-close">Got it</button>`;
      return `<div class="center"><div class="s-av" style="background:${esc(c.color)}">${esc(c.initials)}</div><div class="lbl muted">${up(c.role)}</div>
        <h2 class="s-title hl">${up(c.name)}</h2><p>${esc(c.bio)}</p><div class="traits light">${c.traits.map((t) => `<span>${esc(t)}</span>`).join("")}</div>
        <div class="lbl muted" style="margin-top:14px">FIRST APPEARS IN CHAPTER ${c.firstChapter}</div></div>`;
    }
    case "soon": {
      const m = metaOf(s.id);
      return `<div class="s-soon">${cover(m, true)}<div><div class="lbl muted">COMING SOON · ${up(m.category)}</div><h2 class="s-title hl">${up(m.title)}</h2><div class="muted small">${esc(m.authors.join(", "))}</div></div></div>
        <p class="s-hook">${esc(m.hook)}</p><p class="muted">${esc(m.blurb)}</p>
        <p class="muted mono">This free classic arrives soon, with the same 20 chapters of 10 posts.</p>
        <button class="btn secondary wide" data-act="sheet-close">Got it</button>`;
    }
    case "badge": {
      const book = BOOKS[s.id];
      const done = R.completedCount(S, s.id);
      const n = book.chapters.length;
      return `${sTitle(`${done} of ${n} chapters read`, `${book.title} badge`)}
        <p>${done >= n ? `Earned. You finished every chapter of ${esc(book.title)}.` : `Finish all ${n} chapters to earn this badge for your profile and +${R.XP_BOOK} XP.`}</p>
        <button class="btn primary wide" data-act="sheet-close">Keep reading</button>`;
    }
    case "how": {
      const pts = [
        ["1 book = 20 chapters.", "Every book, long or short, is re-cut into 20 story beats."],
        ["1 chapter = 10 posts.", "About 3 minutes. Each post is short, around 60 words."],
        ["Post 1 hooks, post 10 hangs.", "Every chapter opens on its sharpest moment and ends on a cliffhanger."],
        ["Read it like a feed.", "Tap the right side or swipe left for the next post. Tap the left side to go back. Swiping up works too."],
        ["Play along.", "Vote in polls, make guesses that pay off later, save posts to your notebook, and meet characters as they appear."],
        ["Your pace.", "Read chapters right away, or switch a book to Daily and get one chapter each evening."],
      ];
      return `${sTitle("The format", "How Bookreel works")}<ol class="how">${pts.map(([h, t]) => `<li><b>${esc(h)}</b><span>${esc(t)}</span></li>`).join("")}</ol>
        <button class="btn primary wide" data-act="sheet-close">Got it</button>`;
    }
    case "reset":
      return `${sTitle("Start over", "Reset progress?")}<p>This clears chapters read, answers, saved posts, streak and XP in this browser. Settings stay. It can’t be undone.</p>
        <button class="btn primary wide" data-act="reset-yes">Reset everything</button><button class="btn secondary wide" data-act="sheet-close">Cancel</button>`;
    case "passcode": {
      const m = metaOf(s.id);
      return `${sTitle("Private book", m ? m.title : "Private")}
        <p>${esc(m ? m.title : "This book")} is a private copy for you. Enter your passcode once and this phone remembers it.</p>
        <form class="pass" data-form="pass" data-id="${esc(s.id)}"><input name="code" type="password" inputmode="text" autocomplete="current-password" placeholder="Passcode" aria-label="Passcode" required>
        <div class="pass-err" role="alert">${s.error ? esc(s.error) : ""}</div>
        <button class="btn primary wide" type="submit">${s.busy ? "Checking…" : "Unlock"}</button></form>
        <button class="btn secondary wide" data-act="sheet-close">Not now</button>`;
    }
    default: return "";
  }
}

async function submitPasscode(id, code) {
  sheet = { kind: "passcode", id, busy: true };
  renderSheet();
  try {
    const r = await fetch("/api/unlock", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ code }) });
    if (!r.ok) { sheet = { kind: "passcode", id, error: "That passcode didn’t work. Check it and try again." }; return renderSheet(); }
    await loadBook(metaOf(id));
    if (!BOOKS[id]) { sheet = { kind: "passcode", id, error: "Unlocked, but the book didn’t load. Check your connection." }; return renderSheet(); }
    closeSheet({ silent: true });
    toast("Unlocked on this phone");
    if (route.name === "book" || route.name === "read") replace(location.hash);
    else go(`#/book/${id}`);
  } catch (e) {
    sheet = { kind: "passcode", id, error: "Couldn’t reach the server. Check your connection." };
    renderSheet();
  }
}

// ------------------------------------------------------------------ actions

function openBook(id) {
  const m = metaOf(id);
  if (!m) return;
  if (m.status !== "ready") return openSheet({ kind: "soon", id });
  if (PRIVATE_LOCKED.has(id)) return openSheet({ kind: "passcode", id });
  go(`#/book/${id}`);
}

function openChapter(bookId, ch, post = null, fromSheet = false) {
  const lock = lockOf(bookId, ch);
  if (lock.kind !== "open" && !fromSheet) return openSheet({ kind: "locked", id: bookId, ch });
  const preview = lock.kind !== "open";
  const start = preview ? 0 : post ?? resumePost(bookId, ch);
  const hash = `#/read/${bookId}/${ch}?p=${start}${preview ? "&preview=1" : ""}`;
  if (route.name === "read" || route.name === "done") replace(hash);
  else go(hash);
}

function setMode(bookId, m) {
  update((s) => ({ ...s, modes: { ...s.modes, [bookId]: m } }));
  toast(m === R.DAILY ? `Daily mode: one chapter a day at ${R.hourLabel(S.settings.releaseHour)}` : "Binge mode: next chapter opens right away");
}

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) {
    e.preventDefault();
    const hash = nav.dataset.nav;
    if (sheet) closeSheet({ silent: true });
    if (hash === "#/") { depth = 0; history.replaceState(null, "", "#/"); return render(); }
    if (route.name === "library") go(hash); else replace(hash);
    return;
  }
  const t = e.target.closest("[data-act]");
  if (!t || (app.querySelector(".reader") && app.querySelector(".reader").contains(t))) return;
  const d = t.dataset;
  switch (d.act) {
    case "back": return back();
    case "cat": category = d.cat; app.querySelectorAll(".chip").forEach((c) => { c.classList.toggle("on", c.dataset.cat === category); c.setAttribute("aria-selected", c.dataset.cat === category); }); document.getElementById("grid").innerHTML = bookGrid(); return fitHeadlines(app);
    case "book": return openBook(d.id);
    case "continue": return openChapter(d.id, +d.ch);
    case "how": return openSheet({ kind: "how" });
    case "start": {
      const book = BOOKS[d.id];
      const n = book.chapters.length;
      return R.completedCount(S, d.id) >= n ? openChapter(d.id, 1, 0) : openChapter(d.id, nextChapter(d.id));
    }
    case "mode": setMode(route.id, d.mode); return render();
    case "char": return openSheet({ kind: "char", id: route.id, charId: d.id });
    case "chapter": return openChapter(route.id, +d.ch);
    case "badge": return openSheet({ kind: "badge", id: route.id });
    case "readnow": {
      const next = route.ch + 1;
      update((s) => ({ ...s, modes: { ...s.modes, [route.id]: R.BINGE } }));
      return openChapter(route.id, next, 0);
    }
    case "tomorrow": return releaseTomorrow(route.id, route.ch);
    case "ics": return downloadIcs(route.id, route.ch);
    case "tobook": return replace(`#/book/${route.id}`);
    case "openpost": return openChapter(d.id, +d.ch, +d.i, true);
    case "set": {
      const v = d.k === "theme" ? d.v : Number(d.v);
      update((s) => ({ ...s, settings: { ...s.settings, [d.k]: v } }));
      return render();
    }
    case "rm": update((s) => ({ ...s, settings: { ...s.settings, reduceMotion: !s.settings.reduceMotion } })); return render();
    case "install": if (installPrompt) { installPrompt.prompt(); installPrompt = null; } return;
    case "reset": return openSheet({ kind: "reset" });
    case "reset-yes": {
      const keep = S.settings;
      S = R.emptyState(keep);
      persist();
      closeSheet({ silent: true });
      depth = 0;
      history.replaceState(null, "", "#/");
      render();
      return toast("Progress reset");
    }
    case "sheet-close": return closeSheet();
    case "binge-read": {
      setMode(d.id, R.BINGE);
      return openChapter(d.id, +d.ch);
    }
    case "preview": return openChapter(d.id, +d.ch, null, true);
    default:
  }
});

document.addEventListener("submit", (e) => {
  const f = e.target.closest("[data-form=pass]");
  if (!f) return;
  e.preventDefault();
  const code = new FormData(f).get("code");
  if (code) submitPasscode(f.dataset.id, String(code).trim());
});

document.addEventListener("input", (e) => {
  if (e.target.id !== "q") return;
  query = e.target.value;
  document.getElementById("grid").innerHTML = bookGrid();
});

// Clicks inside the sheet that target reader-scoped actions (none) are handled above; reader actions are handled by the reader.
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet) closeSheet(); });

// ------------------------------------------------------------------ boot

applyPrefs();
app.innerHTML = `<div class="boot"><div class="logo">book<span>reel</span></div></div>`;
dataReady = loadData().then(() => {
  render();
  document.documentElement.classList.add("ready");
  document.fonts?.ready.then(() => fitHeadlines(app));
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

// Exposed for tests.
window.__bookreel = { get state() { return S; }, books: BOOKS, index: () => INDEX, version: VERSION, ready: () => dataReady };
