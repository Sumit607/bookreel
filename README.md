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

Every push to `main` builds and tests the app. Tested builds are attached to **Releases** as
`bookreel-v0.1.<run>.apk`. Open the release on your phone, download the APK and install it
(allow "Install unknown apps" for your browser once).

## Building locally

```
python3 content/src/build.py          # regenerate the-goal.json and validate it
cd android && ./gradlew assembleRelease
```

## Content rights

The Goal is copyrighted. Its pack is marked `private-test` and is for the owner's personal testing only.
Do not distribute an APK that contains it. Public builds may only ship public-domain or licensed books.

The release build is signed with a development key committed in `android/app/dev-signing.jks` so that
every CI build installs over the previous one. Replace it with a secret upload key before any store release.
