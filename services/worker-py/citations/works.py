"""Work (eser) normalisation and de-duplication (plan 6.5/3) and in-document back reference resolution.

Editions of one book collapse into one work: the key comes from the first author surname and the title tokens,
never from the year or edition. "age." style references are resolved against works cited earlier in the same
document only; when more than one earlier work fits, the most recent wins with a lower score and the editor
queue decides.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Sequence, Tuple

from .doctrine import DoctrineMention
from .names import Name, compatible
from .text import fold

STOP = {"ve", "ile", "bir", "the", "of", "and", "c", "cilt", "birinci", "ikinci", "ucuncu", "dorduncu", "i", "ii", "iii", "iv"}
TITLE_MATCH = 0.85


def title_tokens(title: str) -> List[str]:
    return [t for t in fold(title).split(" ") if t and t not in STOP]


def _tok_eq(a: str, b: str) -> bool:
    if a == b:
        return True
    return min(len(a), len(b)) >= 5 and SequenceMatcher(None, a, b).ratio() >= 0.88


def _matched(ta: Sequence[str], tb: Sequence[str]) -> int:
    used = set()
    n = 0
    for a in ta:
        for j, b in enumerate(tb):
            if j not in used and _tok_eq(a, b):
                used.add(j)
                n += 1
                break
    return n


def title_similarity(a: str, b: str) -> float:
    """Dice coefficient over fuzzily matched title tokens (typos and "Hukuk"/"Hukuku" tolerated)."""
    ta, tb = title_tokens(a), title_tokens(b)
    if not ta or not tb:
        return 0.0
    return 2 * _matched(ta, tb) / (len(ta) + len(tb))


def title_contains(short: str, full: str) -> bool:
    """Every token of `short` (at least two) is in `full`: "Genel Hükümler" in "Borçlar Hukuku Genel Hükümler"."""
    ts, tf = title_tokens(short), title_tokens(full)
    return len(ts) >= 1 and _matched(ts, tf) == len(ts) and (len(ts) >= 2 or len(tf) <= 4)


def authors_compatible(a: Sequence[Name], b: Sequence[Name]) -> bool:
    if not a or not b:
        return False
    if not compatible(a[0], b[0]):
        return False
    if len(a) >= 2 and len(b) >= 2:
        return compatible(a[1], b[1])
    return True


def work_key(authors: Sequence[Name], title: str) -> str:
    base = "+".join(a.key for a in authors[:2]) + "|" + " ".join(sorted(set(title_tokens(title))))
    return hashlib.sha1(base.encode("utf-8")).hexdigest()[:16]


@dataclass
class Work:
    key: str
    authors: List[Name]
    title: str
    kind: str = "kitap"  # 'kitap' | 'makale'
    venue: Optional[str] = None
    editions: List[Dict[str, object]] = field(default_factory=list)
    mentions: int = 0

    def add_edition(self, year: Optional[int], edition: Optional[str], place: Optional[str], volume: Optional[str]) -> None:
        e = {"year": year, "edition": edition, "place": place, "volume": volume}
        if e not in self.editions and any(v is not None for v in e.values()):
            self.editions.append(e)

    def as_dict(self) -> Dict[str, object]:
        return {
            "key": self.key,
            "authors": [a.display() for a in self.authors],
            "title": self.title,
            "kind": self.kind,
            "venue": self.venue,
            "editions": self.editions,
        }


class WorkRegistry:
    """Clusters mentions into works. Seeded with works already stored so keys stay stable across documents."""

    def __init__(self, works: Optional[Sequence[Work]] = None):
        self._by_surname: Dict[str, List[Work]] = {}
        self.works: Dict[str, Work] = {}
        for w in works or []:
            self._index(w)

    def _index(self, w: Work) -> None:
        self.works[w.key] = w
        for a in w.authors[:1]:
            self._by_surname.setdefault(a.key.split(" ")[-1], []).append(w)

    def candidates(self, authors: Sequence[Name]) -> List[Work]:
        if not authors:
            return []
        return [w for w in self._by_surname.get(authors[0].key.split(" ")[-1], []) if authors_compatible(authors, w.authors)]

    def add(self, m: DoctrineMention) -> Work:
        assert m.title and m.authors
        title = m.full_title or m.title
        best: Tuple[float, Optional[Work]] = (0.0, None)
        for w in self.candidates(m.authors):
            s = title_similarity(title, w.title)
            if s > best[0]:
                best = (s, w)
        if best[1] is not None and best[0] >= TITLE_MATCH:
            w = best[1]
        else:
            w = Work(work_key(m.authors, title), list(m.authors), title, "makale" if m.form == "article" else "kitap", m.venue)
            self._index(w)
        w.add_edition(m.year, m.edition, m.place, m.volume)
        w.mentions += 1
        return w


@dataclass
class Resolved:
    mention: DoctrineMention
    work: Optional[Work]
    confidence: float
    reasons: List[str]
    via: str  # 'tam' | 'age' | 'kisa_baslik'


IMMEDIATE_CHARS = 800


def resolve_document(
    mentions: Sequence[DoctrineMention],
    registry: WorkRegistry,
    other_positions: Sequence[int] = (),
) -> List[Resolved]:
    """Resolve every mention to a work. `other_positions` are start offsets of non doctrine citations; they break
    the immediacy of an author-less "age." (the antecedent is then not the previous footnote)."""
    out: List[Resolved] = []
    history: List[Tuple[Work, int]] = []  # (work, end offset of the mention) in reading order
    for m in mentions:
        if m.form in ("full", "article"):
            w = registry.add(m)
            history.append((w, m.end))
            out.append(Resolved(m, w, m.confidence, list(m.evidence), "tam"))
            continue
        reasons = list(m.evidence)
        if m.form == "ibid":
            if m.authors:
                cands = _distinct([w for w, _ in history if authors_compatible(m.authors, w.authors)])
                if len(cands) == 1:
                    w, conf = cands[0], 0.93
                    reasons.append("age_yazar_tek_aday")
                elif len(cands) > 1:
                    w, conf = _most_recent(history, cands), 0.62
                    reasons.append("age_yazar_birden_cok_aday")
                else:
                    w, conf = None, 0.25
                    reasons.append("age_onceki_eser_yok")
            else:
                if history:
                    w, last_end = history[-1]
                    between = [p for p in other_positions if last_end <= p < m.start]
                    near = m.start - last_end <= IMMEDIATE_CHARS and not between
                    conf = 0.90 if near else 0.70
                    reasons.append("age_yazarsiz_hemen_onceki" if near else "age_yazarsiz_uzak")
                else:
                    w, conf = None, 0.25
                    reasons.append("age_onceki_eser_yok")
            if w is not None:
                history.append((w, m.end))
                w.mentions += 1
            out.append(Resolved(m, w, conf, reasons, "age"))
            continue
        # short title
        cands = _distinct([w for w, _ in history if authors_compatible(m.authors, w.authors) and title_contains(m.title or "", w.title)])
        if len(cands) == 1:
            w, conf = cands[0], 0.93
            reasons.append("kisa_baslik_tek_aday")
        elif len(cands) > 1:
            w, conf = _most_recent(history, cands), 0.62
            reasons.append("kisa_baslik_birden_cok_aday")
        else:
            w, conf = None, 0.20
            reasons.append("kisa_baslik_onceki_eser_yok")
        if w is not None:
            history.append((w, m.end))
            w.mentions += 1
        out.append(Resolved(m, w, conf, reasons, "kisa_baslik"))
    return out


def _distinct(ws: Sequence[Work]) -> List[Work]:
    seen: Dict[str, Work] = {}
    for w in ws:
        seen.setdefault(w.key, w)
    return list(seen.values())


def _most_recent(history: Sequence[Tuple[Work, int]], cands: Sequence[Work]) -> Work:
    keys = {c.key for c in cands}
    for w, _ in reversed(history):
        if w.key in keys:
            return w
    return cands[0]
