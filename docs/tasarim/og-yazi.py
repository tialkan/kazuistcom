"""Static TTF instances of the subset web fonts for next/og (Satori reads TTF, OTF and WOFF, not WOFF2).

Usage from the repository root (fontTools and brotli are build tools here, not project dependencies):
  uv run --no-project --with fonttools==4.60.1 --with brotli python -I docs/tasarim/og-yazi.py \
    apps/web/public/fonts "apps/web/src/app/(kabuk)/_marka/yazi"
"""
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

jobs = [
    ("SourceSerif4.woff2", "SourceSerif4-Regular.ttf", {"wght": 400}),
    ("SourceSerif4.woff2", "SourceSerif4-Semibold.ttf", {"wght": 600}),
    ("KzSans.woff2", "KzSans-Medium.ttf", {"wght": 500}),
    ("KzMono-Regular.woff2", "KzMono-Regular.ttf", None),
]
for name, target, axes in jobs:
    font = TTFont(src / name)
    if "fvar" in font:
        present = {a.axisTag for a in font["fvar"].axes}
        pins = {k: v for k, v in (axes or {}).items() if k in present}
        # Pin every remaining axis at its default so the result is a plain static font.
        for a in font["fvar"].axes:
            pins.setdefault(a.axisTag, a.defaultValue)
        font = instancer.instantiateVariableFont(font, pins, updateFontNames=False)
    font.flavor = None
    font.save(out / target)
    print(target, (out / target).stat().st_size)
