#!/usr/bin/env python3
"""End-to-end test of the Bookreel Android app on an emulator.

The app is a thin shell that opens bookreel-sand.vercel.app (like Khabri), so the reading itself is tested
in tools/web-test/. This tests what the shell adds, against the live website:
- it installs over the last fully native release (same signing key) and takes over that app's progress;
- the library loads inside the app, and a chapter of The Art of War can be read with real taps;
- the Android back button walks back through the app and leaves it from the library;
- share opens Android's share sheet; a chapter notification is shown and opens the book;
- after the first start the app opens offline; a first start without internet says so and recovers.

The page is inspected through WebView debugging (Chrome DevTools protocol over adb).
Usage: python3 tools/e2e.py path/to/app-release.apk out_dir   (needs: pip install websocket-client pillow)
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

import websocket

APK, OUT = sys.argv[1], sys.argv[2]
PKG = "app.bookreel"
ACT = f"{PKG}/.MainActivity"
SITE = "bookreel-sand.vercel.app"
# The last release of the fully native app: the shell must install over it and take over its progress.
OLD_APK_URL = "https://github.com/Sumit607/bookreel/releases/download/v0.1.11/bookreel.apk"
SHOTS = os.path.join(OUT, "shots")
os.makedirs(SHOTS, exist_ok=True)

results = {"checks": [], "failures": [], "notes": [], "metrics": {}}
T0 = time.time()
W, H = 1080, 2400


def log(msg):
    print(f"[{time.time() - T0:7.1f}s] {msg}", flush=True)


def adb(*args, timeout=60, binary=False):
    try:
        r = subprocess.run(["adb", *args], capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return b"" if binary else ""
    return r.stdout if binary else r.stdout.decode(errors="replace") + r.stderr.decode(errors="replace")


def check(ok, msg):
    results["checks"].append({"ok": bool(ok), "check": msg})
    if not ok:
        results["failures"].append(msg)
    log(("PASS " if ok else "FAIL ") + msg)
    return bool(ok)


def note(msg):
    results["notes"].append(msg)
    log("NOTE " + msg)


def shot(name):
    data = adb("exec-out", "screencap", "-p", binary=True, timeout=30)
    if data:
        with open(os.path.join(SHOTS, f"{name}.png"), "wb") as f:
            f.write(data)


def screen_size():
    m = re.findall(r"(\d+)x(\d+)", adb("shell", "wm", "size"))
    return (int(m[-1][0]), int(m[-1][1])) if m else (1080, 2400)


def tap(x, y):
    adb("shell", "input", "tap", str(int(x)), str(int(y)))


def key(code):
    adb("shell", "input", "keyevent", str(code))
    time.sleep(1)


# ------------------------------------------------------------------ native screens (uiautomator)

def dump():
    for _ in range(4):
        if "dumped" in adb("shell", "uiautomator", "dump", "/sdcard/ui.xml", timeout=45).lower():
            xml = adb("shell", "cat", "/sdcard/ui.xml", timeout=20)
            start, end = xml.find("<?xml"), xml.rfind("</hierarchy>")
            if start >= 0 and end > start:
                try:
                    return ET.fromstring(xml[start:end + len("</hierarchy>")])
                except ET.ParseError:
                    pass
        time.sleep(1)
    return None


def bounds(s):
    m = re.findall(r"\d+", s or "")
    return tuple(int(x) for x in m) if len(m) == 4 else None


def find_native(text, root=None):
    root = root if root is not None else dump()
    if root is None:
        return None
    for n in root.iter("node"):
        for k in ("text", "content-desc"):
            if text.lower() in n.get(k, "").lower():
                b = bounds(n.get("bounds"))
                if b:
                    return b
    return None


def wait_native(text, wait=20):
    end = time.time() + wait
    while time.time() < end:
        b = find_native(text)
        if b:
            return b
        time.sleep(1)
    return None


def focused():
    out = adb("shell", "dumpsys", "window")
    m = re.search(r"mCurrentFocus=Window\{[^}]*\s(\S+)\}", out)
    return m.group(1) if m else ""


def webview_origin():
    """Where the WebView starts on screen (it sits below the status bar)."""
    root = dump()
    if root is not None:
        for n in root.iter("node"):
            if n.get("class") == "android.webkit.WebView":
                b = bounds(n.get("bounds"))
                if b:
                    return b[0], b[1]
    return 0, 0


# ------------------------------------------------------------------ the page (DevTools protocol)

class Page:
    def __init__(self):
        self.ws = None
        self.n = 0

    def reset(self):
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass
        self.ws = None

    def connect(self, wait=45):
        self.reset()
        end = time.time() + wait
        while time.time() < end:
            pid = adb("shell", "pidof", PKG).strip().split(" ")[0]
            m = re.search(r"webview_devtools_remote_%s\b" % re.escape(pid), adb("shell", "cat", "/proc/net/unix")) if pid else None
            if m:
                adb("forward", "--remove-all")
                adb("forward", "tcp:9222", "localabstract:" + m.group(0))
                try:
                    pages = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=5))
                    page = next((p for p in pages if p.get("type") == "page" and SITE in p.get("url", "")), None)
                    if page:
                        self.ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=30, suppress_origin=True)
                        return True
                except Exception:
                    pass
            time.sleep(1)
        return False

    def js(self, expr):
        """Evaluates an expression in the page (awaiting promises); None on any error."""
        for attempt in range(2):
            if not self.ws and not self.connect(20):
                return None
            self.n += 1
            msg = {"id": self.n, "method": "Runtime.evaluate",
                   "params": {"expression": expr, "awaitPromise": True, "returnByValue": True}}
            try:
                self.ws.send(json.dumps(msg))
                while True:
                    r = json.loads(self.ws.recv())
                    if r.get("id") == self.n:
                        res = r.get("result", {})
                        if "exceptionDetails" in res:
                            return None
                        return res.get("result", {}).get("value")
            except Exception:
                self.reset()
        return None

    def wait(self, expr, wait=20):
        end = time.time() + wait
        while time.time() < end:
            if self.js(expr):
                return True
            time.sleep(0.5)
        return False

    def rect(self, expr):
        """Screen centre of an element found by a JS expression, or None."""
        r = self.js(f"(() => {{ const e = {expr}; if (!e) return null; const b = e.getBoundingClientRect();"
                    f" return [b.left + b.width / 2, b.top + b.height / 2, window.devicePixelRatio]; }})()")
        if not r:
            return None
        ox, oy = origin()
        return ox + r[0] * r[2], oy + r[1] * r[2]

    def tap(self, expr):
        """Scrolls the element into view and taps it like a finger would."""
        self.js(f"(() => {{ const e = {expr}; if (e) e.scrollIntoView({{ block: 'center' }}); }})()")
        time.sleep(0.4)
        p = self.rect(expr)
        if p:
            tap(*p)
            time.sleep(0.8)
        return p is not None


page = Page()
by_text = lambda t: f"[...document.querySelectorAll('button,a')].find(e => e.textContent.trim() === {json.dumps(t)})"
COUNTER = "(() => { const m = /^(\\d+)\\/\\d+$/.exec((document.querySelector('.rcount') || {}).textContent || ''); return m ? +m[1] : 0; })()"


def counter():
    return page.js(COUNTER) or 0


def next_post(expected):
    for _ in range(6):
        p = page.js("(() => { const b = document.querySelector('.pager').getBoundingClientRect(); return [b.left + b.width * 0.88, b.top + b.height * 0.42, devicePixelRatio]; })()")
        if p:
            ox, oy = origin()
            tap(ox + p[0] * p[2], oy + p[1] * p[2])
        end = time.time() + 3
        while time.time() < end:
            if counter() == expected:
                return True
            time.sleep(0.3)
    return check(False, f"move to post {expected} with a tap")


ORIGIN = None


def origin():
    """The WebView's top-left corner on screen, looked up once per start (it sits below the status bar)."""
    global ORIGIN
    if ORIGIN is None:
        ORIGIN = webview_origin()
    return ORIGIN


