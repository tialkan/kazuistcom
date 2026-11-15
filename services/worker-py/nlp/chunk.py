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

Decisions (karar, kurul_karari) are cut with sections=True: a recognised heading (GEREKÇE, HÜKÜM, KARŞI OY ...)
starts a new passage and labels it (chunks.section: iddia, surec, gerekce, hukum, karsi_oy). The heading table
and the rules are those of chunk.ts SECTION_HEADINGS and headingAt.
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

SECTIONED_TYPES = frozenset({"karar", "kurul_karari"})

# chunk.ts SECTION_HEADINGS, same order: headings as published (upper case, Turkish letters).
SECTION_HEADINGS: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
    (
        "karsi_oy",
        (
            "KARŞI OY",
            "KARŞIOY",
            "KARŞI OY GEREKÇESİ",
            "KARŞI OY YAZISI",
            "MUHALEFET ŞERHİ",
            "AZLIK OYU",
            "AZLIK GÖRÜŞÜ",
            "AYRIŞIK OY",
            "FARKLI GEREKÇE",
            "DEĞİŞİK GEREKÇE",
            "EK GEREKÇE",
            "KARŞI GÖRÜŞ",
        ),
    ),
    (
        "iddia",
        (
            "DAVA",
            "DAVACI İSTEMİ",
            "DAVACININ İSTEMİ",
            "DAVACI İDDİASI",
            "DAVACININ İDDİALARI",
            "DAVACI İDDİALARI",
            "İDDİA",
            "İDDİALAR",
            "İDDİALARIN ÖZETİ",
            "İSTEM",
            "İSTEMİN ÖZETİ",
            "İSTEMİN KONUSU",
            "CEVAP",
            "DAVALI CEVABI",
            "DAVALININ CEVABI",
            "SAVUNMA",
            "SAVUNMANIN ÖZETİ",
            "TARAFLARIN İDDİA VE SAVUNMALARI",
            "TEMYİZ SEBEPLERİ",
            "TEMYİZ İSTEMİ",
            "TEMYİZ YOLUNA BAŞVURANLAR",
            "BAŞVURUNUN KONUSU",
            "BAŞVURUCUNUN İDDİALARI",
            "İPTAL DAVASININ KONUSU",
            "İPTAL TALEBİNİN GEREKÇESİ",
            "TEBLİĞNAME",
        ),
    ),
    (
        "surec",
        (
            "YARGILAMA SÜRECİ",
            "BAŞVURU SÜRECİ",
            "DOSYA EVRESİ",
            "OLAY VE OLGULAR",
            "OLAYLAR",
            "İLK DERECE MAHKEMESİ KARARI",
            "BÖLGE ADLİYE MAHKEMESİ KARARI",
            "BÖLGE İDARE MAHKEMESİ KARARI",
            "İSTİNAF",
            "TEMYİZ",
            "İNCELENEN KARAR",
            "BOZMA KARARI",
            "DİRENME KARARI",
            "RAPORTÖR GÖRÜŞÜ",
            "DANIŞTAY TETKİK HÂKİMİ DÜŞÜNCESİ",
            "DANIŞTAY TETKİK HAKİMİ DÜŞÜNCESİ",
            "DANIŞTAY SAVCISI DÜŞÜNCESİ",
        ),
    ),
    (
        "gerekce",
        (
            "GEREKÇE",
            "İNCELEME VE GEREKÇE",
            "DEĞERLENDİRME",
            "İNCELEME VE DEĞERLENDİRME",
            "DEĞERLENDİRME VE GEREKÇE",
            "UYUŞMAZLIK",
            "UYUŞMAZLIK KONUSU",
            "İLGİLİ HUKUK",
            "ESASIN İNCELENMESİ",
            "HUKUK GENEL KURULU KARARI",
            "CEZA GENEL KURULU KARARI",
            "DAİRE KARARI",
        ),
    ),
    ("hukum", ("HÜKÜM", "HÜKÜM SONUCU", "KARAR", "SONUÇ", "SONUÇ VE KARAR")),
)
_CONJUNCTIONS = frozenset({"VE", "İLE", "VEYA"})


