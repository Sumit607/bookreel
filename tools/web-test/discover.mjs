// End-to-end test of Discover and Convert at phone size: browse and search free books, download one, convert it
// (no passcode, a rate-limit wait, live progress), read the result, reload, import a PDF, remove a download.
// Offline mode (default) expects the local server started with GEMINI_MOCK=1 GEMINI_MOCK_429=1 CATALOG_FIXTURES and
// BOOK_FIXTURES pointing at tools/fixtures. With --live it runs against the real site and real Gemini (slow).
//
// Usage: node discover.mjs <baseUrl> <outDir> [--live] [--gid=84]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [BASE, OUT] = process.argv.slice(2);
const LIVE = process.argv.includes("--live");
const GID = (process.argv.find((a) => a.startsWith("--gid=")) || "--gid=84").slice(6);
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
page.on("console", (m) => {
  // Cover images can't load offline.
  if (m.type() === "error" && !/status of 401|ERR_|net::|Failed to load resource/.test(m.text())) results.consoleErrors.push(m.text());
});
const shot = (name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
const visible = (t, timeout = 5000) => page.getByText(t).first().waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
const hash = () => page.evaluate(() => location.hash);
async function waitFor(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await page.waitForTimeout(120); }
  return false;
}
async function tap(sel) {
  const loc = page.locator(sel).first();
  try { await loc.waitFor({ state: "visible", timeout: 8000 }); await loc.scrollIntoViewIfNeeded(); await loc.tap(); return true; }
  catch (e) { return check(false, `tap ${sel}`); }
}

// ------------------------------------------------------------------ browse
await page.goto(BASE + "/", { waitUntil: "load" });
await page.locator(".bgrid").waitFor({ timeout: 15000 });
check(await page.locator('.bnav [data-nav="#/discover"]').count() === 1, "bottom bar has a Discover tab");
check(await visible("75,000+ free books"), "library promotes Discover when nothing is downloaded");
await tap('.bnav [data-nav="#/discover"]');
check(await waitFor(async () => (await page.locator(".dcard").count()) >= (LIVE ? 12 : 6), 20000), "Discover lists popular free books");
check(await visible("MOST DOWNLOADED"), "popular list is headed Most downloaded");
await page.waitForTimeout(600);
await shot("01-discover");
const t1 = Date.now();
await page.locator("#dq").fill(LIVE ? "frankenstein" : "drac");
check(await waitFor(async () => (await page.locator(".dcard").count()) >= 1 && /RESULTS FOR/.test(await page.locator("#dres").innerText()), 15000), "search shows results");
results.metrics.searchMs = Date.now() - t1;
check(await page.evaluate(() => document.activeElement && document.activeElement.id === "dq"), "search box keeps focus while results load");
if (!LIVE) check(await visible("Dracula"), "search finds Dracula");
await shot("02-search");
await page.locator("#dq").fill("");
await tap('[data-act="topic"][data-topic="mystery"]');
check(await waitFor(async () => /MYSTERY/.test(await page.locator("#dres").innerText()), 15000), "topic chip switches the list");
await shot("03-topic");

// ------------------------------------------------------------------ book page and download
await page.evaluate((gid) => { location.hash = `#/gb/${gid}`; }, GID);
check(await visible("DOWNLOAD FREE", 15000), "book page offers a free download");
check(await visible("Public domain"), "book page shows the rights");
check(await visible("ABOUT THIS BOOK", 15000), "book page loads Gutenberg's summary");
check(await waitFor(async () => (await page.locator(".gb-subj span").count()) >= 1, 8000), "book page lists the subjects");
if (!LIVE) check(await visible("179.8k downloads"), "book page shows recent downloads");
await shot("04-book");
const t2 = Date.now();
await tap('[data-act="download"]');
check(await visible("Saved on this phone", 30000), "download saves the book on the phone");
results.metrics.downloadMs = Date.now() - t2;
check(await visible("MAKE IT A BOOKREEL"), "saved book offers Make it a Bookreel");
await shot("05-saved");

