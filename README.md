# Bookreel

An app that turns a book into 20 chapters of 10 swipeable posts, read like a feed. It is a web app at
bookreel-sand.vercel.app, and the Android app is a thin shell around it (like Khabri's), so every change
to the site, new books included, reaches the phone without reinstalling.
Plan, requirements and roadmap: see the "Bookreel PRD & Build Plan" doc.

## What's here

| Folder | What it is |
| --- | --- |
| `web/` | The app itself: static PWA in `web/public/`, Discover and Convert functions in `web/api/` |
| `android/` | The Android shell: one activity with a WebView on bookreel-sand.vercel.app, plus the back button, share sheet, chapter notifications, PDF picker and the hand-over of progress from the earlier native app (`window.BookreelAndroid`) |
| `content/books/` | The book packs (JSON) and `index.json`; `tools/build_web.py` copies them into `web/public/books/` |
| `content/src/` | Book packs written as Python sources; `build.py` turns them into JSON and validates the format |
| `content/schema/` | Book pack schema notes |
| `tools/web-test/` | Browser tests of the web app: `e2e.mjs` (every post of every book), `discover.mjs`, `shell.mjs` (the app inside the Android shell, bridge stubbed) |
| `tools/e2e.py` | Emulator test of the shell against the live site: installs over the last native release and takes over its progress, real taps, back button, share, notification, offline |
| `.github/workflows/android.yml` | CI for the shell: unit tests, R8 release APK, emulator test, results to the `ci-results` branch, APK to Releases |
| `.github/workflows/content.yml` | CI for books: every ready pack follows the 20 × 10 rules and the web app serves the same files |

## Getting the APK

Open **https://bookreel-sand.vercel.app/apk** on the phone: it always downloads the newest tested APK
(allow "Install unknown apps" for your browser once). It is needed once: books and app changes come from the
website. A new APK is only built when the shell in `android/` changes; only a fully green run publishes a
Release (`bookreel-v1.0.<run>.apk`, plus `bookreel.apk`, which is what the link fetches). Versions 0.1.x were
the earlier fully native app; 1.x installs over it and takes over its reading progress.

## Building locally

```
python3 content/src/build.py          # regenerate every book pack and validate it (or pass a book id)
python3 tools/import_bookreel.py --check-all   # check every ready pack in content/books
python3 tools/build_web.py            # copy them into the web app
cd android && ./gradlew assembleRelease
```

## Content rights

The Goal is copyrighted. Its pack is marked `private-test`: Bookreel is a personal app for its owner, so The Goal
opens without a passcode, but it must not be shared or published. Public builds may only ship public-domain or
licensed books.

A Study in Scarlet (Arthur Conan Doyle, 1887) is in the public domain. Its pack is our own retelling, checked
against the Project Gutenberg text (ebook #244), and is served to everyone.

The release build is signed with a development key committed in `android/app/dev-signing.jks` so that
every CI build installs over the previous one. Replace it with a secret upload key before any store release.

## Web app (Vercel)

`web/` is the same app as a fast web app (PWA) that installs to the home screen. Vercel deploys it from this
repo on every push to `main` (project root `web/`).

- `web/public/` is served as static files, books included; `web/api/` holds the Discover and Convert functions.
- There are no passcodes: the app has one reader, and every book opens directly.
- **Discover:** `/api/catalog` (Project Gutenberg's own OPDS catalogue: search, topics, book details) and `/api/book` (a book's
  plain text, licence header removed). Downloads live in the phone's IndexedDB.
- **Convert, in the cloud:** the app cuts a book into 20 parts and sends them to `/api/jobs`. The job waits in the free
  Supabase project **bookreel** (schema `bookreel`, see `db/bookreel.sql`); pg_cron calls `/api/worker` every minute while
  a job is due, and the worker plans the book, writes one chapter at a time and assembles the pack (`web/api/_pipeline.js`),
  so the app can be closed. The app collects the finished Bookreel next time it is open (and the Android app notifies).
  Writing uses Gemini's best free Flash model first and moves down the ladder when a model's daily quota runs out
  (`web/api/_gemini.js`); when every Flash model is used up the job waits for the reset, unless the reader taps
  "Finish now with Flash-Lite". Each chapter is checked (`qualityNotes` in `web/api/_bookfmt.js`: quotes must be word for
  word in the text, no filler, variety, a real cliffhanger) and rewritten once if it falls short. Prompts follow two
  playbooks, story and ideas, with an example chapter each (`web/api/_examples.js`).
  Vercel needs `GEMINI_API_KEY`, `BOOKREEL_DB_URL`, `BOOKREEL_DB_KEY` (anon key) and `BOOKREEL_TOKEN` (also in
  `bookreel.settings`); a daily Vercel cron pings the database so the free project does not pause.
- Offline tests: start the server with `GEMINI_MOCK=1 BOOKREEL_DB_MOCK=1 CATALOG_FIXTURES=tools/fixtures
  BOOK_FIXTURES=tools/fixtures` (it runs the worker every 1.5 s), then `node tools/web-test/discover.mjs http://localhost:4173 out`;
  add `GEMINI_MOCK_DAYQUOTA=1` and run `quota.mjs` for the quota pause.
- After changing content: `python3 content/src/build.py && python3 tools/build_web.py`.
- Test locally: `node tools/serve.mjs 4173`, then
  `cd tools/web-test && npm install && node e2e.mjs http://localhost:4173 out`.
