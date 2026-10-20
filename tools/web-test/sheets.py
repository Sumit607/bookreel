#!/usr/bin/env python3
"""Builds one contact sheet per chapter from the e2e screenshots: python3 sheets.py <outDir>"""
import glob
import os
import re
import sys
from PIL import Image

out = sys.argv[1]
shots = os.path.join(out, "shots")
dest = os.path.join(out, "sheets")
os.makedirs(dest, exist_ok=True)
groups = {}
for f in sorted(glob.glob(os.path.join(shots, "*-c[0-9][0-9]-*.png"))):
    m = re.match(r"(.+)-c(\d\d)-(p\d\d(?:-answered)?|done)\.png$", os.path.basename(f))
    if m:
        groups.setdefault((m.group(1), m.group(2)), []).append((m.group(3), f))
for (book, ch), items in sorted(groups.items()):
    items.sort(key=lambda x: (x[0] == "done", x[0]))
    ims = [Image.open(f).convert("RGB") for _, f in items]
    w, h = 270, int(270 * ims[0].height / ims[0].width)
    cols = 6
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * w, rows * h), (17, 20, 24))
    for i, im in enumerate(ims):
        sheet.paste(im.resize((w, h), Image.LANCZOS), ((i % cols) * w, (i // cols) * h))
    sheet.save(os.path.join(dest, f"{book}-chapter-{ch}.jpg"), quality=82)
print(len(groups), "sheets in", dest)
