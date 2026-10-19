"""Span model and overlap resolution shared by all detectors."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Iterable, List, Optional


@dataclass(frozen=True)
class Span:
    """A detected entity. Offsets are Python string indices (code points) into the original text."""

    start: int
    end: int
    entity: str
    detector: str
    score: float
    # Optional role cue (davaci, sanik, ...) for PERSON spans; filled by roles.py.
    role: Optional[str] = None
    # Canonical form used for in-document consistency (same person, same label).
    key: Optional[str] = None
    meta: dict = field(default_factory=dict, compare=False, hash=False)

    @property
    def length(self) -> int:
        return self.end - self.start

    def with_(self, **kw) -> "Span":
        return replace(self, **kw)


# Higher wins when two spans overlap and neither contains the other.
DETECTOR_PRIORITY = {"checksum": 4, "structural": 3, "context": 2, "ner": 2, "presidio": 1, "lexicon": 1}


def _rank(s: Span) -> tuple:
    return (DETECTOR_PRIORITY.get(s.detector.split(":")[0], 0), s.score, s.length)


def resolve_overlaps(spans: Iterable[Span]) -> List[Span]:
    """Keep a non overlapping set. A span fully containing another wins when its score is not lower by more
    than 0.15; otherwise the higher ranked span wins. Result is sorted by start."""
    ordered = sorted(spans, key=lambda s: (s.start, -s.length))
    kept: List[Span] = []
    for s in ordered:
        clash = [k for k in kept if k.start < s.end and s.start < k.end]
        if not clash:
            kept.append(s)
            continue
        win = True
        for k in clash:
            if (k.start, k.end) == (s.start, s.end):
                if _rank(k) >= _rank(s):
                    win = False
            elif k.start <= s.start and s.end <= k.end and k.score >= s.score - 0.15:
                win = False
            elif s.start <= k.start and k.end <= s.end and s.score >= k.score - 0.15:
                continue
            elif _rank(k) >= _rank(s):
                win = False
        if win:
            kept = [k for k in kept if k not in clash]
            kept.append(s)
    return sorted(kept, key=lambda s: s.start)
