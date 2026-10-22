# Bookreel Android shell: end-to-end test

- PASS: the last native release (0.1.11) installs
- PASS: the shell installs over the native app (same signing key, higher version)
- PASS: the page inside the app can be inspected
- PASS: the library loads from the website inside the app
- PASS: the web app finds the Android bridge
- PASS: ready books in the app: the-goal, a-study-in-scarlet, the-art-of-war
- PASS: the native app's finished chapter came over
- PASS: the native app's saved post came over
- PASS: the library offers to continue The Goal
- PASS: the old progress file is retired, so it is taken over only once
- PASS: tapping The Art of War opens its book page
- PASS: chapter 1 opens on post 1
- PASS: share opens Android's share sheet (com.android.intentresolver/com.android.intentresolver.ChooserActivityLauncher)
- PASS: back closes the share sheet and returns to the post
- PASS: chapter 1 complete screen
- PASS: the next chapter opens from the book page
- PASS: back from the reader goes to the book page (#/book/the-art-of-war)
- PASS: back from the book page goes to the library ()
- PASS: back on the library leaves the app
- PASS: reopening returns to the library
- PASS: the page schedules a chapter notification (on)
- PASS: the chapter notification appears
- PASS: tapping it opens the book in the app
- PASS: the profile says updates arrive on their own
- PASS: the profile shows chapter notifications
- PASS: the app opens offline after the first start
- PASS: a book opens offline
- PASS: a first start without internet says so
- PASS: 'Try again' loads the library once online
- PASS: no crashes in the crash log

## Metrics
```
{
  "version": "1.0.14",
  "cold_start_ms": 1820,
  "memory_pss_kb": 55669,
  "apk_kb": 119,
  "seconds": 129
}
```