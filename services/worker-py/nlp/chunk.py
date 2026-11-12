"""Passage splitter for embed.chunks: a faithful port of packages/casuist/src/chunk.ts (chunkText).

The TypeScript side reads these rows back (sql.ts) and, for records whose chunks are not written yet, cuts the
same passages on the fly; quotes are highlighted with masked_text.slice(charStart, charEnd) (FR-82). Both
sides must therefore agree on every boundary. Two JavaScript details are reproduced on purpose:

1. Offsets and lengths are UTF-16 code units, like String.prototype.length and slice. A character outside the
   Basic Multilingual Plane counts as two. The algorithm runs on a "unit string" in which such characters are
   surrogate pairs, so every index below is a JavaScript index.
2. Whitespace is the ECMAScript set used by `\\s` and String.prototype.trim, not Python's str.isspace().

packages/casuist/fixtures/parcalar.json holds the expected boundaries for the fixture corpus and for edge
cases; the TypeScript and the Python tests both check it, so a change on one side fails until the other
follows. No function here logs or stores text.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import List, Optional, Tuple

DEFAULT_MAX = 1200
DEFAULT_MIN = 200

# ECMAScript WhiteSpace and LineTerminator: the members of `\s` and of what trim() removes.
JS_WHITESPACE = frozenset(
    "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u2028\u2029\u202f\u205f\u3000\ufeff"
)

# chunk.ts SENTENCE_END: a period, "!", "?", ";" or ":" is not a sentence end after a single letter word
# ("m.", "E.", "K.", "s.") or after one of these words, each preceded by a non letter.
ABBREVIATIONS = ("md", "vd", "bkz", "age", "dn", "no", "art", "sy", "syf", "vb", "vs", "örn", "ör", "T.C")
_PUNCT = frozenset(".!?;:")
_OPENERS = frozenset('(“"0123456789')
_LINES = re.compile(r"[^\n]+")


@dataclass(frozen=True)
class Chunk:
    """One chunks table row. text is masked_text sliced by [char_start, char_end) in UTF-16 units."""

    seq: int
    text: str
    char_start: int
    char_end: int
    section: Optional[str] = None


def to_units(text: str) -> str:
    """The UTF-16 view of text: characters above U+FFFF become two surrogate code points."""
    if not text or max(text) <= "\uffff":
        return text
    out = []
    for ch in text:
        cp = ord(ch)
        if cp <= 0xFFFF:
            out.append(ch)
        else:
            cp -= 0x10000
            out.append(chr(0xD800 + (cp >> 10)))
            out.append(chr(0xDC00 + (cp & 0x3FF)))
    return "".join(out)


def from_units(units: str) -> str:
    """Back to a normal string. A pair cut in half becomes U+FFFD, as Node's UTF-8 encoder writes it."""
    if not any("\ud800" <= ch <= "\udfff" for ch in units):
        return units
    return units.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "replace")


def js_trim(s: str) -> str:
    start, end = 0, len(s)
    while start < end and s[start] in JS_WHITESPACE:
        start += 1
    while end > start and s[end - 1] in JS_WHITESPACE:
        end -= 1
    return s[start:end]


def _is_high(ch: str) -> bool:
    return "\ud800" <= ch <= "\udbff"


def _is_low(ch: str) -> bool:
    return "\udc00" <= ch <= "\udfff"


def _code_point_before(u: str, i: int) -> Optional[Tuple[str, int]]:
    """The code point that ends at unit index i and its width in units, or None at the start."""
    if i <= 0:
        return None
    if i >= 2 and _is_low(u[i - 1]) and _is_high(u[i - 2]):
        return from_units(u[i - 2 : i]), 2
    return u[i - 1], 1


def _code_point_at(u: str, i: int) -> Optional[str]:
    if i >= len(u):
        return None
    if i + 1 < len(u) and _is_high(u[i]) and _is_low(u[i + 1]):
        return from_units(u[i : i + 2])
    return u[i]


def _is_letter(ch: Optional[str]) -> bool:
    return ch is not None and unicodedata.category(ch).startswith("L")


def _letter_before(u: str, i: int) -> bool:
    cp = _code_point_before(u, i)
    return cp is not None and _is_letter(cp[0])


def _abbreviation_before(u: str, i: int) -> bool:
    """The negative lookbehind of SENTENCE_END: some alternative ends at i and no letter precedes it."""
    cp = _code_point_before(u, i)
    if cp is not None and _is_letter(cp[0]) and not _letter_before(u, i - cp[1]):
        return True
    for word in ABBREVIATIONS:
        n = len(word)
        if i >= n and u[i - n : i] == word and not _letter_before(u, i - n):
            return True
    return False


def _opens_sentence(u: str, i: int) -> bool:
    """The lookahead of SENTENCE_END: whitespace, then an upper case letter, "(", a quote or a digit."""
    j = i
    while j < len(u) and u[j] in JS_WHITESPACE:
        j += 1
    if j == i:
        return False
    nxt = _code_point_at(u, j)
    return nxt is not None and (nxt in _OPENERS or unicodedata.category(nxt) == "Lu")


def sentence_ends(window: str) -> List[int]:
    """Indexes where SENTENCE_END matches in window (lookarounds see only the window, as in matchAll)."""
    return [
        i
        for i, ch in enumerate(window)
        if ch in _PUNCT and _opens_sentence(window, i + 1) and not _abbreviation_before(window, i)
    ]


def _split_long(text: str, start: int, mx: int) -> List[Tuple[str, int]]:
    out: List[Tuple[str, int]] = []
    frm = 0
    while len(text) - frm > mx:
        window = text[frm : frm + mx]
        cut = -1
        for i in sentence_ends(window):
            if i > mx * 0.4:
                cut = i + 1
        if cut < 0:
            space = window.rfind(" ")
            cut = space if space > mx * 0.4 else mx
        out.append((js_trim(text[frm : frm + cut]), start + frm))
        frm += cut
        while frm < len(text) and text[frm] == " ":
            frm += 1
    if frm < len(text):
        out.append((js_trim(text[frm:]), start + frm))
    return out


def chunk_text(text: str, max_chars: int = DEFAULT_MAX, min_chars: int = DEFAULT_MIN) -> List[Chunk]:
    """chunkText(recordId, text, {max, min}): paragraphs kept whole when they fit, merged when short and
    split at sentence ends when long. Returns [] for empty or whitespace only text."""
    u = to_units(text)
    paragraphs: List[Tuple[str, int]] = []
    for m in _LINES.finditer(u):
        seg = m.group()
        t = js_trim(seg)
        if not t:
            continue
        start = m.start() + seg.index(t)
        paragraphs.extend(_split_long(t, start, max_chars) if len(t) > max_chars else [(t, start)])
    merged: List[List[int]] = []
    for t, start in paragraphs:
        end = start + len(t)
        last = merged[-1] if merged else None
        if last is not None and last[1] - last[0] < min_chars and end - last[0] <= max_chars:
            last[1] = end
        else:
            merged.append([start, end])
    return [
        Chunk(seq=i, text=from_units(u[s:e]), char_start=s, char_end=e) for i, (s, e) in enumerate(merged)
    ]