def cold_start():
    global ORIGIN
    ORIGIN = None
    adb("shell", "am", "force-stop", PKG)
    time.sleep(1)
    out = adb("shell", "am", "start", "-W", "-n", ACT, timeout=90)
    m = re.search(r"TotalTime:\s*(\d+)", out)
    return int(m.group(1)) if m else None


def online(on):
    adb("shell", "cmd", "connectivity", "airplane-mode", "disable" if on else "enable")
    for svc in ("wifi", "data"):
        adb("shell", "svc", svc, "enable" if on else "disable")
    time.sleep(4)


def is_offline():
    return "bytes from" not in adb("shell", "ping", "-c", "1", "-W", "2", "8.8.8.8", timeout=15)


# ------------------------------------------------------------------ steps

def install_old_native_app():
    path = os.path.join(OUT, "old-native.apk")
    try:
        urllib.request.urlretrieve(OLD_APK_URL, path)
    except Exception as e:
        note(f"could not download the last native release ({e}); testing a fresh install only")
        return False
    ok = check("Success" in adb("install", "-r", path, timeout=240), "the last native release (0.1.11) installs")
    os.remove(path)
    if ok:
        adb("shell", "am", "start", "-W", "-n", ACT, timeout=90)
        time.sleep(5)
        shot("00_old_native_app")
        adb("shell", "am", "force-stop", PKG)
    return ok