def tr_lower(s: str) -> str:
    """chunk.ts trLower: İ to i, I to ı, then the default lower case mapping."""
    return s.replace("İ", "i").replace("I", "ı").lower()


def _mixed_forms(upper: str) -> List[str]:
    words = upper.split(" ")

    def cap(w: str) -> str:
        return w[:1] + tr_lower(w[1:])

    title = " ".join(cap(w) for w in words)
    title_lower = " ".join(
        tr_lower(w) if i > 0 and w in _CONJUNCTIONS else cap(w) for i, w in enumerate(words)
    )
    sentence = upper[:1] + tr_lower(upper[1:])
    return list(dict.fromkeys([title, title_lower, sentence]))


@dataclass(frozen=True)
class _Form:
    section: str
    text: str
    upper: bool


# Longer forms first; at equal length the upper case form first (a stable sort, as in chunk.ts).
_FORMS: List[_Form] = sorted(
    (
        form
        for section, headings in SECTION_HEADINGS
        for h in headings
        for form in [_Form(section, h, True)] + [_Form(section, t, False) for t in _mixed_forms(h)]
    ),
    key=lambda f: (-len(f.text), not f.upper),
)
# Optional enumerator before a heading ("III.", "II.GEREKÇE", "C.", "A-", "2)"); group 1 is a digit form.
_ENUMERATOR = re.compile(r"(?:(?:[IVX]{1,6}|[A-ZÇĞİÖŞÜ]|([0-9]{1,3}))[ \t]*[.)\-][ \t]*)?")
_COLON = re.compile(r"[ \t]*:")


@dataclass(frozen=True)
class Chunk:
    """One chunks table row. chunk_text gives text = masked_text sliced by [char_start, char_end) in UTF-16
    units; the embed job then writes open panel member names as "[Üye n]" (panel_names.index_chunks), the
    offsets still indexing masked_text."""

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


def _first_word(s: str) -> str:
    """chunk.ts firstWord: after leading JavaScript whitespace, up to the next whitespace (unit string)."""
    i = 0
    while i < len(s) and s[i] in JS_WHITESPACE:
        i += 1
    j = i
    while j < len(s) and s[j] not in JS_WHITESPACE:
        j += 1
    return s[i:j]


def heading_at(line: str, pos: int) -> Optional[Tuple[str, int]]:
    """chunk.ts headingAt on a unit string: (section, index after the heading and its colon) or None."""
    line_start = pos == 0
    s = line[pos:]
    en = _ENUMERATOR.match(s)
    en_len = en.end() if en else 0
    has_enum = en_len > 0 and (line_start or (en is not None and en.group(1) is None))
    if en_len > 0 and not has_enum:
        return None
    rest = s[en_len:]
    for f in _FORMS:
        if not rest.startswith(f.text):
            continue
        after = rest[len(f.text) :]
        colon = _COLON.match(after)
        end = pos + en_len + len(f.text) + (colon.end() if colon else 0)
        if after == "" or colon:
            if line_start or has_enum or f.upper:
                return f.section, end
            continue
        first_is_space = after[0] in JS_WHITESPACE
        if not first_is_space and not (f.upper and after[0] in ".;-"):
            continue
        nxt = from_units(_first_word(after))
        if f.upper:
            if not line_start and not has_enum and f.section != "karsi_oy":
                continue
            letters = [c for c in nxt if _is_letter(c)]
            header_field = len(letters) >= 2 and all(unicodedata.category(c) == "Lu" for c in letters)
            if not header_field:
                return f.section, end
        elif has_enum and first_is_space and nxt and unicodedata.category(nxt[0]) == "Lu":
            return f.section, end
    return None


def section_heading(paragraph: str) -> Optional[str]:
    """Section that a paragraph opens, or None (chunk.ts sectionHeading)."""
    found = heading_at(to_units(paragraph), 0)
    return found[0] if found else None


