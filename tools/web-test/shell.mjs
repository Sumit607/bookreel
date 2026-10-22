// The web app inside the Android shell, with the shell's window.BookreelAndroid bridge replaced by a stub
// that records every call. Checks: progress from the old native app is taken over once, status bar colours,
// the Android back button, the share sheet, chapter notifications (schedule, cancel, settings), deep links
// from a notification, the profile's app section, and a quiet reload when a new version is deployed.
//
// Usage: node shell.mjs <baseUrl> <outDir>   (the server must serve web/public from disk, e.g. tools/serve.mjs)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [BASE, OUT] = process.argv.slice(2);
const SHOTS = path.join(OUT, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const SW = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "public", "sw.js");
const results = { checks: [], failures: [], consoleErrors: [] };
const T0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s] ${m}`);
function check(ok, msg) {
  results.checks.push({ ok: !!ok, check: msg });
  if (!ok) results.failures.push(msg);
  log((ok ? "PASS " : "FAIL ") + msg);
  return !!ok;
}

// What the old native app saved in files/state.json (kotlinx.serialization leaves out default values).
const DAY = 86400000;
const t = Date.now();
const dayKey = (at) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const releaseAt = t + DAY;
const OLD = JSON.stringify({
  progress: { "the-goal:1": 9 },
  lastOpened: { bookId: "the-goal", ch: 1, post: 9 },
  completions: { "the-goal:1": { at: t - DAY, dayKey: dayKey(t - DAY), viewed: 10 } },
  viewed: { "the-goal:1": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
  answers: { "the-goal:1-6": 0 },
  xp: [{ event: "chapter", ref: "the-goal:1", amount: 100 }, { event: "answer", ref: "the-goal:1-6", amount: 20 }],
  streak: 1, bestStreak: 1, lastDay: dayKey(t - DAY),
  saves: { "the-goal:1-4": { bookId: "the-goal", ch: 1, index: 3, at: t - DAY } },
  modes: { "the-goal": "daily" },
  reminders: { "the-goal": releaseAt },
  settings: { theme: "dark", releaseHour: 21 },
});

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 15; V2502; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 BookreelAndroid/1.0.42",
});
await ctx.addInitScript((old) => {
  window.__calls = [];
  const rec = (...a) => { window.__calls.push(a); };
  window.BookreelAndroid = {
    version: () => "1.0.42",
    oldProgress: () => (localStorage.getItem("stub-old-taken") ? "" : old),
    oldProgressDone: () => { localStorage.setItem("stub-old-taken", "1"); rec("oldProgressDone"); },
    setBars: (color, dark) => rec("setBars", color, dark),
    share: (title, text, url) => rec("share", title, text, url),
    scheduleRelease: (...a) => { rec("scheduleRelease", ...a); return "on"; },
    cancelRelease: (id) => rec("cancelRelease", id),
    notifications: () => localStorage.getItem("stub-notifications") || "on",
    openNotificationSettings: () => rec("openNotificationSettings"),
  };
}, OLD);
const page = await ctx.newPage();
page.on("pageerror", (e) => results.consoleErrors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/status of 401/.test(m.text())) results.consoleErrors.push(m.text()); });

const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
const calls = (name) => page.evaluate((n) => window.__calls.filter((c) => c[0] === n), name);
const visible = (txt, timeout = 5000) => page.getByText(txt).first().waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
const route = () => page.evaluate(() => location.hash || "#/");
const nativeBack = () => page.evaluate(() => window.bookreelBack());
async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await page.waitForTimeout(80); }
  return false;
}
const counter = async () => { const s = await page.locator(".rcount").first().innerText().catch(() => ""); const m = /^(\d+)\/\d+$/.exec(s.trim()); return m ? +m[1] : null; };
async function nextPost(expected) {
  for (let i = 0; i < 4; i++) {
    const box = await page.locator(".pager").boundingBox();
    if (box) await page.touchscreen.tap(box.x + box.width * 0.88, box.y + box.height * 0.42);
    if (await waitFor(async () => (await counter()) === expected, 2500)) return true;
  }
  return check(false, `move to post ${expected}`);
}

const swOriginal = fs.readFileSync(SW, "utf8");
try {
  // ---- first start: the old app's progress moves over
  await page.goto(BASE + "/", { waitUntil: "load" });
  check(await page.locator(".bgrid").waitFor({ timeout: 15000 }).then(() => true).catch(() => false), "library shows inside the shell");
  await page.evaluate(() => window.__bookreel.ready());
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => window.__bookreel.state);
  check(!!st.completions["the-goal:1"], "old app's finished chapter 1 of The Goal is kept");
  check(st.settings.theme === "dark" && st.settings.releaseHour === 21 && st.settings.textScale === 1, "old settings kept, missing ones filled in");
  check(Object.keys(st.saves).length === 1, "old saved post kept");
  check((await calls("oldProgressDone")).length === 1, "shell told the old progress was taken over");
  check(await page.evaluate(() => !!localStorage.getItem("bookreel-state-v1")), "progress now saved by the web app");
  check(await visible("CONTINUE · CHAPTER 1 OF 20"), "library offers to continue The Goal");
  const sched = await calls("scheduleRelease");
  check(sched.some((c) => c[1] === "the-goal" && c[2] === String(releaseAt) && c[5] === "#/read/the-goal/2" && /Chapter 2 of The Goal/.test(c[3])),
    "the old app's chapter 2 release is re-armed as a phone notification");
  check(await page.evaluate(() => document.documentElement.dataset.theme) === "dark", "dark theme from the old app applied");
  const bars = await calls("setBars");
  check(bars.length > 0 && bars[bars.length - 1][2] === true, "status bar told the page is dark");
  await shot("shell-01-library-migrated");

  // ---- a second start does not take it over again
  await page.reload({ waitUntil: "load" });
  await page.evaluate(() => window.__bookreel.ready());
  check((await calls("oldProgressDone")).length === 0, "old progress is taken over only once");

  // ---- Android back button
  check(await nativeBack() === false, "back on the library leaves the app");
  await page.locator('[data-act="book"][data-id="the-art-of-war"]').tap();
  check(await visible("Start Chapter 1", 6000), "The Art of War opens");
  check(await nativeBack() === true && await waitFor(async () => (await route()) === "#/", 3000), "back from a book page returns to the library");
  await page.locator('.bnav [data-nav="#/profile"]').tap();
  await page.locator('[data-act="how"]').tap();
  check(await page.locator("#sheet .sheet").isVisible(), "a sheet opens");
  check(await nativeBack() === true && await waitFor(async () => !(await page.locator("#sheet .sheet").isVisible().catch(() => false)), 3000), "back closes the sheet first");
  check((await route()) === "#/profile", "and stays on the profile");

  // ---- profile inside the app
  check(await visible("Android app 1.0.42"), "profile shows the app version");
  check(await visible("nothing to reinstall"), "profile says updates arrive on their own");
  check(!(await page.getByText("Add to Home screen").count()), "no 'Add to Home screen' hint inside the app");
  check(await visible("Chapter notifications"), "profile shows chapter notifications");
  await shot("shell-02-profile");
  await page.evaluate(() => localStorage.setItem("stub-notifications", "off"));
  await page.locator('.bnav [data-nav="#/notebook"]').tap();
  await page.locator('.bnav [data-nav="#/profile"]').tap();
  await page.getByRole("button", { name: "Turn on" }).tap();
  check((await calls("openNotificationSettings")).length === 1, "'Turn on' opens Android's notification settings");
  await page.evaluate(() => localStorage.setItem("stub-notifications", "on"));

  // ---- notebook kept the old saved post
  await page.locator('.bnav [data-nav="#/notebook"]').tap();
  check(await visible("1 saved"), "notebook lists the old saved post");

  // ---- deep link from a notification
  await page.evaluate(() => window.bookreelOpen("#/book/the-art-of-war"));
  check(await visible("Start Chapter 1", 5000), "a notification link opens the book page");
  await page.evaluate(() => window.bookreelOpen("javascript:alert(1)"));
  check((await route()) === "#/book/the-art-of-war", "a malformed link is ignored");

  // ---- read chapter 1, share, finish, release tomorrow as a notification
  await page.locator('[data-act="start"]').tap();
  check(await waitFor(async () => (await counter()) === 1, 6000), "reader opens");
  await page.locator('.reader [data-act="share"]').tap();
  const shares = await calls("share");
  check(shares.length === 1 && shares[0][1] === "The Art of War" && /Chapter 1 of The Art of War/.test(shares[0][2]), "share opens Android's share sheet");
  for (let p = 2; p <= 10; p++) if (!(await nextPost(p))) break;
  await page.getByText("Finish chapter", { exact: true }).tap();
  check(await waitFor(async () => !!(await page.locator(".stamp").count()), 5000), "chapter complete screen");
  await page.getByText("Release it to me tomorrow", { exact: false }).first().tap();
  check(await visible("You'll get a notification when it unlocks"), "complete screen promises a notification");
  check(!(await page.getByText("Add a calendar reminder").count()), "no calendar file inside the app");
  const rel = (await calls("scheduleRelease")).filter((c) => c[1] === "the-art-of-war");
  check(rel.length === 1 && rel[0][5] === "#/read/the-art-of-war/2" && +rel[0][2] > Date.now(), "chapter 2 notification scheduled on the phone");
  await shot("shell-03-release");
  await page.getByText("Read Chapter 2 now", { exact: true }).tap();
  check((await calls("cancelRelease")).some((c) => c[1] === "the-art-of-war"), "reading on now cancels that notification");
  check(await waitFor(async () => (await counter()) === 1, 6000), "chapter 2 opens");
  const darkReader = await calls("setBars");
  check(darkReader[darkReader.length - 1][1] === "#0B0D10", "reader uses the dark reading bars");
  await page.locator('[data-act="close"]').tap().catch(() => {});

  // ---- a new version is deployed while the app is open: it takes over quietly on the library
  await page.evaluate(() => { location.hash = "#/"; });
  await waitFor(async () => (await route()) === "#/", 3000);
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker in charge");
  fs.writeFileSync(SW, swOriginal.replace(/const VERSION = "([^"]+)";/, 'const VERSION = "$1-next";'));
  const reloaded = page.waitForEvent("load", { timeout: 20000 }).then(() => true).catch(() => false);
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r && r.update()));
  check(await reloaded, "the page reloads itself once the new version is in charge");
  check(await visible("Bookreel updated", 6000), "and says so");
  await shot("shell-04-updated");
  const after = await page.evaluate(() => window.__bookreel.state);
  check(!!after.completions["the-art-of-war:1"] && !!after.completions["the-goal:1"], "progress survives the update");
} finally {
  fs.writeFileSync(SW, swOriginal);
}

check(results.consoleErrors.length === 0, `no script errors (${results.consoleErrors.length})`);
results.consoleErrors.forEach((e) => log("  " + e));
const fails = results.failures.length;
log(`${results.checks.length} checks, ${fails} failures`);
fs.writeFileSync(path.join(OUT, "shell-summary.json"), JSON.stringify(results, null, 2));
await browser.close();
process.exit(fails ? 1 : 0);
