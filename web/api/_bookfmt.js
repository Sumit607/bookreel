// The Bookreel format for books converted on demand: prompts, response schemas, and the checks/fixes that
// make whatever the model returns safe to render (20 chapters × 10 posts, same rules as content/src/build.py).

const ART = {
  board: "an airport departures board", parking: "a car parked in the boss's space", hill: "a factory seen from a hill",
  clock: "a digital clock at night (artText TIME|PLACE)", skyline: "a city skyline at dawn", trail: "hikers on a forest trail",
  dice: "dice and matchsticks", house: "a dark house with one lit window", machine: "a machine with a status light",
  stamp: "a rubber stamp (artText WORD|SMALL LINE)", drum: "a drum and a rope", bars: "rising bar chart", chain: "a chain with one weak link",
  lens: "a magnifying glass over a bloody word on a wall", fog: "a gas lamp in London fog", door: "a front door (artText NUMBER|CAPTION)",
  desert: "a salt desert under hard sun", countdown: "a number chalked on a wall (artText NUMBER|CAPTION)", pills: "a box with two pills",
  ring: "a gold wedding ring", cab: "a horse-drawn cab at night", lab: "a chemistry bench with test tubes", peaks: "mountains (artText CAPTION|day or CAPTION|night)",
};
const ART_KEYS = Object.keys(ART);
const TYPES = ["hook", "scene", "chat", "character", "twist", "poll", "guess", "crossoff", "myth", "idea", "list", "compare", "cliffhanger"];
const INTERACTIVE = new Set(["poll", "guess", "crossoff"]);
const THEMES = new Set(["paper", "night", "steel", "flash", "floor", "sodium"]);
const CATEGORIES = ["Mystery", "Romance", "Adventure", "Horror", "Sci-fi", "Classic", "Philosophy", "History", "Children", "Poetry", "Drama"];

const PALETTE = [
  ["#6B5B3A", "#3A3020", "#F6EBD2"], ["#1F3A3A", "#0E1E1E", "#CFF2E8"], ["#7E1D22", "#3F0C10", "#F6E7D6"], ["#2B2440", "#121018", "#F6C976"],
  ["#59606A", "#2C3440", "#F0ECE4"], ["#A8232C", "#4A0C12", "#FFF3EC"], ["#1A1830", "#0B0A18", "#F6C976"], ["#C9A24A", "#7A5E1F", "#1A1306"],
  ["#22324A", "#0E141C", "#F4A23C"], ["#6E5A2E", "#3E321A", "#FFF1D0"], ["#2E3A30", "#141C16", "#E9F2DF"], ["#8C2F39", "#3F1419", "#FFEDEE"],
  ["#E0A15A", "#9A5B22", "#1E140A"], ["#8FB8DE", "#4E7A5C", "#0F1A14"], ["#5A3E6B", "#2A1D33", "#F4EAF8"], ["#3A2B1F", "#1C140D", "#E9D9C2"],
  ["#1F3B57", "#0E1C2A", "#E6EEF6"], ["#241A1E", "#120D10", "#E2B65A"], ["#2E9C5A", "#14512D", "#06190D"], ["#17191C", "#3A2410", "#F4A23C"],
];
const CHAR_COLORS = ["#7E1D22", "#2F5F8A", "#6B5B3A", "#3E5F2F", "#7A4F8F", "#A0522D", "#2E7D7A", "#8C6D1F", "#59626E", "#C05A7A", "#9C3B1E", "#3A3340", "#4A4F57", "#8E6B3E"];

// ------------------------------------------------------------------ prompts

