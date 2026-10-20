// Renders each of the 14 post types to HTML, ported from the Android PostCards.kt.
import { esc, pad2, icon } from "./util.js";
import { hookArt } from "./art.js";
import { postKey } from "./rules.js";

const up = (s) => esc(String(s ?? "").toUpperCase());
const prose = (text, cls = "") => `<p class="prose ${cls}">${esc(text)}</p>`;
const foot = (text) => `<p class="foot">${esc(text)}</p>`;
const h3 = (text) => `<h3 class="h3 hl">${up(text)}</h3>`;
const label = (text) => `<div class="lbl">${up(text)}</div>`;

/** Label pinned at the top; content centred vertically, scrolling only when it overflows. */
function frame(theme, lbl, inner, { top = false, cls = "" } = {}) {
  return `<div class="frame th-${theme} ${cls}">${lbl ? label(lbl) : ""}<div class="body"><div class="inner${top ? " top" : ""}">${inner}</div></div></div>`;
}

export function renderCard(ctx, post, index) {
  switch (post.type) {
    case "hook": return hookCard(ctx, post);
    case "scene": return sceneCard(post);
    case "chat": return chatCard(ctx, post);
    case "character": return characterCard(ctx, post);
    case "twist": return twistCard(post);
    case "poll": return choiceCard(ctx, post, index, "What happened");
    case "guess": return choiceCard(ctx, post, index, post.revealLabel || (ctx.book.id === "the-goal" && ctx.ch === 2 ? "What Jonah said" : "The answer, for now"));
    case "crossoff": return crossoffCard(ctx, post, index);
    case "myth": return mythCard(post);
    case "idea": return ideaCard(ctx, post);
    case "list": return listCard(post);
    case "compare": return compareCard(post);
    case "artifact": return artifactCard(post);
    case "cliffhanger": return cliffCard(ctx, post);
    default: return frame("steel", "Post", prose(post.text || "This post needs a newer version of the app."));
  }
}

function hookCard(ctx, post) {
  const chapter = ctx.book.chapters[ctx.ch - 1];
  return `<div class="hook">
    ${label(`Chapter ${pad2(ctx.ch)} of ${ctx.book.chapters.length} · ${chapter.minutes || 3} min · ${post.kicker}`)}
    <div class="hook-art">${hookArt(post.art, post.artText)}</div>
    <h2 class="hook-h hl">${up(post.head)}</h2>
    <p class="hook-sub">${esc(post.sub)}</p>
    <div class="cue">${ctx.previewOnly ? "Preview · tap to see when it unlocks" : "Tap to start"} <span class="cue-a">${icon("arrow", { size: 18 })}</span></div>
  </div>`;
}

function sceneCard(post) {
  let inner = "";
  if (post.h) inner += h3(post.h);
  if (post.extra === "reportcard") inner += reportCard();
  inner += prose(post.text);
  if (post.foot) inner += foot(post.foot);
  return frame(post.theme || "paper", post.label, inner);
}

function reportCard() {
  return `<div class="reportcard"><div class="rc-h"><span>REPORT CARD</span><span>SHARON R.</span></div><div class="rc-g">${"<b>A</b>".repeat(5)}</div></div>`;
}

function chatCard(ctx, post) {
  const narrator = ctx.book.narrator;
  let prev = null;
  const msgs = post.msgs.map((m, j) => {
    const me = m.who === narrator;
    const first = m.who !== prev;
    prev = m.who;
    const who = ctx.book.characters.find((c) => c.id === m.who);
    const av = me ? "" : first
      ? `<span class="av" style="background:${esc(who?.color || "#555")}">${esc(who?.initials || "?")}</span>`
      : `<span class="av blank"></span>`;
    return `<div class="msg ${me ? "me" : "them"}${first ? " first" : ""}" style="--i:${j}">${av}<div class="bubble">${first ? `<div class="who">${up(who?.short || m.who)}</div>` : ""}<div class="mt">${esc(m.text)}</div></div></div>`;
  }).join("");
  return frame("chat", post.label, `<div class="chat">${msgs}</div>`, { top: true });
}

