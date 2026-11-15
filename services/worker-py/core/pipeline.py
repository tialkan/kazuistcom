"""Ingestion pipeline: draft record -> repository -> anonymisation hook (plan 6.2/6).

Decisions are stored with anonymized=false and an anon.run job is queued. Nothing is published, embedded or
cached for search until the anonymiser marks the record anonymized and queues embed.chunks itself, so this
module never queues embed.chunks for a decision. Norms and bibliographic records carry no party data and are
stored as anonymized=true with anonymization_version 'gerekmez-norm'.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Set, Tuple

from .jobs import JobType
from .records import RecordDraft, VersionDraft
from .storage import RawDocument


class Repository(Protocol):
    def upsert_record(self, draft: RecordDraft, raw: Optional[RawDocument]) -> Tuple[str, bool]: ...

    def enqueue(self, job_type: JobType, payload: Dict[str, Any], dedupe_key: Optional[str]) -> None: ...

    def upsert_work(self, record_id: str, work: Dict[str, Any]) -> None: ...

    def known_source_keys(self, keys: List[str]) -> Set[str]: ...


@dataclass
class IngestOutcome:
    record_id: str
    created: bool
    anon_queued: bool


def ingest(draft: RecordDraft, raw: Optional[RawDocument], repo: Repository) -> IngestOutcome:
    record_id, created = repo.upsert_record(draft, raw)
    if draft.extra.get("work"):
        repo.upsert_work(record_id, draft.extra["work"])
    anon_queued = False
    if draft.requires_anonymization:
        repo.enqueue(JobType.ANON_RUN, {"recordId": record_id}, f"anon:{record_id}")
        anon_queued = True
    return IngestOutcome(record_id, created, anon_queued)


def is_publishable(row: Dict[str, Any]) -> bool:
    """A record may reach search, AI or cache only after anonymisation (plan 6.2/6)."""
    return bool(row.get("anonymized")) and bool(row.get("license_basis")) and bool(row.get("source_url"))


@dataclass
class InMemoryRepository:
    records: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    raws: List[RawDocument] = field(default_factory=list)
    jobs: List[Dict[str, Any]] = field(default_factory=list)
    versions: Dict[str, List[Any]] = field(default_factory=dict)
    dedupe_index: Dict[str, str] = field(default_factory=dict)
    works: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def upsert_work(self, record_id: str, work: Dict[str, Any]) -> None:
        self.works[record_id] = work

    def known_source_keys(self, keys: List[str]) -> Set[str]:
        return {k for k in keys if k in self.dedupe_index}

    def upsert_record(self, draft: RecordDraft, raw: Optional[RawDocument]) -> Tuple[str, bool]:
        existing = self.dedupe_index.get(draft.source_key)
        if existing is None and draft.requires_anonymization:
            existing = self.dedupe_index.get(draft.dedupe)
        created = existing is None
        record_id = existing or f"rec-{len(self.records) + 1}"
        row = draft.to_row()
        if not created and self.records[record_id]["text"] == row["text"]:
            row["anonymized"] = self.records[record_id]["anonymized"]
            row["anonymization_version"] = self.records[record_id]["anonymization_version"]
        self.records[record_id] = row
        self.dedupe_index[draft.source_key] = record_id
        if draft.requires_anonymization:
            self.dedupe_index[draft.dedupe] = record_id
        if raw is not None and raw not in self.raws:
            self.raws.append(raw)
        chain = self.versions.setdefault(record_id, [])
        for v in draft.versions:
            open_v = next((x for x in chain if x.valid_to is None), None)
            if open_v is not None and open_v.text == v.text:
                continue  # unchanged text: no new version
            if any(x.valid_from == v.valid_from for x in chain):
                continue
            if open_v is not None and open_v.valid_from < v.valid_from:
                open_v.valid_to = _day_before(v.valid_from)
            chain.append(VersionDraft(v.valid_from, v.valid_to, v.text, v.amended_by))
        return record_id, created

    def enqueue(self, job_type: JobType, payload: Dict[str, Any], dedupe_key: Optional[str]) -> None:
        if dedupe_key and any(j["dedupe_key"] == dedupe_key for j in self.jobs):
            return
        self.jobs.append({"type": job_type.value, "payload": payload, "dedupe_key": dedupe_key})


UPSERT_RECORD_SQL = """
INSERT INTO records (type, title, court, chamber, esas_no, karar_no, decision_date, authority_class, jurisdiction,
  norm_refs, status, valid_from, valid_to, amended_by, license_basis, protocol_status, live_only, anonymized,
  anonymization_version, source_url, source_key, fetched_at, text, masked_text, openalex_cited_by)
VALUES (%(type)s::record_type, %(title)s, %(court)s, %(chamber)s, %(esas_no)s, %(karar_no)s, %(decision_date)s,
  %(authority_class)s::authority_class, %(jurisdiction)s, %(norm_refs)s::jsonb, %(status)s::record_status,
  %(valid_from)s, %(valid_to)s, %(amended_by)s, %(license_basis)s, %(protocol_status)s::protocol_status,
  %(live_only)s, %(anonymized)s, %(anonymization_version)s, %(source_url)s, %(source_key)s, %(fetched_at)s,
  %(text)s, %(masked_text)s, %(openalex_cited_by)s)