const PLAN_SYSTEM = `You plan Bookreel adaptations. Bookreel retells a whole book as exactly 20 chapters of 10 short swipeable posts, like an Instagram carousel that people finish an hour at a time.
You get the text of a public-domain book (or the reader's own file), already cut into 20 consecutive parts. Plan one Bookreel chapter per part, in the same order.
Rules:
- Be faithful. Never invent events, people, places or facts. Retell in your own words.
- chapters: exactly 20, n = 1..20. title: 1-4 words, evocative, no numbers. hook: one line of at most 22 words that makes someone want to read that chapter, without giving away its ending. summary: 2-4 plain sentences of what actually happens in that part, with names.
- characters: the 5-14 people (or animals, creatures) that matter most. id: one short lowercase ascii word, unique. name: as in the book. short: what posts call them (1-2 words). role: at most 6 words. bio: at most 35 words, no spoilers beyond their first chapter. traits: 2-3 tags of 1-3 words. firstChapter: the Bookreel chapter (1-20) where they first appear.
- narrator: the id of the first-person narrator if the book is told in the first person, otherwise "".
- category: one of ${CATEGORIES.join(", ")}. blurb: one sentence of at most 28 words for the book card, no spoilers.
- loops: 2-4 "guess loops": a question the reader guesses in an earlier chapter that a later chapter answers (who did it, what a clue means, whether someone survives). loopId: one short lowercase word. askChapter < payoffChapter. question: at most 20 words. Only questions the book really answers.`;

const CHAPTER_SYSTEM = `You write one chapter of a Bookreel: a faithful retelling of one part of a book as exactly 10 short posts that someone swipes through on a phone.
Write in plain, vivid English, mostly present tense, short sentences. Use your own words; quote at most a short famous line. Never invent events, people or facts that are not in the text you are given. Keep names exactly as in the character list.

The 10 posts, in order:
1. Post 1 is type "hook": kicker = place or time (at most 6 words), head = the punchy line (at most 14 words), sub = one more line (at most 22 words), art = one illustration key from the list below, artText = optional caption in CAPITALS (at most 4 words, or the two-part form the art needs).
2. Posts 2 to 9 tell this part of the story in order, mixing post types. Include exactly 1 or 2 interactive posts (poll, guess, crossoff) - never 0, never 3. Never use the same type twice in a row, except scene.
3. Post 10 is type "cliffhanger": text = at most 60 words that end on a question, threat or reveal that pulls into the next chapter. In the final chapter it is the ending instead and its t is "The end".
Every post has t: a 1-4 word title. No post may be longer than 85 words in total.

Post types and their fields:
- scene: label (where/when, at most 6 words), h (optional 2-5 word heading), text (40-70 words), foot (optional short line), theme: "paper" (default), "night" (dark or night scenes), "steel", or "flash" (flashbacks).
- chat: label, msgs = 3-7 messages {who: a character id from the list, text: at most 25 words}. Paraphrase real dialogue from the text.
- character: charId = a character id from the list. Use when someone important appears for the first time (at most one per chapter).
- twist: head (at most 10 words), text (at most 50 words), status (like "Lucy · Missing", at most 5 words). For a sudden turn.
- poll: label, q (at most 25 words, a "what would you do" or "what happens next" question), options = 2-3 {text at most 10 words, feedback at most 18 words}, reveal (what really happened, at most 45 words).
- guess: like poll plus loopId. ONLY use it when told to open a guess loop in this chapter; its reveal says the answer comes in a later chapter.
- crossoff: title (a question), items = 3-6 {text at most 6 words, why at most 18 words} that are wrong and get crossed off, answer (the right one, at most 5 words).
- myth: myth (a common misconception about this book or its subject, at most 20 words), truth (at most 40 words).
- idea: label, head (at most 10 words), sub (at most 40 words), theme "sodium" or "steel", payoffLoopId when it answers a guess loop (ONLY when told to).
- list: style "check" with h and items = 3-7 {text at most 10 words, state "ok", "warn" or "no"} plus text (at most 30 words); or style "receipt" with h, items = 3-7 {text, value at most 4 words}, total (at most 4 words) and text.
- compare: label, h, leftTitle, left (2-4 short items), rightTitle, right (2-4 short items), text (at most 35 words).

Illustration keys for the hook (pick the closest mood; "stamp" if nothing fits):
${ART_KEYS.map((k) => `- ${k}: ${ART[k]}`).join("\n")}

Also return: title (the planned chapter title), hook (the chapter's one-line teaser, at most 22 words), recap = exactly 3 lines of at most 16 words each that sum up what happened.`;

// ------------------------------------------------------------------ response schemas (Gemini OpenAPI subset)