def seed_old_progress():
    """What the native app keeps in files/state.json: chapter 1 of The Goal finished, one saved post."""
    adb("root")
    time.sleep(3)
    adb("wait-for-device")
    data = f"/data/data/{PKG}"
    uid = adb("shell", "stat", "-c", "%u", data).strip()
    if not uid.isdigit():
        note("adb root is not available here; the progress hand-over is covered by the unit and web tests")
        return False
    day = 86400000
    t = int(time.time() * 1000) - day
    day_key = time.strftime("%Y-%m-%d", time.localtime(t / 1000))
    state = {
        "progress": {"the-goal:1": 9}, "lastOpened": {"bookId": "the-goal", "ch": 1, "post": 9},
        "completions": {"the-goal:1": {"at": t, "dayKey": day_key, "viewed": 10}},
        "viewed": {"the-goal:1": list(range(10))},
        "xp": [{"event": "chapter", "ref": "the-goal:1", "amount": 100}],
        "streak": 1, "bestStreak": 1, "lastDay": day_key,
        "saves": {"the-goal:1-4": {"bookId": "the-goal", "ch": 1, "index": 3, "at": t}},
    }
    local = os.path.join(OUT, "old-state.json")
    with open(local, "w") as f:
        json.dump(state, f)
    adb("shell", "mkdir", "-p", f"{data}/files")
    adb("push", local, f"{data}/files/state.json")
    adb("shell", "chown", "-R", f"{uid}:{uid}", f"{data}/files")
    adb("shell", "chmod", "600", f"{data}/files/state.json")
    adb("shell", "restorecon", "-R", f"{data}/files")
    return "state.json" in adb("shell", "ls", f"{data}/files")


