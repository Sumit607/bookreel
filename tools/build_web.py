#!/usr/bin/env python3
"""Prepares web/ for deployment from the book packs.

- Every ready pack goes to web/public/books/ as a static file. There are no passcodes: the app is for one reader.
- Writes web/public/books/index.json.
- Stamps a content hash into web/public/sw.js so every deploy refreshes the offline cache.

Run after content/src/build.py:  python3 tools/build_web.py
"""
import hashlib
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "android", "app", "src", "main", "assets", "books")
WEB = os.path.join(ROOT, "web")
PUB_BOOKS = os.path.join(WEB, "public", "books")


def main():
    with open(os.path.join(SRC, "index.json"), encoding="utf-8") as f:
        index = json.load(f)
    os.makedirs(PUB_BOOKS, exist_ok=True)
    for name in os.listdir(PUB_BOOKS):
        if name.endswith(".json"):
            os.remove(os.path.join(PUB_BOOKS, name))
    for b in index["books"]:
        b.pop("access", None)
        if b.get("status") == "ready":
            shutil.copyfile(os.path.join(SRC, b["file"]), os.path.join(PUB_BOOKS, b["file"]))
    with open(os.path.join(PUB_BOOKS, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)

    h = hashlib.sha1()
    for base, _, files in sorted(os.walk(os.path.join(WEB, "public"))):
        for name in sorted(files):
            if name == "sw.js":
                continue
            with open(os.path.join(base, name), "rb") as f:
                h.update(name.encode() + f.read())
    version = "bookreel-" + h.hexdigest()[:10]
    sw = os.path.join(WEB, "public", "sw.js")
    with open(sw, encoding="utf-8") as f:
        text = f.read()
    text = re.sub(r'const VERSION = "[^"]*";', f'const VERSION = "{version}";', text)
    with open(sw, "w", encoding="utf-8") as f:
        f.write(text)
    ready = [b["id"] for b in index["books"] if b.get("status") == "ready"]
    print(f"web: {len(ready)} ready books ({', '.join(ready)}), cache {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