const S = { type: "STRING" };
const planSchema = {
  type: "OBJECT",
  properties: {
    blurb: S, category: { type: "STRING", enum: CATEGORIES }, narrator: S,
    characters: { type: "ARRAY", items: { type: "OBJECT", properties: { id: S, name: S, short: S, role: S, bio: S, traits: { type: "ARRAY", items: S }, firstChapter: { type: "INTEGER" } }, required: ["id", "name", "short", "role", "bio", "firstChapter"] } },
    chapters: { type: "ARRAY", items: { type: "OBJECT", properties: { n: { type: "INTEGER" }, title: S, hook: S, summary: S }, required: ["n", "title", "hook", "summary"] } },
    loops: { type: "ARRAY", items: { type: "OBJECT", properties: { loopId: S, askChapter: { type: "INTEGER" }, payoffChapter: { type: "INTEGER" }, question: S }, required: ["loopId", "askChapter", "payoffChapter", "question"] } },
  },
  required: ["blurb", "category", "narrator", "characters", "chapters", "loops"],
};
const item = { type: "OBJECT", properties: { text: S, why: S, state: { type: "STRING", enum: ["ok", "warn", "no"] }, value: S } };
const postSchema = {
  type: "OBJECT",
  properties: {
    type: { type: "STRING", enum: TYPES }, t: S,
    kicker: S, head: S, sub: S, art: { type: "STRING", enum: ART_KEYS }, artText: S,
    label: S, h: S, text: S, foot: S, theme: S,
    msgs: { type: "ARRAY", items: { type: "OBJECT", properties: { who: S, text: S }, required: ["who", "text"] } },
    charId: S, status: S, q: S,
    options: { type: "ARRAY", items: { type: "OBJECT", properties: { text: S, feedback: S }, required: ["text", "feedback"] } },
    reveal: S, loopId: S, title: S, items: { type: "ARRAY", items: item }, answer: S,
    myth: S, truth: S, payoffLoopId: S, style: { type: "STRING", enum: ["check", "receipt"] }, total: S,
    leftTitle: S, left: { type: "ARRAY", items: S }, rightTitle: S, right: { type: "ARRAY", items: S },
  },
  required: ["type", "t"],
};
const chapterSchema = {
  type: "OBJECT",
  properties: { title: S, hook: S, recap: { type: "ARRAY", items: S }, posts: { type: "ARRAY", items: postSchema } },
  required: ["title", "hook", "recap", "posts"],
};

// ------------------------------------------------------------------ helpers

const str = (v, max = 400) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const words = (s) => (s ? String(s).split(/\s+/).filter(Boolean).length : 0);
const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 16);

function readingText(p) {
  switch (p.type) {
    case "hook": return `${p.head} ${p.sub}`;
    case "scene": return [p.h, p.text, p.foot].filter(Boolean).join(" ");
    case "chat": return p.msgs.map((m) => m.text).join(" ");
    case "poll": case "guess": return `${p.q} ${p.options.map((o) => o.text).join(" ")}`;
    case "crossoff": return p.items.map((i) => i.text).join(" ");
    case "myth": return `${p.myth} ${p.truth}`;
    case "idea": return `${p.head} ${p.sub}`;
    case "list": return `${p.h} ${p.items.map((i) => i.text).join(" ")} ${p.text || ""}`;
    case "compare": return `${p.h} ${[...p.left, ...p.right].join(" ")} ${p.text}`;
    case "twist": return `${p.head} ${p.text}`;
    case "cliffhanger": return p.text;
    default: return "";
  }
}

/** Cut a text to at most n words at a sentence end where possible. */
function trimWords(text, n) {
  const w = String(text || "").split(/\s+/).filter(Boolean);
  if (w.length <= n) return text;
  const cut = w.slice(0, n).join(" ");
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > cut.length * 0.5 ? cut.slice(0, end + 1) : cut.replace(/[,;:]?$/, "…");
}