def _sentence_end_positions(line: str) -> List[int]:
    """Ends of the matches of /[.:;]\\s+/gu, non overlapping as in matchAll."""
    out: List[int] = []
    i, n = 0, len(line)
    while i < n:
        if line[i] in ".:;" and i + 1 < n and line[i + 1] in JS_WHITESPACE:
            j = i + 1
            while j < n and line[j] in JS_WHITESPACE:
                j += 1
            out.append(j)
            i = j
        else:
            i += 1
    return out


def headings_in(line: str) -> List[Tuple[int, str, int]]:
    """chunk.ts headingsIn on a unit string: (position, section, end) at the start, after sentence ends and
    right after another heading, in order."""
    ends = _sentence_end_positions(line)
    out: List[Tuple[int, str, int]] = []
    floor = 0
    nested: Optional[int] = 0
    k = 0
    while True:
        while k < len(ends) and ends[k] < floor:
            k += 1
        e = ends[k] if k < len(ends) else None
        if nested is not None and (e is None or nested <= e):
            pos = nested
            nested = None
            if e == pos:
                k += 1
        elif e is not None:
            pos = e
            k += 1
        else:
            break
        h = heading_at(line, pos)
        if h is None:
            continue
        out.append((pos, h[0], h[1]))
        floor = h[1]
        q = h[1]
        while q < len(line) and line[q] in JS_WHITESPACE:
            q += 1
        nested = q if q < len(line) else None
    return out


def _js_trim_end(s: str) -> str:
    end = len(s)
    while end > 0 and s[end - 1] in JS_WHITESPACE:
        end -= 1
    return s[:end]


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


@dataclass
class _Segment:
    frm: int
    to: int
    section: Optional[str]
    opens: bool
    head_end: int = 0


@dataclass
class _Paragraph:
    text: str
    start: int
    section: Optional[str]
    opens: bool
    head_only: bool


@dataclass
class _Merged:
    start: int
    end: int
    section: Optional[str]
    head_only: bool


def chunk_text(
    text: str, max_chars: int = DEFAULT_MAX, min_chars: int = DEFAULT_MIN, sections: bool = False
) -> List[Chunk]:
    """chunkText(recordId, text, {max, min, sections}): paragraphs kept whole when they fit, merged when short
    and split at sentence ends when long. With sections, a decision heading starts a new passage and labels it;
    a heading alone is joined to the next one. Returns [] for empty or whitespace only text."""
    u = to_units(text)
    paragraphs: List[_Paragraph] = []
    section: Optional[str] = None
    for m in _LINES.finditer(u):
        seg = m.group()
        t = js_trim(seg)
        if not t:
            continue
        start = m.start() + seg.index(t)
        cur = _Segment(0, len(t), section, False)
        segs = [cur]
        if sections:
            join_at = -1
            for pos, sec, end in headings_in(t):
                if pos == join_at or (pos == 0 and cur.frm == 0):
                    cur.section = sec
                    cur.opens = True
                else:
                    cur.to = pos
                    cur = _Segment(pos, len(t), sec, True)
                    segs.append(cur)
                cur.head_end = end
                q = end
                while q < len(t) and t[q] in JS_WHITESPACE:
                    q += 1
                join_at = q
        for g in segs:
            body = _js_trim_end(t[g.frm : g.to])
            if not body:
                continue
            section = g.section
            at = start + g.frm
            head_only = g.opens and g.head_end >= g.frm + len(body)
            pieces = _split_long(body, at, max_chars) if len(body) > max_chars else [(body, at)]
            for i, (pt, ps) in enumerate(pieces):
                paragraphs.append(_Paragraph(pt, ps, g.section, g.opens and i == 0, head_only and i == 0))
    merged: List[_Merged] = []
    for p in paragraphs:
        end = p.start + len(p.text)
        last = merged[-1] if merged else None
        if (
            last is not None
            and (last.head_only if p.opens else last.end - last.start < min_chars)
            and end - last.start <= max_chars
        ):
            last.end = end
            if p.opens:
                last.section = p.section
            last.head_only = p.opens and p.head_only
        else:
            merged.append(_Merged(p.start, end, p.section, p.head_only))
    return [
        Chunk(
            seq=i, text=from_units(u[m.start : m.end]), char_start=m.start, char_end=m.end, section=m.section
        )
        for i, m in enumerate(merged)
    ]
