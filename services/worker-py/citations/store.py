"""Persistence for citations.extract. SQL only; the schema belongs to packages/db.

Existing tables (packages/db/src/schema/corpus.ts): records, citation_edges, review_queue, works.
Requested additions (docs/istekler/atif-agi-sema.md), used only when `doctrine=True`:
  works.work_key text unique, work_citations(from_record_id, work_id, pages, confidence, confirmed, extractor).

Editor decision convention until a `rejected` column exists: a confirmed edge has confirmed = true; a rejected
edge keeps its row with confirmed = true and confidence = 0, so re-extraction does not bring it back and the
serving query (confirmed or confidence >= 0.90, and confidence > 0) hides it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Protocol, Sequence, Tuple

from .names import parse_name
from .pipeline import Extraction, RecordMeta
from .scoring import DecisionIndex, Target
from .works import Work, WorkRegistry


class NotServable(Exception):
    """masked_text is NULL: the record is neither served nor read for citations (ADR-0023, fail closed)."""


@dataclass
class LoadedRecord:
    meta: RecordMeta
    masked_text: str


class CitationStore(Protocol):
    def load(self, record_id: str) -> Optional[LoadedRecord]: ...
    def index(self) -> DecisionIndex: ...
    def registry(self) -> WorkRegistry: ...
    def save(self, record_id: str, ex: Extraction) -> None: ...


LOAD_SQL = "SELECT masked_text, esas_no, karar_no, court, chamber FROM records WHERE id = %(id)s"
FIND_SQL = """
SELECT id, court, chamber, decision_date::text, esas_no, karar_no FROM records
WHERE replace(esas_no, ' ', '') = %(esas)s AND replace(karar_no, ' ', '') = %(karar)s
  AND hidden_at IS NULL AND id <> %(self)s
LIMIT 5
"""
FIND_NUMBER_SQL = """
SELECT id, court, chamber, decision_date::text, esas_no, karar_no FROM records
WHERE replace(esas_no, ' ', '') = %(number)s AND hidden_at IS NULL AND id <> %(self)s LIMIT 5
"""
UPSERT_EDGE_SQL = """
INSERT INTO citation_edges (from_record_id, to_record_id, to_raw, kind, confidence, confirmed, extractor)
VALUES (%(src)s, %(to)s, %(to_raw)s, 'atif'::citation_edge_kind, %(conf)s, false, %(extractor)s)
ON CONFLICT (from_record_id, to_raw, kind) DO UPDATE
  SET to_record_id = excluded.to_record_id, confidence = excluded.confidence, extractor = excluded.extractor
  WHERE citation_edges.confirmed = false
RETURNING id
"""
# Edges this run no longer finds are removed unless an editor touched them.
PRUNE_EDGES_SQL = """
DELETE FROM citation_edges WHERE from_record_id = %(src)s AND confirmed = false AND to_raw <> ALL(%(keep)s)
"""
CLOSE_QUEUE_SQL = """
UPDATE review_queue SET decision = 'superseded', decided_at = now()
WHERE queue = 'citations' AND subject_type = 'citation_edge' AND payload->>'recordId' = %(src)s AND decision IS NULL
"""
INSERT_QUEUE_SQL = """
INSERT INTO review_queue (queue, subject_type, subject_id, payload, priority)
VALUES ('citations', 'citation_edge', %(subject)s, %(payload)s::jsonb, %(priority)s)
"""
LOAD_WORKS_SQL = "SELECT work_key, title, authors, csl FROM works WHERE work_key IS NOT NULL"
UPSERT_WORK_SQL = """
INSERT INTO works (work_key, title, authors, year, venue, csl)
VALUES (%(key)s, %(title)s, %(authors)s::jsonb, %(year)s, %(venue)s, %(csl)s::jsonb)
ON CONFLICT (work_key) DO UPDATE SET csl = excluded.csl, authors = excluded.authors
RETURNING id
"""
UPSERT_WORK_CITATION_SQL = """
INSERT INTO work_citations (from_record_id, work_id, pages, confidence, confirmed, extractor)
VALUES (%(src)s, %(work)s, %(pages)s::jsonb, %(conf)s, false, %(extractor)s)
ON CONFLICT (from_record_id, work_id) DO UPDATE
  SET pages = excluded.pages, confidence = excluded.confidence, extractor = excluded.extractor
  WHERE work_citations.confirmed = false
