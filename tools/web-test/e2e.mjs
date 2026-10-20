// End-to-end test of the Bookreel web app at phone size (412 × 915, touch).
// Reads every post of every chapter of every ready book like a reader would: taps, a swipe, polls, a guess,
// saves, resume after a reload, the daily-release flow, locked chapters, the passcode gate, notebook,
// profile and dark theme. Writes screenshots and summary.json to OUT. Exits non-zero on any failure.
//
// Usage: node e2e.mjs <baseUrl> <passcode> <outDir> [--quick]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [BASE, PASS, OUT] = process.argv.slice(2);
const QUICK = process.argv.includes("--quick");
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const results = { checks: [], failures: [], metrics: {}, consoleErrors: [] };
const T0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s] ${m}`);
function check(ok, msg) {
  results.checks.push({ ok: !!ok, check: msg });
  if (!ok) results.failures.push(msg);
  log((ok ? "PASS " : "FAIL ") + msg);
  return !!ok;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 15; V2502) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
});
const page = await ctx.newPage();
page.on("pageerror", (e) => results.consoleErrors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/status of 401/.test(m.text())) results.consoleErrors.push(m.text()); });

const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
const text = (sel) => page.locator(sel).first().innerText().catch(() => "");
async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await page.waitForTimeout(80); }
  return false;
}
const counter = async () => { const t = await text(".rcount"); const m = /^(\d+)\/\d+$/.exec(t.trim()); return m ? +m[1] : null; };

async function tapNext() {
  const box = await page.locator(".pager").boundingBox();
  if (!box) { log("no pager at " + (await page.evaluate(() => location.hash))); await shot("debug-no-pager"); return; }
  await page.touchscreen.tap(box.x + box.width * 0.88, box.y + box.height * 0.42);
}
async function nextPost(expected) {
  for (let i = 0; i < 4; i++) {
    await tapNext();
    if (await waitFor(async () => (await counter()) === expected, 2500)) return true;
  }
  return check(false, `move to post ${expected}`);
}
async function tapText(t, opts = {}) {
  const loc = page.getByText(t, { exact: !!opts.exact }).first();
  try { await loc.waitFor({ state: "visible", timeout: opts.timeout || 6000 }); await loc.scrollIntoViewIfNeeded(); await loc.tap(); return true; }
  catch (e) { return check(false, `could find and tap '${t}'`); }
}
async function swipeLeft() {
  const cdp = await ctx.newCDPSession(page);
  const box = await page.locator(".pager").boundingBox();
  const y = Math.round(box.y + box.height * 0.5);
  const x0 = Math.round(box.x + box.width * 0.8), x1 = Math.round(box.x + box.width * 0.17);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * i) / 12, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
const visible = (t, timeout = 5000) => page.getByText(t).first().waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);

const ANSWERS = {
  "the-goal:1:6": ["Put every available worker", "Same call as Bob Donovan", "poll shows feedback after an answer"],
  "the-goal:2:7": ["Something else", "Hold that thought", "guess shows feedback after an answer"],
  "the-goal:8:4": ["Put Herbie in front", "That’s Alex’s call", "chapter 8 poll answers"],
};

async function readChapter(bookId, ch, total, { saves = [], first = 1 } = {}) {
  if (!check(await waitFor(async () => (await counter()) !== null, 8000), `${bookId} chapter ${ch} opened`)) return false;
  const start = await counter();
  for (let p = start; p <= 10; p++) {
    await page.waitForTimeout(QUICK ? 120 : 380);
    if (!QUICK || p === 1 || p === 10) await shot(`${bookId}-c${String(ch).padStart(2, "0")}-p${String(p).padStart(2, "0")}`);
    if (saves.includes(p)) {
      await page.locator('[data-act="save"]').tap();
      check(await visible("Saved to your notebook", 3000), `saved post ${ch}-${p}`);
    }
    const a = ANSWERS[`${bookId}:${ch}:${p}`];
    if (a) {
      const opt = page.locator(".page.live .opt", { hasText: a[0] }).first();
      await opt.tap().catch(() => {});
      check(await visible(a[1], 3000), a[2]);
      await shot(`${bookId}-c${String(ch).padStart(2, "0")}-p${String(p).padStart(2, "0")}-answered`);
    }
    if (p < 10 && !(await nextPost(p + 1))) return false;
  }
  const label = ch === total ? "Finish the book" : "Finish chapter";
  if (!(await tapText(label, { exact: true }))) return false;
  const ok = await waitFor(async () => !!(await page.locator(".stamp").count()), 5000);
  check(ok, `${bookId} chapter ${ch} complete screen`);
  await page.waitForTimeout(450);
  await shot(`${bookId}-c${String(ch).padStart(2, "0")}-done`);
  return ok;
}

// ------------------------------------------------------------------ run
const t1 = Date.now();
await page.goto(BASE + "/", { waitUntil: "load" });
check(await page.locator(".bgrid").waitFor({ timeout: 15000 }).then(() => true).catch(() => false), "library screen shows");
results.metrics.libraryReadyMs = Date.now() - t1;
const nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; const p = performance.getEntriesByName("first-contentful-paint")[0]; return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: p ? Math.round(p.startTime) : null, transferKB: Math.round(performance.getEntriesByType("resource").reduce((a, r) => a + (r.transferSize || 0), n.transferSize || 0) / 1024) }; });
results.metrics.navigation = nav;
await page.waitForTimeout(500);
await shot("00-library");

const index = await page.evaluate(() => window.__bookreel.index());
const ready = index.books.filter((b) => b.status === "ready");
log(`ready books: ${ready.map((b) => b.id + (b.access === "private" ? "*" : "")).join(", ")}`);

// Passcode gate for private books
for (const b of ready.filter((x) => x.access === "private")) {
  await page.locator(`[data-act="book"][data-id="${b.id}"]`).tap();
  check(await visible("Enter your passcode once", 4000), `${b.id}: passcode sheet appears`);
  await shot(`01-${b.id}-passcode`);
  await page.fill('input[name="code"]', "wrong-code");
  await page.locator('.pass button[type="submit"]').tap();
  check(await visible("didn’t work", 5000), `${b.id}: wrong passcode is refused`);
  await page.fill('input[name="code"]', PASS);
  await page.locator('.pass button[type="submit"]').tap();
  check(await visible("Start Chapter 1", 8000), `${b.id}: right passcode opens the book page`);
  await page.locator('[data-act="back"]').tap();
  await page.waitForTimeout(300);
}

for (const b of ready) {
  const book = await page.evaluate((id) => { const x = window.__bookreel.books[id]; return x && { n: x.chapters.length, t8: x.chapters[7]?.title }; }, b.id);
  if (!check(!!book, `${b.id}: pack loaded`)) continue;
  log(`reading ${b.id}: ${book.n} chapters`);
  await page.locator(`[data-act="book"][data-id="${b.id}"]`).tap();
  check(await visible("Start Chapter 1", 6000), `${b.id}: book page shows start button`);
  await shot(`02-${b.id}-book`);

  // Locked chapter 8
  const t8 = page.locator('.tile[data-ch="8"]');
  await t8.scrollIntoViewIfNeeded();
  await shot(`02-${b.id}-book-grid`);
  await t8.tap();
  check(await visible("Unlocks when you finish Chapter 7", 4000), `${b.id}: locked chapter sheet explains the unlock`);
  await shot(`03-${b.id}-locked`);
  await tapText("Got it", { exact: true });
  await page.waitForTimeout(300);

  // Chapter 1: two taps, a swipe back and forward, then reload to test resume
  await page.locator('[data-act="start"]').tap();
  check(await waitFor(async () => (await counter()) === 1, 6000), `${b.id}: reader opens on post 1`);
  await shot(`${b.id}-c01-p01`);
  await nextPost(2);
  // A real swipe: drag the pager left with touch events.
  await swipeLeft();
  check(await waitFor(async () => (await counter()) === 3, 4000), `${b.id}: swipe moves to the next post`);
  await page.reload();
  check(await waitFor(async () => (await counter()) === 3, 10000), `${b.id}: reload reopens the same post`);
  await page.locator('[data-act="close"]').tap();
  check(await page.locator(".cont").waitFor({ timeout: 10000 }).then(() => true).catch(() => false), `${b.id}: library offers to continue`);
  check((await text(".cont-k")).includes(`CHAPTER 1 OF ${book.n}`), `${b.id}: continue card shows chapter 1`);
  await shot(`04-${b.id}-continue`);
  await page.locator(".cont").tap();
  check(await waitFor(async () => (await counter()) === 3, 6000), `${b.id}: continue resumes on post 3`);
  await nextPost(4);
  const saves1 = b.id === "the-goal" ? [4, 6] : [4, 6];
  if (!(await readChapter(b.id, 1, book.n, { saves: saves1 }))) break;

  // Daily release, then read on anyway
  if (await tapText("Release it to me tomorrow")) {
    check(await visible("Unlocks", 4000), `${b.id}: daily release confirms the unlock time`);
    check(await page.locator('[data-act="ics"]').count() > 0, `${b.id}: calendar reminder offered`);
    await shot(`05-${b.id}-daily`);
  }
  await tapText("Read Chapter 2 now");
  for (let ch = 2; ch <= book.n; ch++) {
    const saves = [3, 8, 15].includes(ch) ? [4] : [];
    if (!(await readChapter(b.id, ch, book.n, { saves }))) break;
    if (ch < book.n && !(await tapText(`Read Chapter ${ch + 1} now`))) break;
  }
  check(await visible("BOOK BADGE EARNED", 4000), `${b.id}: book badge after the last chapter`);
  await shot(`06-${b.id}-finished`);
  await tapText("Back to the book");
  await page.waitForTimeout(400);
  check(await visible("Read again from Chapter 1", 4000), `${b.id}: book page shows the book finished`);
  await shot(`07-${b.id}-book-done`);
  await page.locator('[data-act="back"]').tap();
  await page.waitForTimeout(400);
}

// Notebook, profile, dark theme
await page.locator('.bnav [data-nav="#/notebook"]').tap();
check(await visible("SAVED POSTS", 4000), "notebook opens");
const expectedSaves = ready.length * 5;
check(await visible(`${expectedSaves} saved`, 3000), `notebook lists the ${expectedSaves} saved posts`);
await shot("08-notebook");
await page.locator(".nb").first().tap();
check(await waitFor(async () => (await counter()) !== null, 5000), "a saved post opens in the reader");
await page.locator('[data-act="close"]').tap();
await page.waitForTimeout(300);
await page.locator('.bnav [data-nav="#/profile"]').tap();
check(await visible("READER", 4000), "profile opens");
await shot("09-profile");
await page.locator('[data-act="set"][data-k="theme"][data-v="dark"]').tap();
await page.waitForTimeout(300);
check((await page.evaluate(() => document.documentElement.dataset.theme)) === "dark", "dark theme applies");
await shot("10-profile-dark");
await page.locator('.bnav [data-nav="#/"]').tap();
await page.waitForTimeout(400);
await shot("11-library-dark");

// Offline: the service worker serves the app shell and books without a network.
const swReady = await page.evaluate(async () => { if (!("serviceWorker" in navigator)) return false; const r = await navigator.serviceWorker.ready; return !!r.active; }).catch(() => false);
check(swReady, "service worker is active");
if (swReady) {
  await page.reload();
  await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload().catch(() => {});
  check(await page.locator(".bgrid").waitFor({ timeout: 8000 }).then(() => true).catch(() => false), "app opens offline");
  await shot("12-offline");
  await ctx.setOffline(false);
}

results.metrics.jsHeapMB = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
check(results.consoleErrors.length === 0, `no script errors (${results.consoleErrors.length})`);
results.metrics.seconds = Math.round((Date.now() - T0) / 1000);
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(results, null, 2));
const lines = ["# Bookreel web end-to-end test", "", `Base: ${BASE}`, "", ...results.checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"}: ${c.check}`), "", "## Metrics", "```", JSON.stringify(results.metrics, null, 2), "```"];
if (results.consoleErrors.length) lines.push("", "## Console errors", ...results.consoleErrors.map((e) => "- " + e));
fs.writeFileSync(path.join(OUT, "SUMMARY.md"), lines.join("\n"));
log(`${results.checks.length} checks, ${results.failures.length} failures`);
await browser.close();
process.exit(results.failures.length ? 1 : 0);
