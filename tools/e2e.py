#!/usr/bin/env python3
"""End-to-end test of the release APK on an emulator.

Reads every post of every chapter like a real reader (taps, polls, saves), checks resume after a
force-stop, the daily-release flow with the notification permission, locked chapters, the notebook,
the profile and dark theme. Saves screenshots, contact sheets, startup times, frame stats, memory and
a crash check to OUT. Exits non-zero if any check fails.

Usage: python3 tools/e2e.py path/to/app-release.apk out_dir
"""
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

APK, OUT = sys.argv[1], sys.argv[2]
PKG = "app.bookreel"
ACT = f"{PKG}/.MainActivity"
SHOTS = os.path.join(OUT, "shots")
os.makedirs(SHOTS, exist_ok=True)

results = {"checks": [], "failures": [], "metrics": {}}
T0 = time.time()


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
    return ok


def screen_size():
    out = adb("shell", "wm", "size")
    m = re.findall(r"(\d+)x(\d+)", out)
    return (int(m[-1][0]), int(m[-1][1])) if m else (1080, 2400)


def shot(name):
    data = adb("exec-out", "screencap", "-p", binary=True, timeout=30)
    if data:
        with open(os.path.join(SHOTS, f"{name}.png"), "wb") as f:
            f.write(data)


def dump():
    for _ in range(5):
        out = adb("shell", "uiautomator", "dump", "/sdcard/ui.xml", timeout=45)
        if "dumped" in out.lower():
            xml = adb("shell", "cat", "/sdcard/ui.xml", timeout=20)
            start = xml.find("<?xml")
            end = xml.rfind("</hierarchy>")
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


def all_text(root):
    if root is None:
        return []
    out = []
    for n in root.iter("node"):
        for key in ("text", "content-desc"):
            v = n.get(key, "")
            if v:
                out.append((v, bounds(n.get("bounds"))))
    return out


def find(text, exact=False, root=None):
    root = root if root is not None else dump()
    for v, b in all_text(root):
        if b and ((v == text) if exact else (text.lower() in v.lower())):
            return b
    return None


def tap(x, y):
    adb("shell", "input", "tap", str(int(x)), str(int(y)))


