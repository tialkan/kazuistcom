"""Author name normalisation (plan 6.5/3): title removal, Turkish characters, surname and given name split.

The key of an author is the folded surname. Given names only break ties (initials compare by first letter),
because citations write the same person as "Jale Güral Akipek", "Akipek, J." or just "Akipek".
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

from .text import fold, squash

TITLE_WORDS = {
    "prof", "dr", "doc", "yrd", "av", "ars", "gor", "ogr", "uyesi", "uye", "hakim", "yargic", "sayin",
    "arastirma", "gorevlisi", "dogent", "profesor", "mr", "ord", "avukat", "hukuk", "baskan",
}
PARTICLES = {"von", "van", "de", "der", "den", "di", "du", "la", "le", "el", "al", "bin", "ibn", "del", "da"}
# Words that never belong to a person name; guards the rule parser against decision and statute phrases.
NOT_A_NAME = {
    "yargitay", "dairesi", "daire", "kurulu", "mahkemesi", "kanunu", "kanun", "madde", "maddesi", "karari",
    "kararinda", "tarihli", "sayili", "esas", "karar", "hukuk", "ceza", "genel", "anayasa", "bkz", "ayrica",
    "oysa", "ancak", "ogretide", "doktrinde", "gore", "nitekim", "yani", "ile", "ve", "veya", "icin",
}


@dataclass(frozen=True)
class Name:
    surname: str  # display form, e.g. "Akipek"
    given: str  # display form, e.g. "Jale Güral" or "K." (may be empty)

    @property
    def key(self) -> str:
        return fold(self.surname)

    @property
    def initials(self) -> frozenset:
        return frozenset(t[0] for t in fold(self.given).split(" ") if t)

    def display(self) -> str:
        return squash(f"{self.surname}, {self.given}") if self.given else self.surname


def strip_titles(raw: str) -> str:
    """Remove academic and professional titles ("Prof. Dr.", "Yrd. Doç. Dr.", "Av.") wherever they stand."""
    words = squash(raw).split(" ")
    kept: List[str] = []
    for w in words:
        if fold(w) in TITLE_WORDS and (w.endswith(".") or w[:1].isupper()):
            continue
        kept.append(w)
    return squash(" ".join(kept))


_INITIALS = re.compile(r"^(?:[A-ZÇĞİÖŞÜ]\.\s*)+$")
_WORD = re.compile(r"^[A-ZÇĞİÖŞÜ][a-zçğıöşüâîû'’\-]+$")


def looks_like_name(raw: str) -> bool:
    """Conservative: every token is a capitalised word, an initial or a lower case particle."""
    toks = squash(strip_titles(raw)).replace("/", " ").split(" ")
    toks = [t for t in toks if t]
    if not toks or len(toks) > 5:
        return False
    caps = 0
    for t in toks:
        if fold(t) in NOT_A_NAME:
            return False
        if t.lower() in PARTICLES:
            continue
        if _WORD.match(t) or _INITIALS.match(t + " ") or re.fullmatch(r"[A-ZÇĞİÖŞÜ]\.?", t):
            caps += 1
            continue
        return False
    return caps >= 1


def parse_name(raw: str, surname_first: Optional[bool] = None) -> Optional[Name]:
    """"Jale Güral Akipek" -> Akipek / Jale Güral; "Akipek, J." -> Akipek / J.; "von Tuhr" -> von Tuhr."""
    s = squash(strip_titles(raw).strip(" ,;:()[]\"'“”"))
    if s.endswith(".") and not re.search(r"(?:^|[\s,])[A-ZÇĞİÖŞÜ]\.$", s):
        s = s[:-1]
    if not s:
        return None
    if "," in s:
        a, b = [p.strip() for p in s.split(",", 1)]
        if a and (surname_first is not False):
            return Name(a, b)
    toks = s.split(" ")
    if len(toks) == 1:
        return Name(toks[0], "")
    # surname = last word plus a directly preceding lower case particle
    i = len(toks) - 1
    while i > 0 and toks[i - 1].lower() in PARTICLES:
        i -= 1
    return Name(" ".join(toks[i:]), " ".join(toks[:i]))


def split_authors(raw: str) -> List[Name]:
    """"Oğuzman/Öz", "Oğuzman, K./Öz, T.", "Kemal Oğuzman ve Turgut Öz" -> two names."""
    s = squash(raw)
    parts: List[str]
    if "/" in s:
        parts = [p for p in s.split("/")]
    else:
        parts = re.split(r"\s+(?:ve|&)\s+", s)
    names: List[Name] = []
    for p in parts:
        n = parse_name(p)
        if n:
            names.append(n)
    return names


def compatible(a: Name, b: Name) -> bool:
    """Same person for clustering: equal surnames (or one is the tail of a compound surname) and no clash of
    given initials."""
    ka, kb = a.key, b.key
    if not ka or not kb:
        return False
    same = ka == kb
    if not same:
        ta, tb = ka.split(" "), kb.split(" ")
        same = (len(ta) > 1 and ta[-1] == kb) or (len(tb) > 1 and tb[-1] == ka)
    if not same:
        return False
    ia, ib = a.initials, b.initials
    return not (ia and ib and not (ia & ib))
