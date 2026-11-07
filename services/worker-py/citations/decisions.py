"""Decision to decision citations (plan 6.5/1): E/K/T number patterns, AYM, ABAD and AIHM numbers.

Matching runs on the Turkish lowered copy of the text, which has the same length as the original, so every
span is valid on the original. Nothing here guesses: a number is only reported with the court, chamber and
date that are written next to it, and a court that is not written stays None (the score then drops).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from .text import iso_date, tr_lower

Y = r"(?:19|20)\d{2}"
NUM = rf"{Y}\s*/\s*\d{{1,6}}"
# "2014/4-56" (daire or genel kurul sira no, then dosya no); the lookahead keeps "2004/311-2005/94" apart.
ESAS = rf"{Y}\s*/\s*\d{{1,6}}(?:\s*-\s*\d{{1,6}}(?!\d|\s*/))?"
DATE = r"\d{1,2}[./]\d{1,2}[./]\d{4}"

_P_LETTER_FIRST = re.compile(
    rf"(?<![^\W\d_])e\s*[.:]\s*(?P<e>{ESAS})\s*[,;]?\s*(?:ve\s+)?k\s*[.:]\s*(?P<k>{NUM})"
    rf"(?:\s*[,;]?\s*t\s*[.:]\s*(?P<d>{DATE}))?"
)
_P_NUMBER_FIRST = re.compile(
    rf"(?P<e>{ESAS})\s*(?:esas|e\s*\.|e\b)\s*(?:no\b\.?)?\s*[,;\-–]?\s*(?:ve\s+)?"
    rf"(?P<k>{NUM})\s*(?:sayılı\s+)?(?:karar|k\s*\.|k\b)"
)
_P_COMBINED = re.compile(rf"(?P<e>{Y}\s*/\s*\d{{1,6}})\s*-\s*(?P<k>{NUM})\s*e\s*\.?\s*k\s*\.?")

_P_AYM = [
    re.compile(rf"(?<![^\W\d_])b\s*\.?\s*no\s*[.:]?\s*(?P<n>{NUM})"),
    re.compile(
        rf"(?P<n>{NUM})\s*(?:başvuru\s*(?:no|numaralı|sayılı)|numaralı\s+başvuru|sayılı\s+(?:bireysel\s+)?başvuru)"
    ),
    re.compile(rf"başvuru\s*(?:no|numarası|sayısı)\s*[.:]?\s*(?P<n>{NUM})"),
]
_P_ABAD = re.compile(
    r"(?<![^\W\d_])(?P<t>[ct])\s*[-‐‑–]\s*(?P<num>\d{1,4})\s*/\s*(?P<yr>\d{2})(?:\s*p)?(?![\d/])"
)
_P_AIHM = re.compile(
    r"(?:application\s+no\.?|app\.?\s*no\.?|başvuru\s*(?:no|numarası)\.?|\bno\.?)\s*[.:]?\s*"
    r"(?P<n>\d{3,6}/\d{2})(?![\d/])"
)

_HIGH: List[Tuple[str, re.Pattern]] = [
    ("Yargıtay", re.compile(r"yargıtay\w*(?!\s+cumhuriyet)")),
    ("Danıştay", re.compile(r"danıştay\w*")),
    ("Anayasa Mahkemesi", re.compile(r"anayasa\s+mahkemesi\w*|(?<![^\W\d_])aym(?![^\W\d_])")),
    ("AİHM", re.compile(r"avrupa\s+insan\s+hakları\s+mahkemesi\w*|(?<![^\W\d_])aihm(?![^\W\d_])")),
    ("ABAD", re.compile(r"avrupa\s+birliği\s+adalet\s+divanı\w*|(?<![^\W\d_])abad(?![^\W\d_])")),
]
_ALT = re.compile(
    r"(?:[\wçğıöşü]+\s+){0,2}mahkemesi\w*|kaymakamlığ\w*|(?<![^\W\d_])bam(?![^\W\d_])"
)
_CHAMBERS: List[Tuple[str, re.Pattern]] = [
    ("Hukuk Genel Kurulu", re.compile(r"hukuk\s+genel\s+kurul\w*|(?<![^\W\d_])hgk(?![^\W\d_])")),
    ("Ceza Genel Kurulu", re.compile(r"ceza\s+genel\s+kurul\w*|(?<![^\W\d_])cgk(?![^\W\d_])")),
    (
        "İçtihadı Birleştirme",
        re.compile(
            r"içtihad[ıi]\s+birleştirme\s+(?:büyük\s+)?(?:genel\s+)?kurul\w*|içtihatları\s+birleştirme\s+kurul\w*|"
            r"(?<![^\W\d_])(?:ibk|ibbgk)(?![^\W\d_])"
        ),
    ),
    ("İdari Dava Daireleri Kurulu", re.compile(r"idari\s+dava\s+daireleri\s+kurul\w*|(?<![^\W\d_])iddk(?![^\W\d_])")),
    ("Vergi Dava Daireleri Kurulu", re.compile(r"vergi\s+dava\s+daireleri\s+kurul\w*|(?<![^\W\d_])vddk(?![^\W\d_])")),
]
_NUMBERED_CHAMBER = re.compile(
    r"(?P<n>\d{1,2})\s*\.\s*(?:(?P<kind>hukuk|ceza)\s+daire\w*|(?P<short>hd|cd)(?![^\W\d_])|(?P<plain>daire\w*))"
)
_DATE_BEFORE = re.compile(rf"(?P<d>{DATE})\s*(?:tarihli|tarih|günlü|gün|t(?![^\W\d_]))")
_MONTHS = {
    "ocak": 1, "şubat": 2, "mart": 3, "nisan": 4, "mayıs": 5, "haziran": 6,
    "temmuz": 7, "ağustos": 8, "eylül": 9, "ekim": 10, "kasım": 11, "aralık": 12,
}
_LONG_DATE = re.compile(r"(?P<d>\d{1,2})\s+(?P<m>" + "|".join(_MONTHS) + r")\s+(?P<y>\d{4})\s*(?:tarihli|tarih|günlü|gün)")

_AIHM_CTX = re.compile(
    r"aihm|avrupa\s+insan\s+hakları|echr|human\s+rights|türkiye\s+aleyhine|v\.\s+(?:turkey|türkiye)"
)

WINDOW = 140

PATTERN_SCORES = {"letter_first": 0.80, "number_first": 0.80, "combined": 0.72, "aym_label": 0.93, "abad": 0.92, "aihm": 0.84}


@dataclass
class DecisionMention:
    kind: str  # 'yargi' | 'aym' | 'abad' | 'aihm'
    pattern: str
    court: Optional[str]  # 'Yargıtay', 'Danıştay', 'Anayasa Mahkemesi', 'AİHM', 'ABAD', 'alt' (lower court) or None
    chamber: Optional[str]
    esas: Optional[str]
    karar: Optional[str]
    number: Optional[str]  # AYM bireysel, ABAD or AIHM application number
    date: Optional[str]  # ISO
    start: int  # first character of the citation including court, chamber and date written before the number
    end: int
    num_start: int
    num_end: int
    evidence: List[str] = field(default_factory=list)

    @property
    def key(self) -> str:
        """Identity of the cited decision, independent of how it is written."""
        if self.number:
            return f"{self.kind}:{self.number}"
        return f"{self.kind}:{self.esas}|{self.karar}"


def _tidy(s: Optional[str]) -> Optional[str]:
    return re.sub(r"\s+", "", s) if s else None


def _overlaps(a: Tuple[int, int], taken: List[Tuple[int, int]]) -> bool:
    return any(a[0] < t[1] and t[0] < a[1] for t in taken)


def _nearest(pattern: re.Pattern, win: str) -> Optional[re.Match]:
    last = None
    for m in pattern.finditer(win):
        last = m
    return last


def _context(low: str, num_start: int, floor: int) -> Tuple[Optional[str], Optional[str], Optional[str], int, List[str]]:
    """Court, chamber, date and the first context offset written in front of a number."""
    lo = max(floor, num_start - WINDOW)
    win = low[lo:num_start]
    cut = max(win.rfind(";"), win.rfind(")"), win.rfind("\n"))
    if cut >= 0:  # a court name behind a separator belongs to the previous clause
        lo, win = lo + cut + 1, win[cut + 1 :]
    evidence: List[str] = []
    high: Optional[Tuple[int, int, str]] = None
    for name, pat in _HIGH:
        m = _nearest(pat, win)
        if m and (high is None or m.end() > high[1]):
            high = (m.start(), m.end(), name)
    alt = _nearest(_ALT, win)
    if alt and high and alt.start() < high[1] and high[0] < alt.end():  # alt phrase overlaps a high court name
        alt = None
    chamber: Optional[str] = None
    chamber_span: Optional[Tuple[int, int]] = None
    for name, pat in _CHAMBERS:
        m = _nearest(pat, win)
        if m and (chamber_span is None or m.end() > chamber_span[1]):
            chamber, chamber_span = name, (m.start(), m.end())
    for m in _NUMBERED_CHAMBER.finditer(win):
        if chamber_span is None or m.end() > chamber_span[1]:
            n = m.group("n")
            if m.group("kind") or m.group("short"):
                kind = m.group("kind") or ("hukuk" if m.group("short") == "hd" else "ceza")
                chamber = f"{n}. {'Hukuk' if kind == 'hukuk' else 'Ceza'} Dairesi"
            else:
                chamber = f"{n}. Daire"
            chamber_span = (m.start(), m.end())

    court: Optional[str] = None
    first = len(win)
    if alt and (high is None or alt.end() > high[1]):
        court = "alt"
        chamber = None  # a chamber behind a lower court name belongs to that court
        first = alt.start()
        evidence.append("alt_mahkeme")
    elif high:
        court = high[2]
        first = high[0]
        evidence.append("mahkeme")
    elif chamber in ("Hukuk Genel Kurulu", "Ceza Genel Kurulu", "İçtihadı Birleştirme"):
        court = "Yargıtay"
        evidence.append("kurul_yargitay_icin_varsayildi")
    elif chamber in ("İdari Dava Daireleri Kurulu", "Vergi Dava Daireleri Kurulu"):
        court = "Danıştay"
        evidence.append("kurul_danistay_icin_varsayildi")
    if chamber_span and court != "alt":
        first = min(first, chamber_span[0])
        evidence.append("daire_veya_kurul")

    date: Optional[str] = None
    best = -1
    date_start = len(win)
    for m in _DATE_BEFORE.finditer(win):
        if m.end() > best:
            best, date, date_start = m.end(), iso_date(m.group("d")), m.start()
    for m in _LONG_DATE.finditer(win):
        if m.end() > best:
            best, date_start = m.end(), m.start()
            date = iso_date(f"{m.group('d')}.{_MONTHS[m.group('m')]}.{m.group('y')}")
    if date:
        evidence.append("tarih")
        first = min(first, date_start)
    return court, chamber, date, (lo + first if first < len(win) else num_start), evidence


def extract_decisions(text: str) -> List[DecisionMention]:
    """All decision mentions in reading order. Court, chamber and date are filled only when written."""
    low = tr_lower(text)
    taken: List[Tuple[int, int]] = []
    raw: List[Tuple[int, int, str, re.Match]] = []  # (match start, match end, pattern name, match)

    def claim(name: str, m: re.Match, span: Tuple[int, int]) -> bool:
        if _overlaps(span, taken):
            return False
        taken.append(span)
        raw.append((m.start(), m.end(), name, m))
        return True

    # AYM individual application numbers first: their number shape (yyyy/n) also looks like E/K numbers.
    for pat in _P_AYM:
        for m in pat.finditer(low):
            claim("aym_label", m, (m.start("n"), m.end("n")))
    for name, pat in (("letter_first", _P_LETTER_FIRST), ("number_first", _P_NUMBER_FIRST), ("combined", _P_COMBINED)):
        for m in pat.finditer(low):
            claim(name, m, (m.start(), m.end()))
    for m in _P_ABAD.finditer(low):
        claim("abad", m, (m.start(), m.end()))
    for m in _P_AIHM.finditer(low):
        ctx = low[max(0, m.start() - 200) : m.start()]
        has_ctx = bool(_AIHM_CTX.search(ctx))
        if len(m.group("n").split("/")[0]) < 5 and not has_ctx:
            continue  # "no. 2014/12" without an AIHM context is more likely something else
        claim("aihm", m, (m.start(), m.end()))
    raw.sort(key=lambda r: r[0])

    out: List[DecisionMention] = []
    floor = 0
    for _, _, name, m in raw:
        if name == "aym_label":
            court, chamber, date, first, ev = _context(low, m.start("n"), floor)
            out.append(DecisionMention("aym", name, "Anayasa Mahkemesi", None, None, None, _tidy(m.group("n")), date,
                                       min(first, m.start()), m.end(), m.start("n"), m.end("n"), ["bireysel_basvuru"] + ev))
        elif name in ("letter_first", "number_first", "combined"):
            court, chamber, date, first, ev = _context(low, m.start(), floor)
            if "d" in m.re.groupindex and m.group("d"):
                date = iso_date(m.group("d")) or date
            kind = "aym" if court == "Anayasa Mahkemesi" else "yargi"
            out.append(DecisionMention(kind, name, court, chamber, _tidy(m.group("e")), _tidy(m.group("k")), None, date,
                                       min(first, m.start()), m.end(), m.start(), m.end(), ev))
        elif name == "abad":
            out.append(DecisionMention("abad", name, "ABAD", None, None, None,
                                       f"{m.group('t').upper()}-{m.group('num')}/{m.group('yr')}", None,
                                       m.start(), m.end(), m.start(), m.end(), []))
        else:  # aihm
            ctx = low[max(0, m.start() - 200) : m.start()]
            out.append(DecisionMention("aihm", name, "AİHM", None, None, None, m.group("n"), None, m.start(), m.end(),
                                       m.start("n"), m.end("n"), ["aihm_baglami"] if _AIHM_CTX.search(ctx) else []))
        floor = max(floor, out[-1].end)
    return out