def tap_text(text, exact=False, wait=12):
    end = time.time() + wait
    while time.time() < end:
        b = find(text, exact)
        if b:
            tap((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
            time.sleep(0.8)
            return True
        time.sleep(0.8)
    return check(False, f"could find and tap '{text}'")


def wait_text(text, wait=12, exact=False):
    end = time.time() + wait
    while time.time() < end:
        if find(text, exact):
            return True
        time.sleep(0.8)
    return False


def counter(root):
    for v, _ in all_text(root):
        m = re.fullmatch(r"(\d+)/10", v.strip())
        if m:
            return int(m.group(1))
    return None


W, H = 1080, 2400


def next_post(expected):
    for _ in range(12):
        tap(W * 0.88, H * 0.42)
        time.sleep(0.7)
        c = counter(dump())
        if c == expected:
            return True
    return check(False, f"move to post {expected}")


def back():
    adb("shell", "input", "keyevent", "4")
    time.sleep(0.8)


def cold_start():
    adb("shell", "am", "force-stop", PKG)
    time.sleep(1)
    out = adb("shell", "am", "start", "-W", "-n", ACT, timeout=60)
    m = re.search(r"TotalTime:\s*(\d+)", out)
    return int(m.group(1)) if m else None


def read_chapter(ch, save_posts=(), extra=None):
    """Read posts 1..10 of the open chapter, screenshot each, then finish it."""
    c = None
    end = time.time() + 15
    while c is None and time.time() < end:
        c = counter(dump())
        if c is None:
            time.sleep(0.8)
    if not check(c is not None, f"chapter {ch} opened"):
        return False
    for p in range(c, 11):
        time.sleep(0.4)
        shot(f"c{ch:02d}_p{p:02d}")
        if p in save_posts:
            if tap_text("Save to notebook", wait=5):
                check(wait_text("Saved to your notebook", 5), f"saved post {ch}-{p}")
        if extra:
            extra(ch, p)
        if p < 10:
            if not next_post(p + 1):
                return False
    label = "Finish the book" if ch == 20 else "Finish chapter"
    if not tap_text(label, wait=8):
        return False
    ok = wait_text("SHIPPED", 10) or wait_text("FINISHED", 5)
    check(ok, f"chapter {ch} complete screen")
    time.sleep(0.8)
    shot(f"c{ch:02d}_done")
    return ok


def main():
    global W, H
    size = os.path.getsize(APK)
    results["metrics"]["apk_bytes"] = size
    log(f"APK {size / 1e6:.2f} MB")
    out = adb("install", "-r", APK, timeout=180)
    if not check("Success" in out, "APK installs"):
        log(out)
        return finish()
    W, H = screen_size()
    results["metrics"]["screen"] = f"{W}x{H}"

    starts = [cold_start() for _ in range(3)]
    results["metrics"]["cold_start_ms"] = starts
    log(f"cold starts {starts}")
    check(wait_text("PICK YOUR NEXT BOOK", 20), "library screen shows")
    time.sleep(1)
    shot("00_library")

    # Book page and a locked chapter
    check(tap_text("THE GOAL", exact=True), "open The Goal")
    check(wait_text("Start Chapter 1", 10), "book page shows start button")
    shot("01_book")
    adb("shell", "input", "swipe", str(W // 2), str(int(H * 0.8)), str(W // 2), str(int(H * 0.25)), "400")
    time.sleep(1)
    shot("01b_book_grid")
    if tap_text("HERBIE", exact=True, wait=6):
        check(wait_text("Unlocks when you finish Chapter 7", 6), "locked chapter sheet explains the unlock")
        shot("02_locked_sheet")
        back()
    adb("shell", "input", "swipe", str(W // 2), str(int(H * 0.3)), str(W // 2), str(int(H * 0.9)), "300")
    time.sleep(0.8)

    # Chapter 1 with a resume test after post 3
    tap_text("Start Chapter 1")
    check(wait_text("1/10", 10), "reader opens on post 1")
    for p in range(1, 4):
        shot(f"c01_p{p:02d}")
        if p < 3:
            next_post(p + 1)
    shot("c01_p03")
    cold_start()
    check(wait_text("CONTINUE · CHAPTER 1 OF 20", 15), "library offers to continue after restart")
    shot("03_continue_card")
    tap_text("CONTINUE · CHAPTER 1 OF 20")
    check(counter(dump()) == 3, "resumes on post 3 after a force-stop")
    next_post(4)
    read_chapter(1, save_posts=(4, 6))

    # Daily release: permission dialog, then read on anyway
    if tap_text("Release it to me tomorrow", wait=8):
        if wait_text("Allow", 8, exact=True):
            shot("04_permission")
            tap_text("Allow", exact=True)
        check(wait_text("Unlocks", 8), "daily release confirms the unlock time")
        shot("05_daily_scheduled")
    tap_text("Read Chapter 2 now")

    for ch in range(2, 21):
        if not read_chapter(ch, save_posts=(4,) if ch in (3, 8, 15) else ()):
            break
        if ch < 20:
            if not tap_text(f"Read Chapter {ch + 1} now", wait=8):
                break
    check(wait_text("BOOK BADGE EARNED", 6), "book badge after chapter 20")
    shot("06_book_finished")

    tap_text("Back to the book")
    time.sleep(1)
    shot("07_book_complete")
    tap_text("Notebook", exact=True)
    check(wait_text("SAVED POSTS", 8), "notebook opens")
    check(wait_text("5 saved", 4), "notebook lists the 5 saved posts")
    shot("08_notebook")
    tap_text("Profile", exact=True)
    check(wait_text("READER", 8), "profile opens")
    shot("09_profile")
    tap_text("Dark", exact=True)
    time.sleep(1)
    shot("10_profile_dark")
    tap_text("Library", exact=True)
    time.sleep(1)
    shot("11_library_dark")

    # Health
    crash = adb("logcat", "-d", "-b", "crash")
    check(PKG not in crash, "no crashes in the crash log")
    with open(os.path.join(OUT, "crash-log.txt"), "w") as f:
        f.write(crash)
    gfx = adb("shell", "dumpsys", "gfxinfo", PKG)
    with open(os.path.join(OUT, "gfxinfo.txt"), "w") as f:
        f.write(gfx)
    m = re.search(r"Janky frames:\s*(\d+)\s*\(([\d.]+)%\)", gfx)
    tf = re.search(r"Total frames rendered:\s*(\d+)", gfx)
    if m:
        results["metrics"]["janky_frames"] = int(m.group(1))
        results["metrics"]["janky_pct_emulator"] = float(m.group(2))
    if tf:
        results["metrics"]["frames"] = int(tf.group(1))
    mem = adb("shell", "dumpsys", "meminfo", PKG)
    mm = re.search(r"TOTAL PSS:\s*(\d+)", mem) or re.search(r"TOTAL\s+(\d+)", mem)
    if mm:
        results["metrics"]["memory_pss_kb"] = int(mm.group(1))
    return finish()


def finish():
    results["metrics"]["seconds"] = round(time.time() - T0)
    contact_sheets()
    with open(os.path.join(OUT, "summary.json"), "w") as f:
        json.dump(results, f, indent=2)
    lines = ["# Bookreel end-to-end test", ""]
    lines += [f"- {'PASS' if c['ok'] else 'FAIL'}: {c['check']}" for c in results["checks"]]
    lines += ["", "## Metrics", "```", json.dumps(results["metrics"], indent=2), "```"]
    with open(os.path.join(OUT, "SUMMARY.md"), "w") as f:
        f.write("\n".join(lines))
    log(f"{len(results['checks'])} checks, {len(results['failures'])} failures")
    sys.exit(1 if results["failures"] else 0)


def contact_sheets():
    try:
        from PIL import Image
    except ImportError:
        return
    small = os.path.join(OUT, "small")
    os.makedirs(small, exist_ok=True)
    names = sorted(n for n in os.listdir(SHOTS) if n.endswith(".png"))
    thumbs = {}
    for n in names:
        try:
            im = Image.open(os.path.join(SHOTS, n)).convert("RGB")
        except Exception:
            continue
        w = 432
        im = im.resize((w, int(im.height * w / im.width)))
        im.save(os.path.join(small, n.replace(".png", ".jpg")), quality=80)
        thumbs[n] = im
        os.remove(os.path.join(SHOTS, n))
    os.rmdir(SHOTS) if not os.listdir(SHOTS) else None
    sheets = os.path.join(OUT, "sheets")
    os.makedirs(sheets, exist_ok=True)
    for ch in range(1, 21):
        group = [thumbs[n] for n in sorted(thumbs) if n.startswith(f"c{ch:02d}_")]
        if not group:
            continue
        tw, th = 270, int(group[0].height * 270 / group[0].width)
        cols = 6
        rows = (len(group) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * tw, rows * th), (20, 20, 20))
        for i, im in enumerate(group):
            sheet.paste(im.resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
        sheet.save(os.path.join(sheets, f"chapter-{ch:02d}.jpg"), quality=82)


if __name__ == "__main__":
    main()
