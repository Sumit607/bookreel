// Unlock, streak, XP and badge rules. Pure functions of state + time, ported from the Android app's Rules.kt.

export const XP_CHAPTER = 100;
export const XP_ANSWER = 20;
export const XP_BOOK = 500;
export const XP_STREAK7 = 200;
export const MIN_VIEWED_FOR_XP = 8;
export const BINGE = "binge";
export const DAILY = "daily";

export const key = (bookId, ch) => `${bookId}:${ch}`;
export const postKey = (bookId, postId) => `${bookId}:${postId}`;

export function emptyState(settings) {
  return {
    progress: {}, lastOpened: null, completions: {}, viewed: {}, answers: {}, crossed: {},
    guesses: {}, likes: [], saves: {}, xp: [], streak: 0, bestStreak: 0, lastDay: null,
    modes: {}, reminders: {},
    settings: settings || { theme: "system", textScale: 1, reduceMotion: false, releaseHour: 20 },
  };
}

export const isComplete = (s, bookId, ch) => Object.prototype.hasOwnProperty.call(s.completions, key(bookId, ch));
export const completedCount = (s, bookId) => Object.keys(s.completions).filter((k) => k.startsWith(bookId + ":")).length;
export const mode = (s, bookId) => s.modes[bookId] || BINGE;

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(at) {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(day, delta) {
  const [y, m, d] = day.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + delta, 12).getTime());
}

/** The first release time (e.g. 20:00 local) at least 8 hours after the previous chapter was finished. */
export function releaseAt(completedAt, releaseHour) {
  const earliest = completedAt + 8 * 3600 * 1000;
  const e = new Date(earliest);
  let c = new Date(e.getFullYear(), e.getMonth(), e.getDate(), releaseHour, 0, 0, 0);
  if (c.getTime() < earliest) c = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1, releaseHour, 0, 0, 0);
  return c.getTime();
}

/** { kind: "open" } | { kind: "previous" } | { kind: "waiting", at } */
export function lockState(s, bookId, ch, now) {
  if (ch <= 1 || isComplete(s, bookId, ch)) return { kind: "open" };
  const prev = s.completions[key(bookId, ch - 1)];
  if (!prev) return { kind: "previous" };
  if (mode(s, bookId) === BINGE) return { kind: "open" };
  const at = releaseAt(prev.at, s.settings.releaseHour);
  return now >= at ? { kind: "open" } : { kind: "waiting", at };
}

/** Streak shown to the reader: 0 once a full calendar day has passed without a finished chapter. */
export function displayedStreak(s, now) {
  if (!s.lastDay) return 0;
  const today = dayKey(now);
  return s.lastDay === today || s.lastDay === shiftDay(today, -1) ? s.streak : 0;
}

export function complete(s, bookId, ch, chapterCount, viewed, now) {
  const k = key(bookId, ch);
  if (s.completions[k]) return { state: s, xpGained: 0, firstTime: false };
  const day = dayKey(now);
  const newStreak = s.lastDay === day ? Math.max(s.streak, 1) : s.lastDay === shiftDay(day, -1) ? s.streak + 1 : 1;
  const entries = s.xp.slice();
  const add = (e) => { if (!entries.some((x) => x.event === e.event && x.ref === e.ref)) entries.push(e); };
  if (viewed >= MIN_VIEWED_FOR_XP) add({ event: "chapter", ref: k, amount: XP_CHAPTER });
  const completions = { ...s.completions, [k]: { at: now, dayKey: day, viewed } };
  if (Object.keys(completions).filter((x) => x.startsWith(bookId + ":")).length >= chapterCount) add({ event: "book", ref: bookId, amount: XP_BOOK });
  if (newStreak >= 7 && s.streak < 7) add({ event: "streak7", ref: day, amount: XP_STREAK7 });
  const sum = (xs) => xs.reduce((a, x) => a + x.amount, 0);
  const next = {
    ...s, completions, xp: entries, streak: newStreak, bestStreak: Math.max(s.bestStreak, newStreak), lastDay: day,
  };
  return { state: next, xpGained: sum(entries) - sum(s.xp), firstTime: true };
}

export function answerXp(s, ref) {
  if (s.xp.some((x) => x.event === "answer" && x.ref === ref)) return s;
  return { ...s, xp: [...s.xp, { event: "answer", ref, amount: XP_ANSWER }] };
}

export const totalXp = (s) => s.xp.reduce((a, x) => a + x.amount, 0);

export function badges(s, books) {
  const list = [
    { id: "first", title: "First chapter", detail: "Finish any chapter", earned: Object.keys(s.completions).length > 0 },
    { id: "streak7", title: "7-day streak", detail: "Read 7 days in a row", earned: s.bestStreak >= 7 },
    { id: "notebook", title: "Note taker", detail: "Save 5 posts", earned: Object.keys(s.saves).length >= 5 },
  ];
  for (const b of books) {
    list.push({ id: "book-" + b.id, title: b.title, detail: `Finish all ${b.chapters.length} chapters`, earned: completedCount(s, b.id) >= b.chapters.length });
  }
  return list;
}

export function hourLabel(h) {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

export function timeLabel(at, now = Date.now()) {
  const d = new Date(at);
  const today = dayKey(now);
  const k = dayKey(at);
  const day = k === today ? "today" : k === shiftDay(today, 1) ? "tomorrow" : d.toLocaleDateString(undefined, { weekday: "long" });
  const h = d.getHours();
  const mm = d.getMinutes() ? ":" + String(d.getMinutes()).padStart(2, "0") : "";
  return `${day} at ${h % 12 === 0 ? 12 : h % 12}${mm} ${h < 12 ? "AM" : "PM"}`;
}