// ------------------------------------------------------------------ convert
await tap('[data-act="convert"]');
check(await visible("Read it all now", 5000), "convert sheet explains the format and asks when to read");
check(await page.locator('input[type="password"]').count() === 0, "convert sheet asks for no passcode");
await shot("06-convert-sheet");
await tap('[data-act="convert-go"]');
check(await waitFor(async () => (await hash()).startsWith("#/convert/"), 10000), "Start converting begins straight away");
check(await visible("CONVERTING", 10000), "converting screen shows live progress");
if (!LIVE) check(await visible("waiting", 15000), "a free-quota pause is shown and waited out");
await page.waitForTimeout(1500);
await shot("07-converting");
const t3 = Date.now();
const done = await waitFor(async () => (await page.locator(".stamp", { hasText: "READY" }).count()) > 0, LIVE ? 25 * 60000 : 120000);
check(done, "conversion finishes with READY");
results.metrics.convertSeconds = Math.round((Date.now() - t3) / 1000);
await shot("08-ready");
const id = `pg-${GID}`;
const pack = await page.evaluate((i) => { const b = window.__bookreel.books[i]; return b && { n: b.chapters.length, posts: b.chapters.map((c) => c.posts.length), first: b.chapters.map((c) => c.posts[0].type), last: b.chapters.map((c) => c.posts[9].type), chars: b.characters.length }; }, id);
check(pack && pack.n === 20, "the Bookreel has 20 chapters");
check(pack && pack.posts.every((n) => n === 10), "every chapter has 10 posts");
check(pack && pack.first.every((t) => t === "hook") && pack.last.every((t) => t === "cliffhanger"), "every chapter opens with a hook and ends on a cliffhanger");
// Keep the generated Bookreel for a human read-through of its quality.
fs.writeFileSync(path.join(OUT, "pack.json"), JSON.stringify(await page.evaluate((i) => window.__bookreel.books[i], id), null, 1));

// ------------------------------------------------------------------ read it
await tap('[data-act="open-book"]');
check(await visible("Start Chapter 1", 8000), "the new book has a normal book page");
await shot("09-book-page");
await tap('[data-act="start"]');
check(await waitFor(async () => /^1\/10$/.test((await page.locator(".rcount").first().innerText().catch(() => "")).trim()), 8000), "chapter 1 opens in the reader");
await page.waitForTimeout(500);
await shot("10-reader-hook");
for (let p = 2; p <= 10; p++) {
  const box = await page.locator(".pager").boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.88, box.y + box.height * 0.42);
  await waitFor(async () => (await page.locator(".rcount").first().innerText().catch(() => "")).trim() === `${p}/10`, 3000);
  if (p === 3 || p === 4) await shot(`11-reader-p${p}`);
}
check((await page.locator(".rcount").first().innerText()).trim() === "10/10", "all 10 posts of chapter 1 can be read");

// ------------------------------------------------------------------ library and reload
await page.goto(BASE + "/#/", { waitUntil: "load" });
await page.locator(".bgrid").waitFor({ timeout: 15000 });
check(await visible("YOUR DOWNLOADS", 8000), "library lists your downloads after a reload");
check(await visible("Bookreel ready"), "the download shows as a ready Bookreel");
check(await page.locator(`.bcard[data-id="${id}"]`).count() === 1, "the new Bookreel appears in the library grid");
await page.locator(".shelf").scrollIntoViewIfNeeded();
await shot("12-library");

// ------------------------------------------------------------------ PDF import
const pdfPath = path.join(OUT, "sample.pdf");
{
  const p2 = await ctx.newPage();
  const paras = Array.from({ length: 60 }, (_, i) => `<p>Paragraph ${i + 1}. The captain wrote in his log that the sea was calm and the crew restless. Ada counted the barrels twice before dawn, and found one missing again. Nobody admitted taking it, and the cook swore he had locked the store.</p>`).join("");
  await p2.setContent(`<html><head><title>The Missing Barrel</title></head><body style="font:14px serif">${Array.from({ length: 4 }, (_, c) => `<h1>Chapter ${c + 1}</h1>${paras}`).join("")}</body></html>`);
  await p2.pdf({ path: pdfPath, format: "A4" });
  await p2.close();
}
await page.evaluate(() => { location.hash = "#/discover"; });
await page.locator("#filepick").waitFor({ state: "attached", timeout: 8000 });
// Discover draws again when its list arrives, which replaces the file input: wait for that first.
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(800);
await page.locator("#filepick").setInputFiles(pdfPath);
check(await waitFor(async () => (await hash()).startsWith("#/mine/"), 20000), "a PDF can be added and opens its own page");
check(await visible("Saved on this phone", 8000), "the PDF is saved on the phone");
check(await visible("MAKE IT A BOOKREEL"), "the PDF can be made into a Bookreel");
await shot("13-pdf");

// ------------------------------------------------------------------ remove
await tap('[data-act="remove"]');
await tap('[data-act="remove-yes"]');
check(await visible("Removed from this phone", 6000), "a download can be removed");
results.metrics.consoleErrors = results.consoleErrors.length;
check(results.consoleErrors.length === 0, `no script errors (${results.consoleErrors.length})`);
if (results.consoleErrors.length) log(results.consoleErrors.slice(0, 5).join("\n"));

await browser.close();
const lines = ["# Bookreel Discover and Convert test", "", `Base: ${BASE}${LIVE ? " (live)" : " (offline mocks)"}`, "", ...results.checks.map((c) => `- ${c.ok ? "PASS" : "FAIL"}: ${c.check}`), "", "## Metrics", "```", JSON.stringify(results.metrics, null, 2), "```"];
fs.writeFileSync(path.join(OUT, "SUMMARY.md"), lines.join("\n"));
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(results, null, 2));
log(`${results.checks.length} checks, ${results.failures.length} failures`);
process.exit(results.failures.length ? 1 : 0);