ON CONFLICT (source_key) DO UPDATE SET
  title = EXCLUDED.title, status = EXCLUDED.status, valid_from = EXCLUDED.valid_from,
  valid_to = EXCLUDED.valid_to, amended_by = EXCLUDED.amended_by, fetched_at = EXCLUDED.fetched_at,
  openalex_cited_by = EXCLUDED.openalex_cited_by, updated_at = now(),
  anonymized = CASE WHEN records.text = EXCLUDED.text THEN records.anonymized ELSE EXCLUDED.anonymized END,
  anonymization_version = CASE WHEN records.text = EXCLUDED.text THEN records.anonymization_version
                               ELSE EXCLUDED.anonymization_version END,
  masked_text = CASE WHEN EXCLUDED.masked_text IS NOT NULL THEN EXCLUDED.masked_text
                     WHEN records.text = EXCLUDED.text THEN records.masked_text ELSE NULL END,
  text = EXCLUDED.text
RETURNING id, (xmax = 0) AS created
"""

INSERT_RAW_SQL = """
INSERT INTO sources_raw (source, external_id, url, object_key, sha256, content_type, fetched_at, record_id)
VALUES (%(source)s, %(external_id)s, %(url)s, %(object_key)s, %(sha256)s, %(content_type)s, %(fetched_at)s,
  %(record_id)s)
ON CONFLICT (source, external_id, sha256) DO NOTHING
"""

CLOSE_VERSION_SQL = """
UPDATE record_versions SET valid_to = %(valid_to)s
WHERE record_id = %(record_id)s AND valid_to IS NULL AND valid_from < %(valid_from)s
"""

INSERT_VERSION_SQL = """
INSERT INTO record_versions (record_id, valid_from, valid_to, amended_by, text)
SELECT %(record_id)s, %(valid_from)s, %(valid_to)s, %(amended_by)s, %(text)s
WHERE NOT EXISTS (
  SELECT 1 FROM record_versions WHERE record_id = %(record_id)s AND valid_to IS NULL AND text = %(text)s
)
ON CONFLICT (record_id, valid_from) DO NOTHING
RETURNING id
"""

UPSERT_WORK_SQL = """
INSERT INTO works (record_id, openalex_id, doi, title, authors, year, venue)
VALUES (%(record_id)s, %(openalex_id)s, %(doi)s, %(title)s, %(authors)s::jsonb, %(year)s, %(venue)s)
ON CONFLICT (doi) DO UPDATE SET record_id = EXCLUDED.record_id, title = EXCLUDED.title,
  authors = EXCLUDED.authors, year = EXCLUDED.year, venue = EXCLUDED.venue,
  openalex_id = COALESCE(EXCLUDED.openalex_id, works.openalex_id)
"""

KNOWN_KEYS_SQL = "SELECT source_key FROM records WHERE source_key = ANY(%(keys)s)"

ENQUEUE_SQL = """
INSERT INTO jobs (type, payload, dedupe_key) VALUES (%(type)s::job_type, %(payload)s::jsonb, %(dedupe_key)s)
ON CONFLICT (type, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running') DO NOTHING
"""


class PgRepository:
    """SQL only; the schema is owned by packages/db. Takes an open psycopg cursor."""

    def __init__(self, cur: Any):
        self.cur = cur

    def upsert_record(self, draft: RecordDraft, raw: Optional[RawDocument]) -> Tuple[str, bool]:
        row = draft.to_row()
        row["norm_refs"] = json.dumps(row["norm_refs"]) if row["norm_refs"] else None
        self.cur.execute(UPSERT_RECORD_SQL, row)
        record_id, created = self.cur.fetchone()
        if raw is not None:
            self.cur.execute(
                INSERT_RAW_SQL,
                {
                    "source": raw.source,
                    "external_id": raw.external_id,
                    "url": raw.url,
                    "object_key": raw.object_key,
                    "sha256": raw.sha256,
                    "content_type": raw.content_type,
                    "fetched_at": raw.fetched_at,
                    "record_id": record_id,
                },
            )
        for v in draft.versions:
            self.cur.execute(
                INSERT_VERSION_SQL,
                {
                    "record_id": record_id,
                    "valid_from": v.valid_from,
                    "valid_to": v.valid_to,
                    "amended_by": v.amended_by,
                    "text": v.text,
                },
            )
            if self.cur.fetchone() is not None and v.valid_to is None:
                self.cur.execute(
                    CLOSE_VERSION_SQL,
                    {"record_id": record_id, "valid_from": v.valid_from, "valid_to": _day_before(v.valid_from)},
                )
        return str(record_id), bool(created)

    def known_source_keys(self, keys: List[str]) -> Set[str]:
        if not keys:
            return set()
        self.cur.execute(KNOWN_KEYS_SQL, {"keys": list(keys)})
        return {row[0] for row in self.cur.fetchall()}

    def upsert_work(self, record_id: str, work: Dict[str, Any]) -> None:
        params = {**work, "record_id": record_id, "authors": json.dumps(work.get("authors") or [])}
        self.cur.execute(UPSERT_WORK_SQL, params)

    def enqueue(self, job_type: JobType, payload: Dict[str, Any], dedupe_key: Optional[str]) -> None:
        self.cur.execute(
            ENQUEUE_SQL, {"type": job_type.value, "payload": json.dumps(payload), "dedupe_key": dedupe_key}
        )


def _day_before(d):
    from datetime import timedelta

    return d - timedelta(days=1)