function characterCard(ctx, post) {
  const c = ctx.book.characters.find((x) => x.id === post.charId);
  if (!c) return frame("steel", "New character unlocked", prose("A new character joins the story."));
  return frame("steel", "New character unlocked", `
    <div class="char-top"><div class="ring"><span class="av big" style="background:${esc(c.color)}">${esc(c.initials)}</span></div>
      <div><h3 class="h3 hl">${up(c.name)}</h3><div class="role">${esc(c.role)}</div></div></div>
    ${prose(c.bio)}
    <div class="traits">${c.traits.map((t) => `<span>${esc(t)}</span>`).join("")}</div>`);
}

function twistCard(post) {
  return `<div class="twist"><div class="twist-in">${frame("steel", null, `
    <span class="twist-tag">PLOT TWIST</span>
    <h2 class="twist-h hl">${up(post.head)}</h2>
    ${prose(post.text)}
    <div class="status"><i></i>${up(post.status)}</div>`)}</div></div>`;
}

function choiceCard(ctx, post, index, revealLabel) {
  const answer = ctx.state.answers[postKey(ctx.book.id, post.id)];
  const answered = answer !== undefined;
  const opts = post.options.map((o, j) => {
    const sel = answer === j;
    const inner = `<span class="opt-k">${"ABCD"[j]}</span><span class="opt-t">${esc(o.text)}</span>`;
    // Once answered, options become plain text so a tap on them moves to the next post like anywhere else.
    return answered
      ? `<div class="opt${sel ? " sel" : " dim"}">${inner}</div>`
      : `<button class="opt" data-act="answer" data-post="${index}" data-opt="${j}">${inner}</button>`;
  }).join("");
  const after = answered
    ? `<div class="fb">${esc(post.options[answer].feedback)}</div><div class="reveal"><div class="lbl">${up(revealLabel)}</div><p>${esc(post.reveal)}</p></div>`
    : `<div class="hint">${esc(post.hint || "Pick one to see what actually happened.")}</div>`;
  return frame("steel", post.label, `<h2 class="q hl">${up(post.q)}</h2><div class="opts">${opts}</div>${after}`, { cls: "choice" });
}

function crossoffCard(ctx, post, index) {
  const crossed = ctx.state.crossed[postKey(ctx.book.id, post.id)] || [];
  const all = crossed.length >= post.items.length;
  const items = post.items.map((it, j) => {
    const x = crossed.includes(j);
    const why = x && ctx.lastCross === `${post.id}:${j}` ? `<div class="why">${esc(it.why)}</div>` : "";
    return x
      ? `<div class="xi x"><span class="t">${esc(it.text)}</span>${why}</div>`
      : `<div class="xi"><button class="t" data-act="cross" data-post="${index}" data-item="${j}">${esc(it.text)}</button></div>`;
  }).join("");
  const end = all
    ? `<div class="left">What’s left? <span class="circled">${esc(post.answer)}</span></div>${post.note ? `<div class="why">${esc(post.note)}</div>` : ""}`
    : `<div class="xcount">TAP EACH ONE TO CROSS IT OFF · ${crossed.length} OF ${post.items.length}</div>`;
  return `<div class="pad-wrap"><div class="pad">${frame("pad", null, `<div class="pad-h"><span class="pad-t">${esc(post.title)}</span><span class="pad-k">LEGAL PAD</span></div>${items}<div class="pad-gap"></div>${end}`, { top: true })}</div></div>`;
}

function mythCard(post) {
  return `<div class="myth"><div class="half m"><span class="tag red"><i></i>MYTH</span><h2 class="mt hl">${up(post.myth)}</h2></div><div class="half t"><span class="tag green"><i></i>TRUTH</span><h2 class="mt hl">${up(post.truth)}</h2></div></div>`;
}

function meters() {
  return `<div class="meters">${["Net profit", "Return on investment", "Cash flow"].map((n, j) => `
    <div class="meter" style="--j:${j}"><svg viewBox="0 0 100 58"><path d="M10 50A40 40 0 0 1 90 50" class="m-bg"/><path d="M10 50A40 40 0 0 1 90 50" class="m-fg" pathLength="100"/><g class="needle"><line x1="50" y1="50" x2="17" y2="50"/></g><circle cx="50" cy="50" r="4.5"/></svg><div class="m-n">${up(n)}</div><div class="m-u">▲ up</div></div>`).join("")}</div>`;
}

