# Bookreel

An Android app that turns a book into 20 chapters of 10 swipeable posts, read like a feed.
Plan, requirements and roadmap: see the "Bookreel PRD & Build Plan" doc.

## What's here

| Folder | What it is |
| --- | --- |
| `android/` | The app: Kotlin + Jetpack Compose, single activity, local-first state |
| `content/src/` | Book packs written as Python sources; `build.py` turns them into JSON and validates the format |
| `content/schema/` | Book pack schema notes |
| `tools/e2e.py` | End-to-end test: installs the APK on an emulator, reads every post, checks resume, notifications, notebook, profile |
| `.github/workflows/android.yml` | CI: unit + content tests, R8 release APK, emulator test, results to the `ci-results` branch, APK to Releases |

## Getting the APK

Open **https://bookreel-sand.vercel.app/apk** on the phone: it always downloads the newest tested APK
(allow "Install unknown apps" for your browser once). Every push that changes the app or its books builds
and tests it; only a fully green run publishes a Release (`bookreel-v0.1.<run>.apk`, plus `bookreel.apk`,
which is what the link fetches).

## Building locally

```
python3 content/src/build.py          # regenerate every book pack and validate it (or pass a book id)
cd android && ./gradlew assembleRelease
```

## Content rights

The Goal is copyrighted. Its pack is marked `private-test` and is for the owner's personal testing only.
Do not distribute an APK that contains it. Public builds may only ship public-domain or licensed books.

A Study in Scarlet (Arthur Conan Doyle, 1887) is in the public domain. Its pack is our own retelling, checked
against the Project Gutenberg text (ebook #244), and is served to everyone.

The release build is signed with a development key committed in `android/app/dev-signing.jks` so that
every CI build installs over the previous one. Replace it with a secret upload key before any store release.

## Web app (Vercel)

`web/` is the same app as a fast web app (PWA) that installs to the home screen. Vercel deploys it from this
repo on every push to `main` (project root `web/`).

- `web/public/` is served as static files; `web/api/` holds two small functions.
- Private packs (The Goal) are never static files: they sit in `web/api/_private/` and `/api/pack` serves them
  only to a browser that has entered the passcode (`/api/unlock`). The passcode is the `BOOKREEL_PASSCODE`
  environment variable on Vercel and is not stored in this repo.
- **Discover and Convert:** `/api/catalog` (Project Gutenberg's own OPDS catalogue: search, topics, book details), `/api/book` (a book's plain
  text, licence header removed) and `/api/convert` (plan + one call per chapter on the Gemini free tier, checked against
  the 20 × 10 rules). Downloads and finished Bookreels live in the phone's IndexedDB; nothing is uploaded. Converting
  needs the passcode cookie and the `GEMINI_API_KEY` environment variable on Vercel.
- Offline test of Discover/Convert: start the server with `GEMINI_MOCK=1 GEMINI_MOCK_429=1 CATALOG_FIXTURES=tools/fixtures
  BOOK_FIXTURES=tools/fixtures`, then `node tools/web-test/discover.mjs http://localhost:4173 test out`.
- After changing content: `python3 content/src/build.py && python3 tools/build_web.py`.
- Test locally: `BOOKREEL_PASSCODE=test node tools/serve.mjs 4173`, then
  `cd tools/web-test && npm install && node e2e.mjs http://localhost:4173 test out`.