def main():
    global W, H, ORIGIN
    adb("wait-for-device")
    W, H = screen_size()
    online(True)

    had_old = install_old_native_app()
    seeded = had_old and seed_old_progress()

    # ---- the shell installs over the native app
    out = adb("install", "-r", APK, timeout=240)
    check("Success" in out, "the shell installs over the native app (same signing key, higher version)" if had_old else "the shell installs")
    version = re.search(r"versionName=(\S+)", adb("shell", "dumpsys", "package", PKG))
    results["metrics"]["version"] = version.group(1) if version else None
    adb("shell", "pm", "grant", PKG, "android.permission.POST_NOTIFICATIONS")

    t = cold_start()
    results["metrics"]["cold_start_ms"] = t
    check(page.connect(60), "the page inside the app can be inspected")
    check(page.wait("!!document.querySelector('.bgrid')", 45), "the library loads from the website inside the app")
    page.wait("window.__bookreel && window.__bookreel.ready().then(() => true)", 30)
    check(page.js("!!(window.__bookreel && window.__bookreel.native)") is True, "the web app finds the Android bridge")
    ready = page.js("window.__bookreel.index().books.filter(b => b.status === 'ready').map(b => b.id)") or []
    check("the-art-of-war" in ready and "the-goal" in ready, f"ready books in the app: {', '.join(ready)}")
    time.sleep(1)
    shot("01_library")

    if seeded:
        st = page.js("window.__bookreel.state") or {}
        check("the-goal:1" in st.get("completions", {}), "the native app's finished chapter came over")
        check(len(st.get("saves", {})) == 1, "the native app's saved post came over")
        check(page.wait("!!document.querySelector('.cont')", 5), "the library offers to continue The Goal")
        files = set(adb("shell", "ls", f"/data/data/{PKG}/files").split())
        check("state.migrated.json" in files and "state.json" not in files, "the old progress file is retired, so it is taken over only once")

    # ---- read chapter 1 of The Art of War with real taps
    AOW = "document.querySelector('[data-act=book][data-id=the-art-of-war]')"
    page.tap(AOW)
    check(page.wait("location.hash === '#/book/the-art-of-war' && !!document.querySelector('[data-act=start]')", 15), "tapping The Art of War opens its book page")
    shot("02_book")
    page.tap("document.querySelector('[data-act=start]')")
    check(page.wait(COUNTER + " === 1", 15), "chapter 1 opens on post 1")
    shot("03_post_01")

    # share: Android's share sheet, then back to the post
    page.tap("document.querySelector('.reader [data-act=share]')")
    time.sleep(2)
    f = focused()
    check("Chooser" in f or "Resolver" in f or find_native("Share") is not None, f"share opens Android's share sheet ({f})")
    shot("04_share")
    key(4)
    time.sleep(1)
    check(counter() == 1 and PKG in focused(), "back closes the share sheet and returns to the post")

    for p in range(2, 11):
        if not next_post(p):
            break
        if p in (2, 5, 10):
            shot(f"05_post_{p:02d}")
    page.tap(by_text("Finish chapter"))
    check(page.wait("!!document.querySelector('.stamp')", 10), "chapter 1 complete screen")
    time.sleep(1)
    shot("06_chapter_done")

    # ---- the Android back button, from a fresh start: library > book > reader, then back out
    cold_start()
    page.connect(45)
    page.wait("!!document.querySelector('.bgrid')", 30)
    page.tap(AOW)
    page.wait("!!document.querySelector('[data-act=start]')", 10)
    page.tap("document.querySelector('[data-act=start]')")
    check(page.wait(COUNTER + " >= 1", 10), "the next chapter opens from the book page")
    key(4)
    check(page.wait("location.hash.startsWith('#/book/')", 5), f"back from the reader goes to the book page ({page.js('location.hash')})")
    key(4)
    check(page.wait("location.hash === '' || location.hash === '#/'", 5) and PKG in focused(),
          f"back from the book page goes to the library ({page.js('location.hash')})")
    key(4)
    time.sleep(1.5)
    check(PKG not in focused(), "back on the library leaves the app")
    adb("shell", "am", "start", "-n", ACT)
    time.sleep(2)
    check(PKG in focused() and page.wait("!!document.querySelector('.bgrid')", 10), "reopening returns to the library")

    # ---- a chapter notification, shown and tapped
    r = page.js("BookreelAndroid.scheduleRelease('the-art-of-war', String(Date.now() + 15000), "
                "'Chapter 2 of The Art of War is ready', 'Waging War: be quick, and let the enemy feed you.', '#/book/the-art-of-war')")
    check(r == "on", f"the page schedules a chapter notification ({r})")
    shown = False
    end = time.time() + 180
    while time.time() < end and not shown:
        shown = "Chapter 2 of The Art of War is ready" in adb("shell", "dumpsys", "notification", "--noredact")
        time.sleep(5)
    check(shown, "the chapter notification appears")
    if shown:
        page.js("location.hash = '#/profile'")
        adb("shell", "cmd", "statusbar", "expand-notifications")
        time.sleep(2)
        shot("07_notification")
        b = wait_native("Chapter 2 of The Art of War", 10)
        if b:
            tap((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
            time.sleep(3)
            check(page.wait("location.hash === '#/book/the-art-of-war'", 10), "tapping it opens the book in the app")
        else:
            adb("shell", "cmd", "statusbar", "collapse")
            check(False, "the notification can be tapped")

    # ---- the profile inside the app
    page.js("location.hash = '#/profile'")
    page.wait("!!document.querySelector('.prof')", 5)
    about = page.js("document.querySelector('.prof').innerText") or ""
    check("Android app" in about and "nothing to reinstall" in about, "the profile says updates arrive on their own")
    check("Chapter notifications" in about, "the profile shows chapter notifications")
    shot("08_profile")

    # ---- offline after the first start
    online(False)
    if is_offline():
        cold_start()
        page.connect(45)
        check(page.wait("!!document.querySelector('.bgrid')", 30), "the app opens offline after the first start")
        page.js("location.hash = '#/book/the-art-of-war'")
        check(page.wait("!!document.querySelector('[data-act=start]')", 10), "a book opens offline")
        shot("09_offline")

        # a first start with no internet at all
        adb("shell", "pm", "clear", PKG)
        adb("shell", "am", "start", "-n", ACT)
        b = wait_native("No internet connection", 30)
        check(b is not None, "a first start without internet says so")
        shot("10_first_start_offline")
        online(True)
        retry = wait_native("Try again", 5)
        if retry:
            tap((retry[0] + retry[2]) / 2, (retry[1] + retry[3]) / 2)
        page.connect(60)
        check(page.wait("!!document.querySelector('.bgrid')", 45), "'Try again' loads the library once online")
        shot("11_recovered")
    else:
        online(True)
        note("the emulator stayed online with airplane mode on; offline checks skipped")

    # ---- health
    crash = adb("logcat", "-d", "-b", "crash")
    with open(os.path.join(OUT, "crash-log.txt"), "w") as f:
        f.write(crash)
    check(PKG not in crash, "no crashes in the crash log")
    mem = adb("shell", "dumpsys", "meminfo", PKG)
    mm = re.search(r"TOTAL PSS:\s*(\d+)", mem) or re.search(r"TOTAL\s+(\d+)", mem)
    if mm:
        results["metrics"]["memory_pss_kb"] = int(mm.group(1))
    results["metrics"]["apk_kb"] = round(os.path.getsize(APK) / 1024)
    finish()


def finish():
    results["metrics"]["seconds"] = round(time.time() - T0)
    small_shots()
    with open(os.path.join(OUT, "summary.json"), "w") as f:
        json.dump(results, f, indent=2)
    lines = ["# Bookreel Android shell: end-to-end test", ""]
    lines += [f"- {'PASS' if c['ok'] else 'FAIL'}: {c['check']}" for c in results["checks"]]
    lines += [f"- NOTE: {n}" for n in results["notes"]]
    lines += ["", "## Metrics", "```", json.dumps(results["metrics"], indent=2), "```"]
    with open(os.path.join(OUT, "SUMMARY.md"), "w") as f:
        f.write("\n".join(lines))
    log(f"{len(results['checks'])} checks, {len(results['failures'])} failures")
    sys.exit(1 if results["failures"] else 0)


def small_shots():
    """Screenshots as 432 px JPEGs in OUT/small (the full PNGs are too big to keep)."""
    try:
        from PIL import Image
    except ImportError:
        return
    small = os.path.join(OUT, "small")
    os.makedirs(small, exist_ok=True)
    for n in sorted(os.listdir(SHOTS)):
        try:
            im = Image.open(os.path.join(SHOTS, n)).convert("RGB")
        except Exception:
            continue
        im = im.resize((432, int(im.height * 432 / im.width)))
        im.save(os.path.join(small, n.replace(".png", ".jpg")), quality=80)
        os.remove(os.path.join(SHOTS, n))
    if not os.listdir(SHOTS):
        os.rmdir(SHOTS)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # report what was checked so far instead of a bare traceback
        check(False, f"test stopped: {e!r}")
        finish()