function initials(name) {
  const parts = String(name).replace(/[^A-Za-z\s.'-]/g, "").split(/\s+/).filter((p) => p && !/^(the|of|de|von|van|mr|mrs|dr|miss|sir|lady|lord)\.?$/i.test(p));
  return ((parts[0] || name || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// ------------------------------------------------------------------ plan

/** Make a model plan safe: exactly 20 chapters, unique character ids, loops that point forward. */
function normalizePlan(raw, partCount = 20) {
  const plan = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const characters = (Array.isArray(plan.characters) ? plan.characters : []).map((c, i) => {
    let id = slug(c.id) || slug(c.short) || slug(c.name) || `p${i}`;
    while (seen.has(id)) id += "x";
    seen.add(id);
    const name = str(c.name, 60) || id;
    return {
      id, name, short: str(c.short, 30) || name.split(" ")[0], initials: initials(name).slice(0, 3),
      color: CHAR_COLORS[i % CHAR_COLORS.length], firstChapter: Math.min(20, Math.max(1, parseInt(c.firstChapter, 10) || 1)),
      role: str(c.role, 60), bio: str(c.bio, 300), traits: (Array.isArray(c.traits) ? c.traits : []).map((t) => str(t, 24)).filter(Boolean).slice(0, 3),
    };
  }).slice(0, 16);
  const byN = new Map((Array.isArray(plan.chapters) ? plan.chapters : []).map((c, i) => [parseInt(c.n, 10) || i + 1, c]));
  const chapters = [];
  for (let n = 1; n <= partCount; n++) {
    const c = byN.get(n) || {};
    chapters.push({ n, title: str(c.title, 40) || `Part ${n}`, hook: str(c.hook, 200), summary: str(c.summary, 900) });
  }
  const loopIds = new Set();
  const loops = (Array.isArray(plan.loops) ? plan.loops : []).map((l) => ({
    loopId: slug(l.loopId) || "", askChapter: parseInt(l.askChapter, 10), payoffChapter: parseInt(l.payoffChapter, 10), question: str(l.question, 160),
  })).filter((l) => l.loopId && l.askChapter >= 1 && l.payoffChapter > l.askChapter && l.payoffChapter <= partCount && !loopIds.has(l.loopId) && loopIds.add(l.loopId)).slice(0, 4);
  // at most one loop opened per chapter
  const asked = new Set();
  const usable = loops.filter((l) => !asked.has(l.askChapter) && asked.add(l.askChapter));
  const narrator = characters.some((c) => c.id === slug(plan.narrator)) ? slug(plan.narrator) : "";
  return {
    blurb: str(plan.blurb, 220), category: CATEGORIES.includes(plan.category) ? plan.category : "Classic",
    narrator, characters, chapters, loops: usable,
  };
}

// ------------------------------------------------------------------ chapter

function speakerFor(who, chars, extra) {
  const w = String(who || "").trim();
  const k = slug(w);
  const hit = chars.find((c) => c.id === k) || chars.find((c) => slug(c.short) === k || slug(c.name) === k)
    || chars.find((c) => slug(c.name).includes(k) && k.length >= 3);
  if (hit) return hit.id;
  if (!k) return null;
  if (!extra.some((c) => c.id === k)) {
    const name = w.length > 1 ? w : k;
    extra.push({ id: k, name, short: name, initials: initials(name).slice(0, 3), color: "#59626E", firstChapter: 1, role: "", bio: "", traits: [] });
  }
  return k;
}

function asScene(p, why) {
  const text = [p.head, p.text, p.sub, p.q, p.reveal, p.truth, p.myth].map((x) => str(x, 600)).filter(Boolean).join(" ");
  return { type: "scene", t: str(p.t, 40) || "Meanwhile", label: str(p.label, 60) || "", text: trimWords(text || why || "…", 80), theme: "paper" };
}

/** Turn one raw model post into a post the app can render. */
function normalizePost(p, ctx) {
  const t = str(p.t, 40);
  const base = (type, fields) => ({ type, t: t || type[0].toUpperCase() + type.slice(1), ...fields });
  switch (p.type) {
    case "hook": {
      const art = ART_KEYS.includes(p.art) ? p.art : "stamp";
      const post = base("hook", { kicker: str(p.kicker, 60) || "Chapter " + ctx.n, head: str(p.head, 160) || ctx.plan.hook || ctx.plan.title, sub: str(p.sub, 220), art });
      const at = str(p.artText, 60).toUpperCase();
      if (at) post.artText = at;
      else if (art === "stamp") post.artText = ctx.plan.title.toUpperCase().slice(0, 12);
      return post;
    }
    case "scene": {
      if (!str(p.text)) return asScene(p);
      const post = base("scene", { label: str(p.label, 60), text: str(p.text, 900), theme: THEMES.has(p.theme) ? p.theme : "paper" });
      if (str(p.h)) post.h = str(p.h, 60);
      if (str(p.foot)) post.foot = str(p.foot, 160);
      return post;
    }
    case "chat": {
      const msgs = (Array.isArray(p.msgs) ? p.msgs : []).map((m) => ({ who: speakerFor(m.who, ctx.characters, ctx.extra), text: str(m.text, 220) })).filter((m) => m.who && m.text).slice(0, 8);
      if (msgs.length < 2) return asScene(p, msgs.map((m) => m.text).join(" "));
      return base("chat", { label: str(p.label, 60), msgs });
    }
    case "character": {
      const id = speakerFor(p.charId, ctx.characters, []);
      if (!id || !ctx.characters.some((c) => c.id === id)) return asScene(p);
      return { type: "character", t: t || "Meet " + ctx.characters.find((c) => c.id === id).short, charId: id };
    }
    case "twist":
      return base("twist", { head: str(p.head, 120) || t, text: str(p.text, 500), status: str(p.status, 60) || "Status · Changed" });
    case "poll": case "guess": {
      const options = (Array.isArray(p.options) ? p.options : []).map((o) => ({ text: str(o.text, 120), feedback: str(o.feedback, 200) })).filter((o) => o.text).slice(0, 4);
      if (options.length < 2 || !str(p.q)) return asScene(p);
      const loop = p.type === "guess" && !ctx.guessUsed ? ctx.ask : null;
      if (loop) {
        ctx.guessUsed = true;
        return base("guess", { label: str(p.label, 60) || "Your guess", q: str(p.q, 220), options, reveal: str(p.reveal, 500) || `The answer comes in Chapter ${loop.payoffChapter}.`,
          hint: `Pick your answer. We’ll keep it for Chapter ${loop.payoffChapter}.`, loopId: loop.loopId });
      }
      return base("poll", { label: str(p.label, 60) || "You decide", q: str(p.q, 220), options, reveal: str(p.reveal, 500), hint: "Pick one to see what actually happened." });
    }
    case "crossoff": {
      const items = (Array.isArray(p.items) ? p.items : []).map((i) => ({ text: str(i.text, 80), why: str(i.why, 200) })).filter((i) => i.text).slice(0, 6);
      if (items.length < 2 || !str(p.answer)) return asScene(p);
      const post = base("crossoff", { title: str(p.title, 120) || "Cross them off", items, answer: str(p.answer, 60) });
      return post;
    }
    case "myth":
      if (!str(p.myth) || !str(p.truth)) return asScene(p);
      return base("myth", { myth: str(p.myth, 200), truth: str(p.truth, 400) });
    case "idea": {
      const post = base("idea", { label: str(p.label, 60) || "The idea", head: str(p.head, 120) || t, sub: str(p.sub, 400), theme: p.theme === "steel" ? "steel" : "sodium" });
      if (str(p.payoffLoopId)) Object.defineProperty(post, "_payoff", { value: slug(p.payoffLoopId), enumerable: false });
      return post;
    }
    case "list": {
      const receipt = p.style === "receipt";
      const items = (Array.isArray(p.items) ? p.items : []).map((i) => receipt
        ? { text: str(i.text, 80), value: str(i.value, 40) || "·" }
        : { text: str(i.text, 100), state: ["ok", "warn", "no"].includes(i.state) ? i.state : "ok" }).filter((i) => i.text).slice(0, 8);
      if (items.length < 2) return asScene(p);
      const post = base("list", { label: str(p.label, 60), h: str(p.h, 80) || t, items, style: receipt ? "receipt" : "check", theme: receipt ? "steel" : "paper" });
      if (receipt) post.total = str(p.total, 40) || "·";
      if (str(p.text)) post.text = str(p.text, 300);
      return post;
    }
    case "compare": {
      const left = (Array.isArray(p.left) ? p.left : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 5);
      const right = (Array.isArray(p.right) ? p.right : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 5);
      if (!left.length || !right.length) return asScene(p);
      return base("compare", { label: str(p.label, 60), h: str(p.h, 80) || t, leftTitle: str(p.leftTitle, 30) || "Before", left, rightTitle: str(p.rightTitle, 30) || "After", right, text: str(p.text, 300), mid: "?" });
    }
    case "cliffhanger":
      return { type: "cliffhanger", t: ctx.n === ctx.total ? "The end" : t || "To be continued", text: str(p.text, 600) || ctx.plan.summary };
    default:
      return asScene(p);
  }
}

/**
 * Check and repair one chapter. Returns { chapter, hard: [...problems that need a retry], fixed: [...] }.
 * ctx: { n, total, plan (this chapter's plan), characters, ask (loop opened here), payoff (loop closed here) }
 */
function normalizeChapter(raw, ctx) {
  const hard = [], fixed = [];
  const extra = [];
  const c = { ...ctx, extra, guessUsed: false };
  let posts = (raw && Array.isArray(raw.posts) ? raw.posts : []).map((p) => normalizePost(p || {}, c));
  if (posts.length > 10) {
    const cliff = posts.map((p) => p.type).lastIndexOf("cliffhanger");
    posts = cliff > 0 ? [...posts.slice(0, cliff).filter((p) => p.type !== "cliffhanger").slice(0, 9), posts[cliff]] : posts.slice(0, 10);
    fixed.push("trimmed to 10 posts");
  }
  // a hook or cliffhanger anywhere but its own slot becomes a scene
  posts = posts.map((p, i) => ((p.type === "hook" && i > 0) || (p.type === "cliffhanger" && i < posts.length - 1) ? asScene(p) : p));
  // the payoff goes on the idea that names the loop, else on the first idea
  if (ctx.payoff) {
    const ideas = posts.filter((p) => p.type === "idea");
    const target = ideas.find((p) => p._payoff === ctx.payoff.loopId) || ideas[0];
    if (target) target.payoffLoopId = ctx.payoff.loopId;
  }
  if (posts.length < 8) hard.push(`only ${posts.length} posts; write exactly 10`);
  if (posts[0] && posts[0].type !== "hook") hard.push("post 1 must be the hook");
  const last = posts[posts.length - 1];
  if (last && last.type !== "cliffhanger") hard.push("post 10 must be the cliffhanger");
  // interactive count: 1-2
  let inter = posts.filter((p) => INTERACTIVE.has(p.type));
  if (inter.length === 0) hard.push("include 1 or 2 interactive posts (poll, guess or crossoff)");
  while (inter.length > 2) { const p = inter.pop(); posts[posts.indexOf(p)] = asScene(p); fixed.push("too many interactive posts"); }
  // a guess must exist where a loop opens; a payoff idea where one closes
  if (ctx.ask && !posts.some((p) => p.type === "guess")) {
    const poll = posts.find((p) => p.type === "poll");
    if (poll) { Object.assign(poll, { type: "guess", label: "Your guess", loopId: ctx.ask.loopId, hint: `Pick your answer. We’ll keep it for Chapter ${ctx.ask.payoffChapter}.` }); fixed.push("poll became the guess"); }
    else hard.push(`open guess loop "${ctx.ask.loopId}" with a guess post asking: ${ctx.ask.question}`);
  }
  if (ctx.payoff && !posts.some((p) => p.payoffLoopId === ctx.payoff.loopId)) hard.push(`answer guess loop "${ctx.payoff.loopId}" with an idea post that has payoffLoopId`);
  // same type twice in a row: swap with a later post when possible, else turn into a scene
  for (let i = 2; i < posts.length - 1; i++) {
    if (posts[i].type === posts[i - 1].type && posts[i].type !== "scene") {
      const j = posts.findIndex((p, k) => k > i && k < posts.length - 1 && p.type !== posts[i].type && p.type !== posts[i - 1].type);
      if (j > 0) [posts[i], posts[j]] = [posts[j], posts[i]];
      else posts[i] = asScene(posts[i]);
      fixed.push(`reordered post ${i + 1}`);
    }
  }
  // length limit
  posts.forEach((p) => {
    if (words(readingText(p)) <= 85) return;
    for (const f of ["text", "sub", "truth", "reveal"]) if (p[f]) p[f] = trimWords(p[f], Math.max(20, words(p[f]) - (words(readingText(p)) - 85)));
    if (p.type === "chat") while (words(readingText(p)) > 85 && p.msgs.length > 2) p.msgs.pop();
    if (words(readingText(p)) > 85 && p.type === "scene") p.text = trimWords(p.text, 70);
    fixed.push("shortened a long post");
  });
  const recap = (raw && Array.isArray(raw.recap) ? raw.recap : []).map((r) => str(r, 140)).filter(Boolean).slice(0, 3);
  const fill = String(ctx.plan.summary || "").split(/(?<=[.!?])\s+/).filter(Boolean);
  while (recap.length < 3) recap.push(str(fill[recap.length] || fill[0] || ctx.plan.title, 140));
  const chapter = {
    n: ctx.n, title: str(raw && raw.title, 40) || ctx.plan.title, hook: str(raw && raw.hook, 200) || ctx.plan.hook,
    recap, posts: posts.map((p, i) => ({ id: `${ctx.n}-${i + 1}`, ...p })),
  };
  return { chapter, hard, fixed, extra };
}

// ------------------------------------------------------------------ prompts with data

function planPrompt({ title, authors, parts }) {
  return `Book: ${title}${authors && authors.length ? ` by ${authors.join(", ")}` : ""}\n\n` +
    parts.map((p, i) => `=== PART ${i + 1} OF ${parts.length} ===\n${p}`).join("\n\n");
}

function chapterPrompt({ title, authors, plan, n, text, prevCliff, ask, payoff, retry }) {
  const chars = plan.characters.map((c) => `- ${c.id}: ${c.name} (${c.role || "character"}), first appears in chapter ${c.firstChapter}`).join("\n");
  const outline = plan.chapters.map((c) => `${c.n}. ${c.title}: ${c.summary}`).join("\n");
  const me = plan.chapters[n - 1];
  let task = `Write Bookreel chapter ${n} of ${plan.chapters.length}: "${me.title}". Planned teaser: ${me.hook}\nWhat happens: ${me.summary}`;
  if (ask) task += `\nOPEN guess loop "${ask.loopId}" in this chapter with ONE guess post (loopId "${ask.loopId}") asking: ${ask.question} Its answer comes in chapter ${ask.payoffChapter}, so do not reveal it.`;
  if (payoff) task += `\nANSWER guess loop "${payoff.loopId}" (${payoff.question}) with ONE idea post whose payoffLoopId is "${payoff.loopId}".`;
  if (n === plan.chapters.length) task += `\nThis is the final chapter: post 10 is the ending, with t "The end".`;
  if (prevCliff) task += `\nThe previous chapter ended on: ${prevCliff}`;
  if (plan.narrator) task += `\nThe book is narrated in the first person by "${plan.narrator}"; in chats that character's messages appear on the right.`;
  if (retry && retry.length) task += `\nYour previous answer had these problems; fix them: ${retry.join("; ")}.`;
  return `Book: ${title}${authors && authors.length ? ` by ${authors.join(", ")}` : ""}\n\nCharacters (use these ids):\n${chars}\n\nWhole-book outline:\n${outline}\n\n${task}\n\n=== THE TEXT OF THIS PART ===\n${text}`;
}

// ------------------------------------------------------------------ book assembly (also used by the app)

function coverFor(category, hash) {
  const motif = { Mystery: "lens", Horror: "bolt", Romance: "diamond", Philosophy: "sun", History: "sun", "Sci-fi": "bolt" }[category] || "";
  const bg = { Mystery: "#7E1D22", Horror: "#173B3F", Romance: "#A9B79A", Adventure: "#1F3B57", "Sci-fi": "#22324A", Philosophy: "#121212", Children: "#E9C46A" }[category] || PALETTE[hash % PALETTE.length][0];
  const fg = { Romance: "#1E2A1C", Children: "#2A1D0A" }[category] || "#F6E7D6";
  return { bg, fg, motif, tag: category };
}

module.exports = {
  ART_KEYS, TYPES, PALETTE, PLAN_SYSTEM, CHAPTER_SYSTEM, planSchema, chapterSchema,
  normalizePlan, normalizeChapter, planPrompt, chapterPrompt, readingText, coverFor, words,
};
