#!/usr/bin/env python3
"""Builds the book packs in android/app/src/main/assets/books/ from the chapter sources and validates them.

Run: python3 content/src/build.py [book-id ...]   (no ids = every book)
Then: python3 tools/build_web.py
"""
import importlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

OUT_DIR = os.path.join(HERE, "..", "..", "android", "app", "src", "main", "assets", "books")
BOOKS = {
    "the-goal": ("the_goal_meta", ["ch01_03", "ch04_07", "ch08_11", "ch12_15", "ch16_20"]),
    "a-study-in-scarlet": ("scarlet_meta", ["scarlet_01_04", "scarlet_05_08", "scarlet_09_12", "scarlet_13_16", "scarlet_17_20"]),
}
# Hook art keys the web app can draw (web/public/js/art.js). Android falls back to a stamp for newer keys.
ART = {"parking", "board", "hill", "clock", "skyline", "trail", "dice", "house", "machine", "stamp", "drum", "bars", "chain",
       "lens", "fog", "door", "desert", "countdown", "pills", "ring", "cab", "lab", "peaks"}
INTERACTIVE = {"poll", "guess", "crossoff"}


def reading_text(p):
    t = p["type"]
    if t == "hook":
        return p["head"] + " " + p["sub"]
    if t == "scene":
        return " ".join(x for x in (p.get("h"), p["text"], p.get("foot")) if x)
    if t == "chat":
        return " ".join(m["text"] for m in p["msgs"])
    if t in ("poll", "guess"):
        return p["q"] + " " + " ".join(o["text"] for o in p["options"])
    if t == "crossoff":
        return " ".join(i["text"] for i in p["items"])
    if t == "myth":
        return p["myth"] + " " + p["truth"]
    if t == "idea":
        return p["head"] + " " + p["sub"]
    if t == "list":
        return p["h"] + " " + " ".join(i["text"] for i in p["items"]) + " " + p.get("text", "")
    if t == "compare":
        return p["h"] + " " + " ".join(p["left"] + p["right"]) + " " + p["text"]
    if t == "artifact":
        return " ".join(r["text"] for r in p["route"]) + " " + p.get("text", "") + " " + (p.get("foot") or "")
    if t == "cliffhanger":
        return p["text"]
    return ""


def collect(modules):
    chapters = []
    for m in modules:
        try:
            mod = importlib.import_module(m)
        except ModuleNotFoundError:
            continue
        for name in sorted(dir(mod)):
            if re.fullmatch(r"CH\d+", name):
                chapters.append(getattr(mod, name))
    chapters.sort(key=lambda c: c["n"])
    return chapters


def validate(chapters, characters):
    problems = []
    chars = {c["id"] for c in characters}
    loops, payoffs = {}, {}
    for ch in chapters:
        n = ch["n"]
        posts = ch["posts"]
        if len(posts) != 10:
            problems.append(f"ch{n}: {len(posts)} posts")
        if len(ch["recap"]) != 3:
            problems.append(f"ch{n}: recap needs 3 lines")
        if posts[0]["type"] != "hook":
            problems.append(f"ch{n}: first post not hook")
        if posts[-1]["type"] != "cliffhanger":
            problems.append(f"ch{n}: last post not cliffhanger")
        k = sum(1 for p in posts if p["type"] in INTERACTIVE)
        if not 1 <= k <= 2:
            problems.append(f"ch{n}: {k} interactive posts")
        for i, p in enumerate(posts):
            w = len(reading_text(p).split())
            if w > 85:
                problems.append(f"{n}-{i+1} {p['t']}: {w} words")
            if i and posts[i - 1]["type"] == p["type"] and p["type"] != "scene":
                problems.append(f"{n}-{i+1}: {p['type']} twice in a row")
            if p["type"] == "hook" and p["art"] not in ART:
                problems.append(f"{n}-{i+1}: unknown art {p['art']}")
            if p["type"] == "chat":
                for m in p["msgs"]:
                    if m["who"] not in chars:
                        problems.append(f"{n}-{i+1}: unknown speaker {m['who']}")
            if p["type"] == "character" and p["charId"] not in chars:
                problems.append(f"{n}-{i+1}: unknown character {p['charId']}")
            if p["type"] == "guess":
                loops[p["loopId"]] = n
            if p["type"] == "idea" and p.get("payoffLoopId"):
                payoffs[p["payoffLoopId"]] = n
    for loop, n in loops.items():
        if loop not in payoffs or payoffs[loop] <= n:
            problems.append(f"guess loop {loop} has no later payoff")
    return problems


def build(book_id):
    meta_name, modules = BOOKS[book_id]
    meta = importlib.import_module(meta_name)
    chapters = collect(modules)
    for ch in chapters:
        bg, bg2, fg = meta.COLORS[ch["n"]]
        ch["bg"], ch["fg"] = bg, fg
        if bg2:
            ch["bg2"] = bg2
        ch["minutes"] = 3
        for i, p in enumerate(ch["posts"]):
            p["id"] = f"{ch['n']}-{i + 1}"
            # id first for readability
            ch["posts"][i] = {"id": p.pop("id"), **p}
    book = dict(meta.BOOK)
    book["characters"] = meta.CHARACTERS
    book["chapters"] = [{k: ch[k] for k in ("n", "title", "hook", "bg", "bg2", "fg", "minutes", "recap", "posts") if k in ch} for ch in chapters]
    problems = validate(chapters, meta.CHARACTERS)
    out = os.path.join(OUT_DIR, book_id + ".json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(book, f, ensure_ascii=False, indent=1)
    words = sum(len(reading_text(p).split()) for ch in chapters for p in ch["posts"])
    print(f"{book_id}: {len(chapters)} chapters, {sum(len(c['posts']) for c in chapters)} posts, {words} words -> {os.path.relpath(out)}")
    if len(chapters) != 20:
        problems.append(f"{len(chapters)} of 20 chapters written")
    for p in problems:
        print(f"PROBLEM [{book_id}]:", p)
    return len(problems)


def main():
    ids = sys.argv[1:] or list(BOOKS)
    return 1 if sum(build(i) for i in ids) else 0


if __name__ == "__main__":
    sys.exit(main())