function ideaCard(ctx, post) {
  const guess = post.payoffLoopId ? ctx.state.guesses[postKey(ctx.book.id, post.payoffLoopId)] : null;
  const theme = post.theme || "sodium";
  let inner = "";
  if (post.visual === "meters") inner += meters();
  inner += `<h2 class="idea-h hl${post.visual === "meters" ? " small" : ""}">${up(post.head)}</h2><p class="prose idea-sub">${esc(post.sub)}</p>`;
  if (guess) inner += `<div class="your-guess ${theme === "sodium" ? "on-sodium" : ""}">Your guess earlier: ${esc(guess)}</div>`;
  return frame(theme, post.label, inner, { cls: "idea" });
}

function listCard(post) {
  const theme = post.theme || "paper";
  if (post.style === "receipt") {
    const rows = post.items.map((it) => `<div class="rrow"><span>${esc(it.text)}</span><i></i><b>${esc(it.value || "")}</b></div>`).join("");
    const total = post.total ? `<div class="rtotal"><span>TOTAL</span><span>${up(post.total)}</span></div>` : "";
    return frame(theme, null, `<div class="receipt">${label(post.label)}<h3 class="r-h hl">${up(post.h)}</h3>${rows}${total}</div>${post.text ? prose(post.text, "small") : ""}`);
  }
  const marks = { warn: ["warn", "!"], no: ["no", "✕"] };
  const items = post.items.map((it) => {
    const [cls, mark] = marks[it.state] || ["ok", "✓"];
    return `<li class="${cls}"><span class="mark">${mark}</span><span>${esc(it.text)}</span></li>`;
  }).join("");
  return frame(theme, post.label, `${h3(post.h)}<ul class="checks">${items}</ul>${post.text ? prose(post.text, "small") : ""}`);
}

function compareCard(post) {
  const col = (t, items) => `<div class="ccol"><div class="ct">${up(t)}</div>${items.map((x) => `<div>${esc(x)}</div>`).join("")}</div>`;
  return frame("paper", post.label, `${h3(post.h)}<div class="compare">${col(post.leftTitle, post.left)}<span class="mid">${esc(post.mid || "?")}</span>${col(post.rightTitle, post.right)}</div>${prose(post.text, "small")}`);
}

function artifactCard(post) {
  const steps = post.route.map((s, j) => `<div class="step ${esc(s.state)}${j === post.route.length - 1 ? " last" : ""}"><span class="dot"></span><div><div class="st">${esc(s.text)}</div>${s.note ? `<div class="sn">${esc(s.note)}</div>` : ""}</div></div>`).join("");
  return frame("paper", null, `<div class="ticket-top"><div>${label(post.label)}<div class="tnum">${esc(post.number)}</div></div>${post.badge ? `<span class="tbadge">${up(post.badge)}</span>` : ""}</div><div class="rule"></div><div class="route">${steps}</div>${post.text ? prose(post.text) : ""}${post.foot ? foot(post.foot) : ""}`);
}

function cliffCard(ctx, post) {
  const n = ctx.book.chapters.length;
  const next = ctx.ch < n ? ctx.book.chapters[ctx.ch] : null;
  const bg = next ? `linear-gradient(135deg, ${next.bg}, ${next.bg2 || next.bg})` : "linear-gradient(135deg, #E0611C, #1B2026)";
  const box = next
    ? `${label(`Next · Chapter ${pad2(next.n)}`)}<h3 class="cl-t hl">${up(next.title)}</h3><p class="cl-hook">${esc(next.hook)}</p>`
    : `${label("Book complete")}<h3 class="cl-t hl">YOU FINISHED ${up(ctx.book.title)}</h3><p class="cl-hook">Finish to collect the book badge.</p>`;
  const btn = ctx.previewOnly ? "See when it unlocks" : next ? "Finish chapter" : "Finish the book";
  return `<div class="cliff" style="background:${bg}"><div class="cliff-in">
    <div class="cl-h">${next ? "TO BE CONTINUED" : "THE END"}</div>
    <div class="cl-text"><p>${esc(post.text)}</p></div>
    <div class="cl-box">${box}</div>
    <button class="cl-btn" data-act="finish">${btn}</button></div></div>`;
}
