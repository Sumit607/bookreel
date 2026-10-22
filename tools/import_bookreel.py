#!/usr/bin/env python3
"""Turns a Bookreel made in the app (the pack the converter assembles) into a built-in library book.

    python3 tools/import_bookreel.py <converted.json> <book-id> [--source "Project Gutenberg #132"] [--year 1910]
        [--authors "Sun Tzu"] [--translator "Lionel Giles"] [--title "The Art of War"] [--check-only]

- Keeps the converted text as it is; fixes are made in the pack afterwards and checked again with --check-only.
- Gives every post its id ("<chapter>-<post>"), sets chapter minutes from the reading length, and the rights.
- Checks the pack against the same rules as the Android ContentTest (and the fields each post type needs),
  then writes content/books/<id>.json and marks the book ready in index.json.
Run python3 tools/build_web.py afterwards to copy it to the web app.
"""
import argparse
import json
import math
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOKS = os.path.join(ROOT, "content", "books")
KNOWN_ART = {"parking", "board", "hill", "clock", "skyline", "trail", "dice", "house", "machine", "stamp", "drum", "bars", "chain",
             "lens", "fog", "door", "desert", "countdown", "pills", "ring", "cab", "lab", "peaks"}
# Fields each post type must have for the Android app to parse it (data classes without defaults).
REQUIRED = {
    "hook": ["kicker", "head", "sub", "art"], "scene": ["label", "text"], "chat": ["label", "msgs"], "character": ["charId"],
    "twist": ["head", "text", "status"], "poll": ["label", "q", "options", "reveal", "hint"],
    "guess": ["label", "q", "options", "reveal", "hint", "loopId"], "crossoff": ["title", "items", "answer"],
    "myth": ["myth", "truth"], "idea": ["label", "head", "sub"], "list": ["label", "h", "items"],
    "compare": ["label", "h", "leftTitle", "left", "rightTitle", "right", "text"], "artifact": ["template"], "cliffhanger": ["text"],
}
INTERACTIVE = {"poll", "guess", "crossoff"}


def reading_text(p):
    t = p["type"]
    j = lambda xs, k="text": " ".join(x.get(k, "") if isinstance(x, dict) else str(x) for x in xs or [])
    return {
        "hook": lambda: f"{p.get('head', '')} {p.get('sub', '')}",
        "scene": lambda: " ".join(x for x in (p.get("h"), p.get("text"), p.get("foot")) if x),
        "chat": lambda: j(p.get("msgs")),
        "character": lambda: "",
        "twist": lambda: f"{p.get('head', '')} {p.get('text', '')}",
        "poll": lambda: f"{p.get('q', '')} {j(p.get('options'))}",
        "guess": lambda: f"{p.get('q', '')} {j(p.get('options'))}",
        "crossoff": lambda: j(p.get("items")),
        "myth": lambda: f"{p.get('myth', '')} {p.get('truth', '')}",
        "idea": lambda: f"{p.get('head', '')} {p.get('sub', '')}",
        "list": lambda: f"{p.get('h', '')} {j(p.get('items'))} {p.get('text', '')}",
        "compare": lambda: f"{p.get('h', '')} {' '.join((p.get('left') or []) + (p.get('right') or []))} {p.get('text', '')}",
        "artifact": lambda: f"{j(p.get('route'))} {p.get('text', '')} {p.get('foot') or ''}",
        "cliffhanger": lambda: p.get("text", ""),
    }.get(t, lambda: p.get("text", ""))()


def words(s):
    return len([w for w in re.split(r"\s+", s) if w])


