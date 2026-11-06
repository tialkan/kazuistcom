"""Confidence of a citation edge and the publish rule (plan 6.5/4, 15.3/4).

Publish rule: an edge is served when confidence >= PUBLISH_MIN or an editor confirmed it. Between QUEUE_MIN and
PUBLISH_MIN it goes to the editor queue (review_queue.queue = 'citations'). Below QUEUE_MIN it is dropped. The
decision edge also needs a resolved target record: an edge to a decision that is not in the corpus is stored
with `to_raw` only and is not drawn.

The numbers are starting values chosen on the 7 real decisions of packages/casuist/fixtures and are meant to
be re-fitted on the 100 decision gold set (eval/citations); they live here so the eval can import them.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Protocol, Sequence, Tuple

from .decisions import DecisionMention
from .text import fold

PUBLISH_MIN = 0.90
QUEUE_MIN = 0.50

# Network scope per release (plan 3/13: 1.0 HGK, IBK, AYM; 1.1 CGK, IDDK, VDDK; 2.0 chosen chambers). The
# citing record decides whether it enters the network.
SCOPE_1_0 = (
    ("Yargıtay", "Hukuk Genel Kurulu"),
    ("Yargıtay", "İçtihadı Birleştirme"),
    ("Anayasa Mahkemesi", None),
)


def in_network_scope(court: Optional[str], chamber: Optional[str], scope=SCOPE_1_0) -> bool:
    c, ch = fold(court or ""), fold(chamber or "")
    for sc, sch in scope:
        if fold(sc) in c and (sch is None or fold(sch) in ch):
            return True
    return False


@dataclass
class Target:
    id: str
    court: Optional[str]
    chamber: Optional[str]
    date: Optional[str]
    esas: Optional[str]
    karar: Optional[str]


class DecisionIndex(Protocol):
    def find(self, kind: str, esas: Optional[str], karar: Optional[str], number: Optional[str]) -> Sequence[Target]:
        """Corpus records whose esas and karar numbers (or AYM, ABAD, AIHM number) equal the cited ones."""


def decision_confidence(m: DecisionMention) -> Tuple[float, List[str]]:
    """Identification score of one mention, before the target lookup."""
    reasons = [f"kalip:{m.pattern}"]
    if m.pattern == "aym_label":
        c = 0.93 + (0.02 if m.date else 0.0)
        return min(c, 0.98), reasons
    if m.pattern == "abad":
        return 0.92, reasons
    if m.pattern == "aihm":
        ctx = "aihm_baglami" in m.evidence
        return (0.94 if ctx else 0.84), reasons + (["aihm_baglami"] if ctx else ["aihm_baglami_yok"])
    c = 0.78 if m.pattern != "combined" else 0.72
    if m.court is None:
        reasons.append("mahkeme_yazilmamis")
        return 0.55, reasons
    if m.court in ("Yargıtay", "Danıştay", "Anayasa Mahkemesi"):
        c += 0.08
        reasons.append("mahkeme_yazili")
    if m.chamber:
        c += 0.08
        reasons.append("daire_veya_kurul_yazili")
    if m.date:
        c += 0.04
        reasons.append("tarih_yazili")
    return min(c, 0.98), reasons


def chamber_compatible(cited: Optional[str], record_chamber: Optional[str]) -> bool:
    if not cited or not record_chamber:
        return True  # nothing written to contradict
    a, b = fold(cited), fold(record_chamber)
    return a in b or b in a


def resolve_target(m: DecisionMention, index: DecisionIndex) -> Tuple[Optional[str], float, List[str]]:
    """Returns (record id or None, confidence delta factor, reasons). A written chamber or date that disagrees
    with the only candidate is a conflict, not a match."""
    cands = list(index.find(m.kind, m.esas, m.karar, m.number))
    if not cands:
        return None, 1.0, ["hedef_corpusta_yok"]
    ok = [
        c
        for c in cands
        if chamber_compatible(m.chamber, c.chamber) and (not m.date or not c.date or m.date == c.date)
        and (m.court in (None, "alt") or not c.court or fold(m.court) in fold(c.court) or fold(c.court) in fold(m.court))
    ]
    if len(ok) == 1:
        agree = bool(m.chamber and ok[0].chamber) or bool(m.date and ok[0].date)
        return ok[0].id, 1.0 if agree else 0.95, ["hedef_tek_aday"] + (["alanlar_uyumlu"] if agree else [])
    if len(ok) > 1:
        return None, 0.7, ["hedef_birden_cok_aday"]
    return None, 0.55, ["hedef_alanlari_celisiyor"]
