// Local tests only (GEMINI_MOCK=1): a stand-in for Gemini that builds plausible plans and chapters from the text
// it is given, so the whole cloud conversion can be exercised without a key.
// GEMINI_MOCK_429=1: chapter 1 hits a short per-minute limit once (at most every 30 s).
// GEMINI_MOCK_DAYQUOTA=1: every Flash model says its daily quota is used up, so only Flash-Lite works.
let last429 = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sentences(text, n) {
  return (text.replace(/\s+/g, " ").match(/[^.!?]{25,220}[.!?]/g) || ["Something happens here."]).slice(0, n).map((s) => s.trim());
}

/** A run of 6-14 words copied exactly from the text, for quotes the quality check can find. */
function quoteFrom(text, i) {
  const w = text.replace(/\s+/g, " ").replace(/[“”"]/g, "").split(" ").filter(Boolean);
  const start = Math.min(Math.max(0, w.length - 12), 20 + i * 37);
  return w.slice(start, start + 9).join(" ").replace(/[,;:]$/, "");
}

function names(text) {
  const counts = {};
  for (const m of text.matchAll(/\b([A-Z][a-z]{2,12})\b/g)) {
    if (/^(The|And|But|When|Then|What|There|This|That|They|She|His|Her|Chapter|Letter|Part|Project|Gutenberg|Book|Yes|No|Mr|Mrs|Miss|Oh|In|It|He|We|You|My|On|At|As|If|So|For|Not|Of|To|All|One|Now|Who|Why|How|Our|Your)$/.test(m[1])) continue;
    counts[m[1]] = (counts[m[1]] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);
}

function plan(prompt) {
  const parts = prompt.split(/=== PART \d+ OF \d+[^\n]*===\n/).slice(1);
  const who = names(prompt);
  return {
    kind: "story",
    blurb: "A test book, planned by the stand-in writer.",
    category: "Classic",
    narrator: "",
    characters: (who.length >= 2 ? who : ["Alpha", "Beta"]).map((n, i) => ({ id: n.toLowerCase(), name: n, short: n, role: "A person in the story", bio: `${n} appears in this book.`, traits: ["Test"], firstChapter: 1 + i })),
    chapters: parts.map((p, i) => ({ n: i + 1, title: `Part ${i + 1}`, hook: sentences(p, 1)[0].slice(0, 120), summary: sentences(p, 3).join(" "), focus: "What happens next", quotes: [quoteFrom(p, 0), quoteFrom(p, 1)] })),
    loops: [{ loopId: "secret", askChapter: 2, payoffChapter: 5, question: "What is the secret?" }],
  };
}

function chapter(prompt) {
  const n = +(prompt.match(/Write Bookreel chapter (\d+)/) || [0, 1])[1];
  const text = prompt.split("=== THE TEXT OF THIS PART ===\n")[1] || "";
  const s = sentences(text, 12);
  const ids = [...prompt.split("Whole-book outline:")[0].matchAll(/^- ([a-z0-9]+): /gm)].map((m) => m[1]);
  const ask = (prompt.match(/OPEN guess loop "([a-z0-9]+)"/) || [])[1];
  const pay = (prompt.match(/ANSWER guess loop "([a-z0-9]+)"/) || [])[1];
  const q1 = quoteFrom(text, 0), q2 = quoteFrom(text, 2);
  const posts = [
    { type: "hook", t: "Opening", kicker: `Part ${n}`, head: `“${q1}”`, sub: s[1] || s[0], art: ["fog", "lens", "door", "house", "clock"][n % 5], artText: n % 5 === 4 ? "9:00 PM|TOWN" : "" },
    { type: "scene", t: "What happens", label: "The story so far", text: `${s[2] || s[0]} ${s[3] || ""}`.trim(), theme: "paper" },
    { type: "chat", t: "Talk", label: "A conversation", msgs: [{ who: ids[0] || "alpha", text: (s[4] || s[0]).slice(0, 120) }, { who: ids[1] || "beta", text: (s[5] || s[1] || s[0]).slice(0, 120) }] },
    ask
      ? { type: "guess", t: "Your guess", label: "Your guess", q: "What is the secret?", options: [{ text: "Something old", feedback: "Hold that thought." }, { text: "Something new", feedback: "Hold that thought." }], reveal: "The answer comes later.", loopId: ask }
      : { type: "poll", t: "You decide", label: "You decide", q: "What would you do next?", options: [{ text: "Go on", feedback: "Brave." }, { text: "Turn back", feedback: "Careful." }], reveal: s[6] || s[0] },
    { type: "scene", t: "Then", label: "Later", text: `${s[7] || s[0]} ${s[3] || ""}`.trim(), theme: "night" },
    { type: "idea", t: "The point", label: pay ? "The answer" : "The idea", head: "What it means", sub: `“${q2}” ${s[8] || s[0]}`.slice(0, 220), theme: "sodium", ...(pay ? { payoffLoopId: pay } : {}) },
    { type: "twist", t: "A turn", head: "Then everything changes.", text: s[9] || s[0], status: "Story · Turning" },
    { type: "list", t: "So far", style: "check", h: "Where things stand", items: [{ text: "Someone arrived", state: "ok" }, { text: "Something is wrong", state: "warn" }, { text: "Nobody is safe", state: "no" }], text: "" },
    { type: "scene", t: "Try it today", label: "Try it today", text: `${s[10] || s[0]} ${s[9] || ""}`.trim(), theme: "steel" },
    { type: "cliffhanger", t: "To be continued", text: s[11] || "And then the door opened." },
  ];
  return { title: `Part ${n}`, hook: s[0].slice(0, 120), recap: [s[0].slice(0, 90), (s[1] || s[0]).slice(0, 90), (s[2] || s[0]).slice(0, 90)], posts };
}

async function generate({ model, system, prompt }) {
  await sleep(150);
  const { GeminiError } = require("./_gemini.js");
  const isPlan = /You plan Bookreel adaptations/.test(system);
  if (process.env.GEMINI_MOCK_DAYQUOTA === "1" && !/lite/.test(model)) {
    const e = new GeminiError("The free Gemini quota needs a short break.", 429, 50000);
    e.daily = true;
    throw e;
  }
  if (!isPlan && process.env.GEMINI_MOCK_429 === "1" && /Write Bookreel chapter 1 /.test(prompt) && Date.now() - last429 > 30000) {
    last429 = Date.now();
    throw new GeminiError("The free Gemini quota needs a short break.", 429, 2);
  }
  return { data: isPlan ? plan(prompt) : chapter(prompt), usage: {} };
}

module.exports = { generate };