RETURNING id
"""
PRUNE_WORK_CITATIONS_SQL = """
DELETE FROM work_citations WHERE from_record_id = %(src)s AND confirmed = false AND work_id <> ALL(%(keep)s::uuid[])
"""


class _SqlIndex:
    def __init__(self, cur: Any, self_id: str = ""):
        self.cur, self.self_id = cur, self_id or "00000000-0000-0000-0000-000000000000"

    def find(self, kind: str, esas: Optional[str], karar: Optional[str], number: Optional[str]) -> Sequence[Target]:
        if kind in ("abad", "aihm"):
            return []  # foreign courts are not in the corpus as records with these numbers yet
        if number:
            self.cur.execute(FIND_NUMBER_SQL, {"number": number, "self": self.self_id})
        else:
            self.cur.execute(FIND_SQL, {"esas": esas, "karar": karar, "self": self.self_id})
        return [Target(str(r[0]), r[1], r[2], r[3], r[4], r[5]) for r in self.cur.fetchall()]


class SqlCitationStore:
    """psycopg style cursor inside the caller's transaction. Idempotent per record."""

    def __init__(self, cur: Any, doctrine: bool = False):
        self.cur = cur
        self.doctrine = doctrine
        self._registry: Optional[WorkRegistry] = None

    def load(self, record_id: str) -> Optional[LoadedRecord]:
        self.cur.execute(LOAD_SQL, {"id": record_id})
        rows = self.cur.fetchall()
        if not rows:
            return None
        masked, esas, karar, court, chamber = rows[0]
        if masked is None:
            raise NotServable(record_id)
        return LoadedRecord(RecordMeta(record_id, esas, karar, court, chamber), masked)

    def index(self) -> DecisionIndex:
        return _SqlIndex(self.cur)

    def registry(self) -> WorkRegistry:
        if self._registry is None:
            works: List[Work] = []
            if self.doctrine:
                self.cur.execute(LOAD_WORKS_SQL)
                for key, title, authors, csl in self.cur.fetchall():
                    names = [n for n in (parse_name(a, surname_first=True if "," in a else None) for a in (authors or [])) if n]
                    csl = csl or {}
                    works.append(Work(key, names, title, csl.get("kind", "kitap"), csl.get("venue"), csl.get("editions", [])))
            self._registry = WorkRegistry(works)
        return self._registry

    def save(self, record_id: str, ex: Extraction) -> None:
        subjects: Dict[str, str] = {}
        keep = []
        self.cur.execute(CLOSE_QUEUE_SQL, {"src": record_id})
        for e in ex.decisions:
            keep.append(e.to_raw)
            self.cur.execute(UPSERT_EDGE_SQL, {"src": record_id, "to": e.to_record_id, "to_raw": e.to_raw,
                                               "conf": e.confidence, "extractor": ex.extractor})
            row = self.cur.fetchall()
            if row:
                subjects[f"k:{e.to_raw}"] = str(row[0][0])
        self.cur.execute(PRUNE_EDGES_SQL, {"src": record_id, "keep": keep})
        if self.doctrine:
            work_ids = []
            for d in ex.doctrine:
                w = d.work
                self.cur.execute(UPSERT_WORK_SQL, {
                    "key": d.work_key, "title": w["title"], "authors": json.dumps(w["authors"]),
                    "year": next((int(e["year"]) for e in w["editions"] if e.get("year")), None), "venue": w.get("venue"),
                    "csl": json.dumps({"kind": w["kind"], "venue": w.get("venue"), "editions": w["editions"]})})
                wid = str(self.cur.fetchall()[0][0])
                work_ids.append(wid)
                self.cur.execute(UPSERT_WORK_CITATION_SQL, {"src": record_id, "work": wid, "pages": json.dumps(d.pages),
                                                            "conf": d.confidence, "extractor": ex.extractor})
                row = self.cur.fetchall()
                if row:
                    subjects[f"d:{d.work_key}"] = str(row[0][0])
            self.cur.execute(PRUNE_WORK_CITATIONS_SQL, {"src": record_id, "keep": work_ids})
        for q in ex.queue:
            cand = q["payload"]["candidate"]
            subject = subjects.get(f"k:{cand.get('toRaw')}") if q["payload"]["kind"] == "karar" else subjects.get(f"d:{cand['work']['key']}")
            self.cur.execute(INSERT_QUEUE_SQL, {"subject": subject, "payload": json.dumps(q["payload"]), "priority": q["priority"]})


class MemoryCitationStore:
    """In-memory store for tests and the eval run. Mirrors the SQL store's behaviour on confirmed edges."""

    def __init__(self, records: Optional[Dict[str, Tuple[RecordMeta, Optional[str]]]] = None):
        self.records: Dict[str, Tuple[RecordMeta, Optional[str]]] = records or {}
        self.results: Dict[str, Extraction] = {}
        self.queue_rows: List[Dict[str, Any]] = []
        self._registry = WorkRegistry()

    def load(self, record_id: str) -> Optional[LoadedRecord]:
        if record_id not in self.records:
            return None
        meta, masked = self.records[record_id]
        if masked is None:
            raise NotServable(record_id)
        return LoadedRecord(meta, masked)

    def index(self) -> DecisionIndex:
        recs = self.records

        class _Idx:
            def find(self, kind: str, esas: Optional[str], karar: Optional[str], number: Optional[str]) -> Sequence[Target]:
                out = []
                for rid, (m, _) in recs.items():
                    e = (m.esas_no or "").replace(" ", "")
                    k = (m.karar_no or "").replace(" ", "")
                    if (number and e == number) or (esas and e == esas and k == karar):
                        out.append(Target(rid, m.court, m.chamber, None, m.esas_no, m.karar_no))
                return out

        return _Idx()

    def registry(self) -> WorkRegistry:
        return self._registry

    def save(self, record_id: str, ex: Extraction) -> None:
        self.results[record_id] = ex
        self.queue_rows = [r for r in self.queue_rows if r["payload"]["recordId"] != record_id] + ex.queue
