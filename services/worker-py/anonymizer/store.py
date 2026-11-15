"""Persistence interface for anon.run. SQL only, schema owned by packages/db (anonymization_spans,
review_queue, records, jobs). No statement logs record text.

Contract v1.1 (ADR-0023, docs/istekler/mimar-yonlendirme-anonimlestirme.md): records.masked_text is the only
servable text. It is written in the same transaction as the spans when the result is publishable (editor
queue empty and, outside development, an NER model ran; AnonResult.blocked) and set to NULL otherwise, so a
record waiting for review is neither served nor indexed. The embed.chunks job is queued only after masked_text
has been written.

Editor approval: the admin panel only records the decision on the review_queue row (apps/web admin.ts). The
next anon.run of the record reads the latest decided anonymization item of the same anonymizationVersion
(approval()); when it is "onay" and lists every review item of the new result, the result is published and the
reviewed spans carry the editor and time (anonymization_spans.reviewed_by, reviewed_at). approvals.py queues
that anon.run for approved records that are still unpublished."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, NamedTuple, Optional, Protocol

from .pipeline import AnonResult, Approval, review_item_key


class LoadedRecord(NamedTuple):
    text: str
    court: Optional[str]
    source_key: Optional[str] = None


class AnonStore(Protocol):
    def load(self, record_id: str) -> Optional[LoadedRecord]:
        """Return (text, court, source_key) or None when the record does not exist."""

    def approval(self, record_id: str, anonymization_version: str) -> Optional[Approval]:
        """The editor approval of the latest decided anonymization item of this version, if it is "onay"."""

    def save(self, record_id: str, result: AnonResult) -> None: ...


LOAD_SQL = "SELECT text, court, source_key FROM records WHERE id = %(id)s"
# The latest editor decision on an anonymization item of this version; superseded rows are system writes and
# do not count. A later "ret" or "duzelt" therefore cancels an earlier "onay".
APPROVAL_SQL = """
SELECT id, decision, payload, decided_by, decided_at FROM review_queue
WHERE queue = 'anonymization' AND subject_type = 'record' AND subject_id = %(id)s
  AND decision IN ('onay', 'ret', 'duzelt') AND payload->>'anonymizationVersion' = %(version)s
ORDER BY decided_at DESC NULLS LAST, created_at DESC
LIMIT 1
"""
DELETE_SPANS_SQL = "DELETE FROM anonymization_spans WHERE record_id = %(id)s AND policy_version = %(pv)s"
INSERT_SPAN_SQL = """
INSERT INTO anonymization_spans (record_id, policy_version, entity, mask, char_start, char_end, detector,
  score, reviewed_by, reviewed_at)
VALUES (%(id)s, %(pv)s, %(entity)s, %(mask)s, %(start)s, %(end)s, %(detector)s, %(score)s, %(reviewed_by)s,
  %(reviewed_at)s)
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
UPDATE records SET anonymized = %(anonymized)s, anonymization_version = %(version)s, masked_text = %(masked)s,
  updated_at = now()
