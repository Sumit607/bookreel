// The free daily quota of Gemini's better models runs out mid-book: the job pauses in the cloud, the app says when
// it resumes and offers to finish with Flash-Lite; tapping that finishes the book, which can later be made again.
// Usage: node quota.mjs <baseUrl> <outDir>  (server started with GEMINI_MOCK=1 GEMINI_MOCK_DAYQUOTA=1 BOOKREEL_DB_MOCK=1
//        CATALOG_FIXTURES=tools/fixtures BOOK_FIXTURES=tools/fixtures)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [BASE, OUT] = process.argv.slice(2);
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });
const results = { checks: [], failures: [], consoleErrors: [] };
const T0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s] ${m}`);
const check = (ok, msg) => { results.checks.push({ ok: !!ok, check: msg }); if (!ok) results.failures.push(msg); log((ok ? "PASS " : "FAIL ") + msg); return !!ok; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => results.consoleErrors.push(e.message));
const visible = (t, timeout = 5000) => page.getByText(t).first().waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);
const shot = (n) => page.screenshot({ path: path.join(OUT, "shots", n + ".png") });
async function tap(sel) { const l = page.locator(sel).first(); await l.waitFor({ state: "visible", timeout: 8000 }); await l.scrollIntoViewIfNeeded(); await l.tap(); }

await page.goto(BASE + "/#/gb/84", { waitUntil: "load" });
await tap('[data-act="download"]');
check(await visible("MAKE IT A BOOKREEL", 15000), "book downloaded");
await tap('[data-act="convert"]');
await tap('[data-act="convert-go"]');
check(await visible("Paused: today’s free quota", 20000), "the job pauses for the daily quota and says so");
check(await visible("carries on by itself"), "and that it resumes by itself");
check(await visible("Finish now with Flash-Lite"), "offers to finish now with Flash-Lite");
await shot("q1-paused");
await page.goto(BASE + "/#/", { waitUntil: "load" });
check(await visible("Paused for Gemini’s quota", 10000), "the library shelf shows the pause");
await page.evaluate(() => { location.hash = "#/convert/pg-84"; });
await tap('[data-act="convert-lite"]');
check(await visible("Carrying on with Flash-Lite", 5000), "Flash-Lite takes over");
const ready = await page.locator(".stamp", { hasText: "READY" }).first().waitFor({ timeout: 90000 }).then(() => true).catch(() => false);
check(ready, "the book is finished with Flash-Lite");
const made = await page.evaluate(() => window.__bookreel.books["pg-84"] && window.__bookreel.books["pg-84"].madeWith);
check(made && made.someChaptersLite, "the pack records that Flash-Lite wrote it");
await page.evaluate(() => { location.hash = "#/gb/84"; });
check(await visible("Make it again with the better writer", 8000), "the book page offers to make it again with the better writer");
await shot("q2-remake-offer");
check(results.consoleErrors.length === 0, `no script errors (${results.consoleErrors.length})`);
log(`${results.checks.length} checks, ${results.failures.length} failures`);
await browser.close();
process.exit(results.failures.length ? 1 : 0);