def check(pack):
    """The ContentTest rules, plus the fields each post type needs. Returns a list of problems."""
    problems = []
    chars = {c["id"] for c in pack.get("characters", [])}
    if len(pack["chapters"]) != 20:
        problems.append(f"{len(pack['chapters'])} chapters")
    loops, payoffs, ids = {}, {}, set()
    for ci, ch in enumerate(pack["chapters"], 1):
        if ch.get("n") != ci:
            problems.append(f"chapter numbering at {ci}")
        if len(ch.get("recap") or []) != 3:
            problems.append(f"ch{ci}: recap needs 3 lines")
        posts = ch["posts"]
        if len(posts) != 10:
            problems.append(f"ch{ci}: {len(posts)} posts")
        if posts[0]["type"] != "hook":
            problems.append(f"ch{ci}: post 1 is not a hook")
        if posts[-1]["type"] != "cliffhanger":
            problems.append(f"ch{ci}: post 10 is not a cliffhanger")
        inter = sum(p["type"] in INTERACTIVE for p in posts)
        if not 1 <= inter <= 2:
            problems.append(f"ch{ci}: {inter} interactive posts")
        for i, p in enumerate(posts):
            where = f"{p.get('id')}"
            if p.get("id") != f"{ci}-{i + 1}":
                problems.append(f"{where}: id should be {ci}-{i + 1}")
            if p.get("id") in ids:
                problems.append(f"{where}: duplicate id")
            ids.add(p.get("id"))
            if p["type"] not in REQUIRED:
                problems.append(f"{where}: unknown type {p['type']}")
                continue
            for k in ["t"] + REQUIRED[p["type"]]:
                if p.get(k) in (None, "", []):
                    problems.append(f"{where}: missing {k}")
            for k in ("options",):
                for o in p.get(k) or []:
                    if not o.get("text") or "feedback" not in o:
                        problems.append(f"{where}: option needs text and feedback")
            w = words(reading_text(p))
            if w > 85:
                problems.append(f"{where}: {w} words (max 85)")
            if i > 0 and posts[i - 1]["type"] == p["type"] and p["type"] != "scene":
                problems.append(f"{where}: same type twice in a row")
            if p["type"] == "hook" and p.get("art") not in KNOWN_ART:
                problems.append(f"{where}: unknown art {p.get('art')}")
            if p["type"] == "chat":
                for m in p.get("msgs") or []:
                    if m.get("who") not in chars:
                        problems.append(f"{where}: unknown speaker {m.get('who')}")
            if p["type"] == "character" and p.get("charId") not in chars:
                problems.append(f"{where}: unknown character {p.get('charId')}")
            if p["type"] == "guess":
                loops[p["loopId"]] = ci
            if p["type"] == "idea" and p.get("payoffLoopId"):
                payoffs[p["payoffLoopId"]] = ci
    for loop, n in loops.items():
        if loop not in payoffs or payoffs[loop] <= n:
            problems.append(f"guess loop {loop} has no later payoff")
    return problems


def dump_index(index):
    """index.json in its hand-kept layout: one key per line, lists and covers inline."""
    assert list(index) == ["books"], "index.json has keys this formatter does not know"
    inline = lambda v: "{ " + ", ".join(f"{json.dumps(k)}: {json.dumps(x, ensure_ascii=False)}" for k, x in v.items()) + " }" if isinstance(v, dict) else json.dumps(v, ensure_ascii=False)
    lines = ["{", '  "books": [']
    for bi, b in enumerate(index["books"]):
        lines.append("    {")
        items = list(b.items())
        lines += [f"      {json.dumps(k)}: {inline(v)}" + ("," if i < len(items) - 1 else "") for i, (k, v) in enumerate(items)]
        lines.append("    }" + ("," if bi < len(index["books"]) - 1 else ""))
    return "\n".join(lines + ["  ]", "}"]) + "\n"