WHERE id = %(id)s
"""
ENQUEUE_EMBED_SQL = """
INSERT INTO jobs (type, payload, dedupe_key) VALUES ('embed.chunks'::job_type, %(payload)s::jsonb, %(dedupe_key)s)
ON CONFLICT (type, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running') DO NOTHING
"""


def servable_text(result: AnonResult) -> Optional[str]:
    """records.masked_text for this result: the masked text when publishable, otherwise None (fail closed)."""
    return result.masked_text if result.publishable else None


def approval_from_row(review_id: Any, decision: Any, payload: Any, decided_by: Any = None,
                      decided_at: Any = None) -> Optional[Approval]:
    """Approval of a decided review_queue row; None unless the decision is "onay" on an unblocked item with a
    well formed item list (a malformed item cancels the approval rather than being skipped)."""
    if decision != "onay":
        return None
    if isinstance(payload, (str, bytes)):
        payload = json.loads(payload)
    if not isinstance(payload, dict) or "blocked" in payload:
        return None
    version = payload.get("anonymizationVersion")
    items = payload.get("items")
    if not isinstance(version, str) or not isinstance(items, list):
        return None
    keys = [review_item_key(i) if isinstance(i, dict) else None for i in items]
    if any(k is None for k in keys):
        return None
    return Approval(str(review_id), version, frozenset(k for k in keys if k is not None),
                    None if decided_by is None else str(decided_by), decided_at)


def _reviewed(result: AnonResult, span: Any) -> Dict[str, Any]:
    if result.approval is None or not span.needs_review:
        return {"reviewed_by": None, "reviewed_at": None}
    return {"reviewed_by": result.approval.decided_by, "reviewed_at": result.approval.decided_at}


class SqlAnonStore:
    """Writes through a psycopg style cursor inside the caller's transaction. Idempotent: re-running for the
    same record and policy version replaces spans and supersedes open review rows."""

    def __init__(self, cur: Any):
        self.cur = cur

    def load(self, record_id: str) -> Optional[LoadedRecord]:
        self.cur.execute(LOAD_SQL, {"id": record_id})
        rows = self.cur.fetchall()
        return LoadedRecord(*rows[0][:3]) if rows else None

    def approval(self, record_id: str, anonymization_version: str) -> Optional[Approval]:
        self.cur.execute(APPROVAL_SQL, {"id": record_id, "version": anonymization_version})
        rows = self.cur.fetchall()
        return approval_from_row(*rows[0][:5]) if rows else None

    def save(self, record_id: str, result: AnonResult) -> None:
        pv = result.policy_version
        self.cur.execute(DELETE_SPANS_SQL, {"id": record_id, "pv": pv})
        for s in result.spans:
            self.cur.execute(INSERT_SPAN_SQL, {"id": record_id, "pv": pv, "entity": s.entity, "mask": s.mask,
                                               "start": s.start, "end": s.end, "detector": s.detector,
                                               "score": s.score, **_reviewed(result, s)})
        self.cur.execute(CLOSE_OPEN_REVIEW_SQL, {"id": record_id})
        row = result.review_queue_row(record_id)
        if row:
            self.cur.execute(INSERT_REVIEW_SQL, {"id": record_id, "payload": json.dumps(row["payload"]),
                                                 "priority": row["priority"]})
        masked = servable_text(result)
        self.cur.execute(UPDATE_RECORD_SQL, {"id": record_id, "anonymized": result.publishable,
                                             "version": result.anonymization_version, "masked": masked})
        if masked is not None:
            self.cur.execute(ENQUEUE_EMBED_SQL, {"payload": json.dumps({"recordId": record_id}),
                                                 "dedupe_key": f"embed:{record_id}"})


class MemoryAnonStore:
    """In memory store for tests and the eval harness. Records are (text, court) or (text, court, source_key).
    review_rows holds the open items; decide() moves one to decided as an editor would."""

    def __init__(self, records: Optional[Dict[str, tuple]] = None):
        self.records = records or {}
        self.saved: Dict[str, AnonResult] = {}
        self.masked_text: Dict[str, Optional[str]] = {}
        self.review_rows: List[dict] = []
        self.decided: List[dict] = []
        self.embed_jobs: List[str] = []
        self._ids = 0

    def load(self, record_id: str) -> Optional[LoadedRecord]:
        rec = self.records.get(record_id)
        return LoadedRecord(*rec) if rec is not None else None

    def approval(self, record_id: str, anonymization_version: str) -> Optional[Approval]:
        for row in reversed(self.decided):
            if (row["subject_id"] == record_id and row["decision"] in ("onay", "ret", "duzelt")
                    and row["payload"].get("anonymizationVersion") == anonymization_version):
                return approval_from_row(row["id"], row["decision"], row["payload"], row.get("decided_by"),
                                         row.get("decided_at"))
        return None

    def decide(self, record_id: str, decision: str, by: str = "editor",
               at: Optional[datetime] = None) -> dict:
        row = next(r for r in self.review_rows if r["subject_id"] == record_id)
        self.review_rows.remove(row)
        when = at or datetime.now(timezone.utc)
        decided = {**row, "decision": decision, "decided_by": by, "decided_at": when}
        self.decided.append(decided)
        return decided

    def save(self, record_id: str, result: AnonResult) -> None:
        self.saved[record_id] = result
        self.masked_text[record_id] = servable_text(result)
        self.review_rows = [r for r in self.review_rows if r["subject_id"] != record_id]
        row = result.review_queue_row(record_id)
        if row:
            self._ids += 1
            self.review_rows.append({**row, "id": f"review-{self._ids}"})
        if self.masked_text[record_id] is not None and record_id not in self.embed_jobs:
            self.embed_jobs.append(record_id)
