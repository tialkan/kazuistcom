"""Extraction of one record: decisions, doctrine, work clustering, scores, queue rows.

Input is masked text only. The result carries edges with a status:
  yayinla    served now (confidence >= PUBLISH_MIN and, for decisions, a resolved target)
  kuyruk     editor queue (QUEUE_MIN <= confidence < PUBLISH_MIN, or an ambiguous target)
  hedef_yok  decision edge whose target is not in the corpus yet; stored for later resolution, not served
Everything below QUEUE_MIN is dropped and only counted.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from .decisions import DecisionMention, extract_decisions
from .doctrine import DoctrineMention, extract_doctrine
from .llm import LlmItem, merge_with_llm
from .scoring import PUBLISH_MIN, QUEUE_MIN, DecisionIndex, decision_confidence, resolve_target
from .text import squash
from .works import Resolved, Work, WorkRegistry, resolve_document

EXTRACTOR = "atif-1.0"  # citation_edges.extractor; bump when patterns or scores change
CONTEXT_CHARS = 180


@dataclass
class RecordMeta:
    id: str
    esas_no: Optional[str] = None
    karar_no: Optional[str] = None
    court: Optional[str] = None
    chamber: Optional[str] = None


@dataclass
class DecisionEdge:
    kind: str  # 'yargi' | 'aym' | 'abad' | 'aihm'
    key: str
    to_raw: str  # stable text form, unique per citing record with kind (citation_edges_uq)
    court: Optional[str]
    chamber: Optional[str]
    esas: Optional[str]
    karar: Optional[str]
    number: Optional[str]
    date: Optional[str]
    confidence: float
    status: str
    to_record_id: Optional[str]
    reasons: List[str]
    spans: List[List[int]]  # [start, end] of each mention in the masked text
    context: str  # masked text around the first mention, for the editor


@dataclass
class DoctrineEdge:
    work: Dict[str, Any]
    work_key: str
    pages: List[str]
    confidence: float
    status: str
    reasons: List[str]
    spans: List[List[int]]
    context: str


@dataclass
class Extraction:
    record_id: str
    decisions: List[DecisionEdge] = field(default_factory=list)
    doctrine: List[DoctrineEdge] = field(default_factory=list)
    works: List[Work] = field(default_factory=list)
    dropped: int = 0
    out_of_scope: int = 0  # mentions of lower courts (dosya gecmisi), not citation edges
    extractor: str = EXTRACTOR

    @property
    def queue(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for e in self.decisions:
            if e.status == "kuyruk":
                rows.append(queue_row(self.record_id, "karar", e.confidence, e.reasons, e.context,
                                      {"kind": e.kind, "esas": e.esas, "karar": e.karar, "number": e.number,
                                       "court": e.court, "chamber": e.chamber, "date": e.date,
                                       "toRecordId": e.to_record_id, "toRaw": e.to_raw}))
        for d in self.doctrine:
            if d.status == "kuyruk":
                rows.append(queue_row(self.record_id, "doktrin", d.confidence, d.reasons, d.context,
                                      {"work": d.work, "pages": d.pages}))
        return rows

    @property
    def publishable_edges(self) -> int:
        return sum(e.status == "yayinla" for e in self.decisions) + sum(d.status == "yayinla" for d in self.doctrine)


def queue_row(record_id: str, kind: str, conf: float, reasons: Sequence[str], context: str, candidate: Dict[str, Any]) -> Dict[str, Any]:
    """review_queue payload (queue 'citations'). The context is a slice of masked text, never raw text."""
    return {
        "subject_type": "citation_edge",
        "priority": int(round((PUBLISH_MIN - conf) * 100)),  # closer to the line, more urgent to confirm
        "payload": {
            "recordId": record_id,
            "kind": kind,
            "confidence": round(conf, 3),
            "reasons": list(reasons),
            "context": context,
            "candidate": candidate,
        },
    }


def _context(text: str, start: int, end: int) -> str:
    return squash(text[max(0, start - CONTEXT_CHARS) : min(len(text), end + CONTEXT_CHARS)])


def _status(conf: float) -> str:
    if conf >= PUBLISH_MIN:
        return "yayinla"
    if conf >= QUEUE_MIN:
        return "kuyruk"
    return "dusur"


def _same_decision(m: DecisionMention, meta: RecordMeta) -> bool:
    return bool(meta.esas_no and meta.karar_no and m.esas and m.karar
                and re.sub(r"\s+", "", meta.esas_no) == m.esas and re.sub(r"\s+", "", meta.karar_no) == m.karar)


def extract_decision_edges(text: str, meta: RecordMeta, index: DecisionIndex, out: Extraction) -> None:
    groups: Dict[str, List[DecisionMention]] = {}
    for m in extract_decisions(text):
        if m.court == "alt":
            out.out_of_scope += 1
            continue
        if _same_decision(m, meta):
            continue
        groups.setdefault(m.key, []).append(m)
    for key, ms in groups.items():
        scored = []
        for m in ms:
            conf, reasons = decision_confidence(m)
            tid, factor, r2 = resolve_target(m, index)
            scored.append((conf * factor, m, tid, reasons + r2))
        conf, m, tid, reasons = max(scored, key=lambda s: s[0])
        status = _status(conf)
        if status == "dusur":
            out.dropped += 1
            continue
        if tid is None:
            status = "hedef_yok" if "hedef_corpusta_yok" in reasons else "kuyruk"
        elif status == "yayinla":
            status = "yayinla"
        # to_raw is the cited number as written in canonical form: unique per (citing record, kind).
        to_raw = m.number or f"{m.esas}|{m.karar}"
        out.decisions.append(
            DecisionEdge(m.kind, key, to_raw, m.court, m.chamber, m.esas, m.karar, m.number, m.date, round(conf, 3),
                         status, tid, reasons, [[x.start, x.end] for x in ms], _context(text, m.start, m.end))
        )


def extract_doctrine_edges(
    text: str,
    registry: WorkRegistry,
    out: Extraction,
    llm_items: Optional[Sequence[LlmItem]] = None,
    other_positions: Sequence[int] = (),
) -> None:
    mentions: List[DoctrineMention] = extract_doctrine(text)
    if llm_items is not None:
        mentions = merge_with_llm(mentions, llm_items)
    resolved: List[Resolved] = resolve_document(mentions, registry, other_positions)
    by_work: Dict[str, List[Resolved]] = {}
    for r in resolved:
        if r.work is None:
            if r.confidence < QUEUE_MIN:
                out.dropped += 1
            continue
        if r.confidence < QUEUE_MIN:
            out.dropped += 1
            continue
        by_work.setdefault(r.work.key, []).append(r)
    for key, rs in by_work.items():
        best = max(rs, key=lambda r: r.confidence)
        pages = []
        for r in rs:
            p = (r.mention.pages or "") + (" vd." if r.mention.vd else "")
            if p.strip() and p not in pages:
                pages.append(p)
        reasons = sorted({x for r in rs for x in r.reasons})
        out.doctrine.append(
            DoctrineEdge(best.work.as_dict(), key, pages, round(best.confidence, 3), _status(best.confidence), reasons,
                         [[r.mention.start, r.mention.end] for r in rs], _context(text, best.mention.start, best.mention.end))
        )
        if best.work not in out.works:
            out.works.append(best.work)


def extract_record(
    text: str,
    meta: RecordMeta,
    index: DecisionIndex,
    registry: Optional[WorkRegistry] = None,
    llm_items: Optional[Sequence[LlmItem]] = None,
) -> Extraction:
    """Rules plus optional model items over one record's masked text."""
    out = Extraction(meta.id)
    extract_decision_edges(text, meta, index, out)
    # An author-less "age." right after a decision citation does not refer to the book before it.
    positions = [m.num_start for m in extract_decisions(text)]
    extract_doctrine_edges(text, registry or WorkRegistry(), out, llm_items, positions)
    return out
