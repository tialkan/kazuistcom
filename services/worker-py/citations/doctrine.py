"""Rule based doctrine citation parser (plan 6.5/2, SRS 9.4).

Every citation of a book or article in a decision ends with a page marker ("s. 373 vd.", "s.108"), so the
parser anchors on page markers and reads backwards to the start of the footnote or parenthesis:

    Author[/Author], Title[, nth Bası][, C.I][, Place Year], s. N        full
    Author, age., s. N                                                    back reference ("age.", "agm.")
    Author, Short Title, s. N                                             short title, needs an earlier full one
    Author: Title, C.1, Place Year, s. N                                  "Surname, A.:" colon style

It never completes a missing field. Back references and short titles are only resolved against works cited
earlier in the same document (works.py); unresolved ones stay unresolved and fall to the editor queue.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

from .names import Name, looks_like_name, parse_name, split_authors
from .text import fold, squash

PAGE = re.compile(
    r"(?<![^\W\d_])(?:ss?|sh?|sy)\s*\.\s*(?P<p>\d{1,5}(?:\s*[-–]\s*\d{1,5})?)"
    r"(?:\s*(?P<vd>vd\.?|ve\s+devamı|dev\.?))?"
)
IBID = re.compile(r"(?:^|[\s,(])(?P<ib>a\s*\.?\s*g\s*\.?\s*[emy]\s*\.?|age|agm|agy)\s*[.,]?\s*$", re.IGNORECASE)
LEAD = re.compile(
    r"^(?:ayrıca\s+)?(?:bkz|bk|krş|karş|örn|bkz\. ayrıca|aynı yönde|detaylı bilgi için)\.?\s*[:,]?\s*", re.IGNORECASE
)
PLACE_YEAR = re.compile(
    r"^(?P<place>[A-ZÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ.\- ]{1,40}?)(?:\s*:\s*(?P<pub>[^,]+?))?\s*,?\s*"
    r"(?P<year>(?:1[5-9]|20)\d{2})(?P<suffix>[a-z])?$"
)
YEAR_ONLY = re.compile(r"^\(?(?P<year>(?:1[5-9]|20)\d{2})(?P<suffix>[a-z])?\)?$")
EDITION = re.compile(r"(?P<n>\d{1,2})\s*\.?\s*(?:baskı|bası|bsk|b)\b\.?", re.IGNORECASE)
VOLUME = re.compile(
    r"^(?:(?:c|cilt)\.?\s*(?P<v>[IVX]+|\d+)|(?P<w>birinci|ikinci|üçüncü|dördüncü|beşinci|altıncı)\s+cilt)$",
    re.IGNORECASE,
)
ISSUE = re.compile(r"^(?:s|sayı|sy)\.?\s*\d+(?:\s*[-–]\s*\d+)?$", re.IGNORECASE)
TRANSLATOR = re.compile(r"^(?:çev|çeviren|yay\. haz|haz|ed)\.?\b", re.IGNORECASE)
VENUE = re.compile(r"dergi|fakülte|mecmua|hukuk\s+(?:fak|der)|hfd|hfm|üniversitesi|journal|review|law", re.IGNORECASE)
ABBREVIATIONS = {
    "prof", "doc", "dr", "yrd", "av", "ars", "ogr", "gor", "cev", "ed", "bkz", "bk", "no", "md", "bs",
    "krs", "ork", "hz", "sn", "bsk", "yay", "haz", "dn", "bkn", "krs", "kars",
}
MAX_SEGMENT = 360


@dataclass
class DoctrineMention:
    start: int
    end: int  # end of the page marker
    form: str  # 'full' | 'article' | 'ibid' | 'short'
    authors: List[Name]
    title: Optional[str]
    extras: List[str] = field(default_factory=list)  # subtitles (volume titles)
    edition: Optional[str] = None
    volume: Optional[str] = None
    place: Optional[str] = None
    publisher: Optional[str] = None
    venue: Optional[str] = None
    year: Optional[int] = None
    pages: Optional[str] = None
    vd: bool = False
    ibid_marker: Optional[str] = None
    confidence: float = 0.0
    evidence: List[str] = field(default_factory=list)

    @property
    def full_title(self) -> Optional[str]:
        if not self.title:
            return None
        return squash(" ".join([self.title, *self.extras]))


def split_commas(s: str) -> List[str]:
    """Split on commas that are not inside parentheses or brackets."""
    out, depth, cur = [], 0, []
    for ch in s:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if ch == "," and depth == 0:
            out.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    out.append("".join(cur))
    return [squash(p) for p in out if squash(p)]


def _segment_start(text: str, anchor: int, floor: int) -> int:
    lo = max(floor, anchor - MAX_SEGMENT)
    seg = text[lo:anchor]
    best = 0
    for m in re.finditer(r"[(\[;\n“”\"]", seg):
        best = max(best, m.end())
    for m in re.finditer(r"[.!?]\s+(?=[A-ZÇĞİÖŞÜ]|a\.?g\.?[emy](?![\wçğıöşü])|age(?![\wçğıöşü])|agm(?![\wçğıöşü]))", seg):
        before = seg[: m.start()]
        w = re.search(r"([\wçğıöşüÇĞİÖŞÜ]+)$", before)
        word = w.group(1) if w else ""
        if fold(word) in ABBREVIATIONS or (len(word) == 1 and word.isupper()) or len(word) < 2 or word.isdigit():
            continue
        # "Hukuku. Oğuzman" ends a sentence; "Yrd. Doç." does not.
        best = max(best, m.end())
    return lo + best


def _classify_chunks(chunks: List[str]) -> dict:
    """Pick edition, volume, place and year chunks out of the comma separated tail."""
    info = {"edition": None, "volume": None, "place": None, "publisher": None, "year": None, "venue": None}
    rest: List[str] = []
    for i, c in enumerate(chunks):
        e = EDITION.search(c)
        if e and len(c) <= 24 and not re.search(r"[a-zçğıöşü]{5,}", re.sub(r"(?i)bask[ıi]|bas[ıi]|bsk|genişletilmiş|gözden geçirilmiş|yeni", "", c)):
            info["edition"] = e.group("n")
            continue
        v = VOLUME.match(c)
        if v:
            info["volume"] = (v.group("v") or v.group("w")).upper() if v.group("v") else fold(v.group("w"))
            continue
        if ISSUE.match(c) or TRANSLATOR.match(c):
            continue
        rest.append(c)
    # place + year (last remaining chunk), or publisher chunk followed by a year-only chunk
    if rest:
        m = PLACE_YEAR.match(rest[-1])
        if m:
            info["place"], info["publisher"], info["year"] = m.group("place").strip(), m.group("pub"), int(m.group("year"))
            rest = rest[:-1]
        else:
            y = YEAR_ONLY.match(rest[-1])
            if y:
                info["year"] = int(y.group("year"))
                rest = rest[:-1]
    info["rest"] = rest
    info.pop("venue")
    return info


def parse_segment(seg: str) -> Optional[dict]:
    """Parse the text before a page marker. Returns the fields of a DoctrineMention or None."""
    seg = squash(seg).strip(" ,;:")
    seg = LEAD.sub("", seg)
    seg = seg.strip(" ,;:")
    if not seg:
        return None

    ib = IBID.search(seg)
    if ib:
        head = seg[: ib.start("ib")].strip(" ,;:")
        authors = split_authors(head) if head and looks_like_name(head) else []
        if head and not authors:
            return None
        return {"form": "ibid", "authors": authors, "title": None, "ibid_marker": ib.group("ib")}

    rest = seg
    authors: List[Name] = []
    colon = re.match(r"^(?P<a>[^:]{2,90}?)\s*:\s*(?P<r>.+)$", seg)
    if colon and not re.search(r"\d", colon.group("a")) and looks_like_name(colon.group("a").replace(",", " ")):
        for part in colon.group("a").split("/"):
            n = parse_name(part, surname_first=True if "," in part else None)
            if n:
                authors.append(n)
        rest = colon.group("r")
    chunks = split_commas(rest)
    if not chunks:
        return None
    if not authors:
        first = chunks[0]
        # "Oğuzman, K./Öz, T., Title": surname followed by an initials only chunk
        if len(chunks) > 2 and re.fullmatch(r"(?:[A-ZÇĞİÖŞÜ]\.\s*)+(?:/\s*[A-ZÇĞİÖŞÜ][^,]*)?", chunks[1]):
            first = f"{chunks[0]}, {chunks[1]}"
            chunks = [first] + chunks[2:]
        if not looks_like_name(first.replace(",", " ")) or re.search(r"\d", first):
            return None
        first = re.sub(r"\s+(?:vd|ve\s+diğerleri)\.?$", "", first).strip()
        authors = split_authors(first)
        chunks = chunks[1:]
    if not authors or not chunks:
        return None
    info = _classify_chunks(chunks)
    rest_chunks: List[str] = info.pop("rest")
    if not rest_chunks:
        return None
    ev_extra: List[str] = []
    if (
        len(authors) == 1
        and len(rest_chunks) >= 2
        and (info["place"] or info["year"])
        and re.fullmatch(r"[A-ZÇĞİÖŞÜ][a-zçğıöşü]+", rest_chunks[0])
        and len(rest_chunks[1].split()) >= 2
    ):
        # "von Tuhr, Andreas, Borçlar Hukuku, ...": a lone capitalised word after a lone surname is a given name
        a0 = authors[0]
        authors = [Name(squash(f"{a0.given} {a0.surname}"), rest_chunks[0])]
        rest_chunks = rest_chunks[1:]
        ev_extra.append("ad_belirsiz")
    venue = None
    form = "full"
    if info["place"] is None and info["year"] is not None:
        v = [c for c in rest_chunks[1:] if VENUE.search(c)]
        if v:
            venue = v[0]
            form = "article"
    if info["year"] is None and info["place"] is None:
        # short title: author, Short Title (no place or year)
        if len(rest_chunks) == 1 and re.fullmatch(r"[A-ZÇĞİÖŞÜ][\w çğıöşüÇĞİÖŞÜ'’\-–]{3,80}", rest_chunks[0]) and not re.search(r"\d", rest_chunks[0]):
            return {"form": "short", "authors": authors, "title": rest_chunks[0], "extras": [], **info}
        return None
    title = rest_chunks[0]
    if len(title) < 4 or re.fullmatch(r"[\d\W]+", title):
        return None
    if looks_like_name(title) and len(rest_chunks) == 1 and len(title.split()) <= 2 and info["place"] is None:
        return None
    extras = [c for c in rest_chunks[1:] if c != venue]
    return {"form": form, "authors": authors, "title": title, "extras": extras, "venue": venue, "ev": ev_extra, **info}


BASE_CONFIDENCE = {"full_place_year": 0.92, "full_year": 0.86, "article": 0.88, "ibid": 0.40, "short": 0.50}


def extract_doctrine(text: str) -> List[DoctrineMention]:
    """Doctrine mentions in reading order. Back references and short titles come back unresolved."""
    out: List[DoctrineMention] = []
    floor = 0
    for m in PAGE.finditer(text):
        if m.start() < floor:
            continue
        start = _segment_start(text, m.start(), floor)
        while start < m.start() and text[start] in " \t\r\n.,;:)]":  # leftovers of the previous citation
            start += 1
        seg = text[start : m.start()]
        parsed = parse_segment(seg)
        if not parsed:
            continue
        form = parsed["form"]
        if form == "full" or form == "article":
            conf = BASE_CONFIDENCE["article" if form == "article" else "full_place_year" if parsed.get("place") else "full_year"]
            if "ad_belirsiz" in (parsed.get("ev") or []):
                conf = min(conf, 0.80)
        else:
            conf = BASE_CONFIDENCE[form]
        ev = [f"form:{form}", *(parsed.get("ev") or [])]
        if parsed.get("place"):
            ev.append("yer_yil")
        out.append(
            DoctrineMention(
                start=start + (len(seg) - len(seg.lstrip())),
                end=m.end(),
                form=form,
                authors=parsed["authors"],
                title=parsed.get("title"),
                extras=parsed.get("extras") or [],
                edition=parsed.get("edition"),
                volume=parsed.get("volume"),
                place=parsed.get("place"),
                publisher=parsed.get("publisher"),
                venue=parsed.get("venue"),
                year=parsed.get("year"),
                pages=re.sub(r"\s+", "", m.group("p")),
                vd=bool(m.group("vd")),
                ibid_marker=parsed.get("ibid_marker"),
                confidence=conf,
                evidence=ev,
            )
        )
        floor = m.end()
    return out
