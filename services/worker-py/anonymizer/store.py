"""Persistence interface for anon.run. SQL only, schema owned by packages/db (anonymization_spans,
review_queue, records). No statement logs record text."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Protocol, Tuple

from .pipeline import AnonResult


class AnonStore(Protocol):
    def load(self, record_id: str) -> Optional[Tuple[str, Optional[str]]]:
        """Return (text, court) or None when the record does not exist."""

    def save(self, record_id: str, result: AnonResult) -> None: ...


LOAD_SQL = "SELECT text, court FROM records WHERE id = %(id)s"
DELETE_SPANS_SQL = "DELETE FROM anonymization_spans WHERE record_id = %(id)s AND policy_version = %(pv)s"
INSERT_SPAN_SQL = """
INSERT INTO anonymization_spans (record_id, policy_version, entity, mask, char_start, char_end, detector, score)
VALUES (%(id)s, %(pv)s, %(entity)s, %(mask)s, %(start)s, %(end)s, %(detector)s, %(score)s)
"""
CLOSE_OPEN_REVIEW_SQL = """
UPDATE review_queue SET decision = 'superseded', decided_at = now()
WHERE queue = 'anonymization' AND subject_type = 'record' AND subject_id = %(id)s AND decision IS NULL
"""
INSERT_REVIEW_SQL = """
INSERT INTO review_queue (queue, subject_type, subject_id, payload, priority)
VALUES ('anonymization', 'record', %(id)s, %(payload)s::jsonb, %(priority)s)
"""
UPDATE_RECORD_SQL = """
UPDATE records SET anonymized = %(anonymized)s, anonymization_version = %(version)s, updated_at = now()
WHERE id = %(id)s
"""


class SqlAnonStore:
    """Writes through a psycopg style cursor inside the caller's transaction. Idempotent: re-running for the
    same record and policy version replaces spans and supersedes open review rows."""

    def __init__(self, cur: Any):
        self.cur = cur

    def load(self, record_id: str):
        self.cur.execute(LOAD_SQL, {"id": record_id})
        rows = self.cur.fetchall()
        return (rows[0][0], rows[0][1]) if rows else None

    def save(self, record_id: str, result: AnonResult) -> None:
        pv = result.policy_version
        self.cur.execute(DELETE_SPANS_SQL, {"id": record_id, "pv": pv})
        for s in result.spans:
            self.cur.execute(INSERT_SPAN_SQL, {"id": record_id, "pv": pv, "entity": s.entity, "mask": s.mask,
                                               "start": s.start, "end": s.end, "detector": s.detector,
                                               "score": s.score})
        self.cur.execute(CLOSE_OPEN_REVIEW_SQL, {"id": record_id})
        row = result.review_queue_row(record_id)
        if row:
            self.cur.execute(INSERT_REVIEW_SQL, {"id": record_id, "payload": json.dumps(row["payload"]),
                                                 "priority": row["priority"]})
        self.cur.execute(UPDATE_RECORD_SQL, {"id": record_id, "anonymized": result.publishable,
                                             "version": result.anonymization_version})


class MemoryAnonStore:
    """In memory store for tests and the eval harness."""

    def __init__(self, records: Optional[Dict[str, Tuple[str, Optional[str]]]] = None):
        self.records = records or {}
        self.saved: Dict[str, AnonResult] = {}
        self.review_rows: List[dict] = []

    def load(self, record_id: str):
        return self.records.get(record_id)

    def save(self, record_id: str, result: AnonResult) -> None:
        self.saved[record_id] = result
        self.review_rows = [r for r in self.review_rows if r["subject_id"] != record_id]
        row = result.review_queue_row(record_id)
        if row:
            self.review_rows.append(row)