def check_all():
    """Every ready book in content/books/index.json must have a pack that passes check()."""
    with open(os.path.join(BOOKS, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    bad = 0
    for b in index["books"]:
        if b.get("status") != "ready":
            continue
        try:
            with open(os.path.join(BOOKS, b["file"]), encoding="utf-8") as f:
                pack = json.load(f)
            problems = check(pack)
            if pack.get("id") != b["id"]:
                problems.append(f"pack id is {pack.get('id')}, index.json says {b['id']}")
        except (OSError, KeyError, ValueError) as e:
            problems = [f"cannot read the pack: {e}"]
        for p in problems:
            print(f"PROBLEM {b['id']}: {p}")
        print(f"{b['id']}: {len(problems)} problems")
        bad += bool(problems)
    return 1 if bad else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?")
    ap.add_argument("book_id", nargs="?")
    ap.add_argument("--check-all", action="store_true", help="check every ready book in content/books and stop")
    ap.add_argument("--source", default="")
    ap.add_argument("--year", type=int)
    ap.add_argument("--authors", default="")
    ap.add_argument("--translator", default="")
    ap.add_argument("--title", default="")
    ap.add_argument("--check-only", action="store_true")
    a = ap.parse_args()
    if a.check_all:
        return check_all()
    if not a.src or not a.book_id:
        ap.error("src and book_id are required unless --check-all is given")
    with open(a.src, encoding="utf-8") as f:
        pack = json.load(f)
    if a.check_only:
        problems = check(pack)
        for p in problems:
            print("PROBLEM:", p)
        print(f"{a.src}: {len(problems)} problems")
        return 1 if problems else 0

    pack["id"] = a.book_id
    if a.title:
        pack["title"] = a.title
    if a.authors:
        pack["authors"] = [x.strip() for x in a.authors.split(",")]
    rights = {"status": "public-domain", "source": a.source or pack.get("rights", {}).get("source", "")}
    if a.year:
        rights["year"] = a.year
    if a.translator:
        rights["translator"] = a.translator
    pack["rights"] = rights
    total = 0
    for ci, ch in enumerate(pack["chapters"], 1):
        ch["n"] = ci
        ch["posts"] = [{"id": f"{ci}-{i + 1}", **{k: v for k, v in p.items() if k != "id"}} for i, p in enumerate(ch["posts"])]
        w = sum(words(reading_text(p)) for p in ch["posts"])
        ch["minutes"] = max(2, math.ceil(w / 200) + 1)  # reading plus taps on interactive posts
        total += ch["minutes"]
    order = ["schemaVersion", "id", "packVersion", "title", "authors", "category", "blurb", "narrator", "rights", "madeWith", "characters", "chapters"]
    pack = {k: pack[k] for k in order if k in pack} | {k: v for k, v in pack.items() if k not in order}

    problems = check(pack)
    out = os.path.join(BOOKS, a.book_id + ".json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(pack, f, ensure_ascii=False, indent=1)
    with open(os.path.join(BOOKS, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    entry = next((b for b in index["books"] if b["id"] == a.book_id), None)
    if entry is None:
        entry = {"id": a.book_id, "title": pack["title"], "authors": pack["authors"], "category": pack.get("category", "Classic"),
                 "cover": {"bg": "#2B2B2B", "fg": "#F2EDE4", "motif": "", "tag": pack.get("category", "Classic")}}
        index["books"].append(entry)
    entry.setdefault("blurb", pack.get("blurb", ""))
    entry.setdefault("hook", pack["chapters"][0]["hook"])
    rebuilt = {}
    for k, v in entry.items():  # keep the key order of the other entries: ... status, file, minutes, cover
        if k in ("file", "minutes"):
            continue
        rebuilt[k] = v
        if k == "status":
            rebuilt.update({"status": "ready", "file": a.book_id + ".json", "minutes": total})
    entry.clear()
    entry.update(rebuilt)
    with open(os.path.join(BOOKS, "index.json"), "w", encoding="utf-8") as f:
        f.write(dump_index(index))
    posts = sum(len(c["posts"]) for c in pack["chapters"])
    print(f"{a.book_id}: {len(pack['chapters'])} chapters, {posts} posts, {total} minutes -> {os.path.relpath(out, ROOT)}")
    for p in problems:
        print("PROBLEM:", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
