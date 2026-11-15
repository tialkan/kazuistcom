"""Job queue contract, Python side (plan Ek C.3, ADR-0023, ADR-0035, ADR-0038).

Mirrors packages/db/src/jobs.ts and packages/contracts JobType, JobState and the job payload schemas. Python reads
and writes with SQL only and never changes the schema. Every handler must be idempotent; payloads carry ids, never
personal data.

Per claimed job the consumer checks the payload against the contract by hand (no new dependency; the shared
fixture packages/contracts/test/fixtures/job-payloads.json keeps it equal to zod) and buries an invalid one as
"invalid payload" without running or logging it. While the handler runs, a heartbeat thread renews the lock every
JOB_HEARTBEAT_SECONDS. complete, fail, bury and heartbeat match the worker id: a worker whose lock was released as
stale and taken by another worker gets no row back, logs "lock lost" and leaves the job to the new owner.
"""

from __future__ import annotations

import json
import re
import threading
import time
from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Any, Callable, Dict, Iterable, List, Optional, Protocol


class JobType(str, Enum):
    INGEST_FETCH = "ingest.fetch"
    INGEST_PARSE = "ingest.parse"
    ANON_RUN = "anon.run"
    EMBED_CHUNKS = "embed.chunks"
    CITATIONS_EXTRACT = "citations.extract"
    RULES_EXTRACT = "rules.extract"
    DOCX_VALIDATE = "docx.validate"
    KAMPUS_SUMMARIZE = "kampus.summarize"
    KAMPUS_POSTER = "kampus.poster"
    BILLING_MONTHLY_GRANT = "billing.monthly_grant"
    BILLING_RECONCILE = "billing.reconcile"
    NOTIFY_SEND = "notify.send"
    KALEMCIK_DAILY = "kalemcik.daily"
    MEVZUAT_RG_DAILY = "mevzuat.rg_daily"
    LIVE_FETCH = "live.fetch"
    ACCOUNT_PURGE = "account.purge"


class JobState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    DEAD = "dead"


def jobs_channel(job_type: JobType) -> str:
    """LISTEN channel for a job type: jobs_<type with dots replaced by underscores>."""
    return "jobs_" + job_type.value.replace(".", "_")


# Same values as packages/db/src/jobs.ts.
JOB_STALE_SECONDS = 900
JOB_HEARTBEAT_SECONDS = JOB_STALE_SECONDS / 3
INVALID_PAYLOAD_ERROR = "invalid payload"
STALE_LOCK_ERROR = "stale lock"

# Same statements as packages/db/src/jobs.ts, with psycopg placeholders (tests/test_jobs.py compares them).
CLAIM_JOBS_SQL = """
WITH next AS (
  SELECT id FROM jobs
  WHERE status = 'queued' AND type = %(type)s::job_type AND run_after <= now()
  ORDER BY run_after, created_at
  LIMIT %(limit)s
  FOR UPDATE SKIP LOCKED
)
UPDATE jobs j
SET status = 'running', locked_by = %(worker)s, locked_at = now(), attempts = j.attempts + 1, updated_at = now()
FROM next
WHERE j.id = next.id
RETURNING j.id, j.type, j.payload, j.attempts, j.max_attempts
"""

COMPLETE_JOB_SQL = """
UPDATE jobs SET status = 'done', result = %(result)s::jsonb, locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE id = %(id)s AND status = 'running' AND locked_by = %(worker)s
RETURNING id
"""

FAIL_JOB_SQL = """
UPDATE jobs SET
  status = CASE WHEN attempts >= max_attempts THEN 'dead'::job_status ELSE 'queued'::job_status END,
  error = %(error)s,
  run_after = now() + make_interval(secs => least(3600, 15 * power(2, attempts))),
  locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE id = %(id)s AND status = 'running' AND locked_by = %(worker)s
RETURNING id, status
"""

BURY_JOB_SQL = """
UPDATE jobs SET status = 'dead', error = %(error)s, locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE id = %(id)s AND status = 'running' AND locked_by = %(worker)s
RETURNING id
"""

HEARTBEAT_JOB_SQL = """
UPDATE jobs SET locked_at = now(), updated_at = now()
WHERE id = %(id)s AND status = 'running' AND locked_by = %(worker)s
RETURNING id
"""

RELEASE_STALE_JOBS_SQL = """
UPDATE jobs SET
  status = CASE WHEN attempts >= max_attempts THEN 'dead'::job_status ELSE 'queued'::job_status END,
  error = 'stale lock',
  locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE status = 'running' AND locked_at < now() - make_interval(secs => %(seconds)s)
RETURNING id, status
"""

ENQUEUE_JOB_SQL = """
INSERT INTO jobs (type, payload, dedupe_key, run_after)
VALUES (%(type)s::job_type, %(payload)s::jsonb, %(dedupe_key)s::text, coalesce(%(run_after)s::timestamptz, now()))
ON CONFLICT DO NOTHING
RETURNING id
"""

# Once per key in any state (also done or dead, until pruned): for daily and scheduled producers (ADR-0035).
ENQUEUE_ONCE_SQL = """
INSERT INTO jobs (type, payload, dedupe_key, run_after)
SELECT %(type)s::job_type, %(payload)s::jsonb, %(dedupe_key)s::text, coalesce(%(run_after)s::timestamptz, now())
WHERE %(dedupe_key)s::text IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM jobs WHERE type = %(type)s::job_type AND dedupe_key = %(dedupe_key)s::text)
ON CONFLICT DO NOTHING
RETURNING id
"""


# --- Payload contract (packages/contracts/src/jobs.ts jobPayloadSchemas) ------------------------------------------

# zod z.uuid(): RFC 9562 versions 1 to 8 and the nil and max values. \Z, not $: Python's $ also matches before a
# trailing newline, JavaScript's does not.
_UUID = re.compile(
    r"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
    r"|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)\Z"
)
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}\Z", re.ASCII)
_HTTP_URL = re.compile(r"^https?://\S+\Z")
_KANUN_NO = re.compile(r"^[0-9]{1,6}\Z")
# zod z.guid(): any 8-4-4-4-12 hex string (the AYM bank's ids are not RFC 9562 UUIDs).
_GUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\Z")
_COURT_DOC_ID = re.compile(r"^[0-9]{1,20}\Z")
# connectors/judicial.py case_number with ASCII digits ("2024/817", "2019/1-123", optional "/<digits>").
_CASE_NO = re.compile(r"^[0-9]{4}/[0-9A-Za-z()\-]+(?:/[0-9]+)?\Z")

NOTIFICATION_TYPES = frozenset({
    "teslim_hatirlatmasi", "kalemcik", "tam_metin_istegi", "tam_metin_cevabi", "takip", "odeme", "fesih_teyidi",
    "mevzuat_degisikligi", "kampanya",
})
BILLING_NOTICE_KINDS = frozenset({
    "odeme_7_gun", "yillik_30_gun", "odeme_alindi", "odeme_basarisiz", "plan_ucretsize_indi", "fiyat_degisikligi",
    "sozlesme",
})
NOTIFICATION_CHANNELS = frozenset({"email", "web_push", "apns"})
CITATIONS_MAX_RECORDS = 500
# ingest.fetch vocabularies (contracts aymDecisionTypes, courtSources, INGEST_MAX_PAGE; v1.6, ADR-0038).
AYM_DECISION_TYPES = frozenset({"BireyselBasvuru", "NormDenetimi"})
COURT_SOURCES = frozenset({"yargitay", "danistay"})
INGEST_MAX_PAGE = 10_000

# Types without a payload schema: no producer and no consumer yet (contracts jobPayloadExempt).
PAYLOAD_EXEMPT = frozenset({
    JobType.INGEST_PARSE, JobType.DOCX_VALIDATE, JobType.KAMPUS_SUMMARIZE, JobType.KAMPUS_POSTER, JobType.LIVE_FETCH,
})


def _uuid(v: Any) -> bool:
    return isinstance(v, str) and bool(_UUID.match(v))


def _date(v: Any) -> bool:
    if not isinstance(v, str) or not _DATE.match(v):
        return False
    try:
        date.fromisoformat(v)
    except ValueError:
        return False
    return True


def _text(v: Any, lo: int, hi: int) -> bool:
    # zod string lengths count UTF-16 code units.
    return isinstance(v, str) and lo <= len(v.encode("utf-16-le")) // 2 <= hi


def _int(v: Any, lo: int, hi: int) -> bool:
    if isinstance(v, bool):
        return False
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return isinstance(v, int) and lo <= v <= hi


def _url(v: Any) -> bool:
    return _text(v, 0, 2000) and bool(_HTTP_URL.match(v))


def _shape(p: Any, required: Dict[str, Callable[[Any], bool]],
           optional: Optional[Dict[str, Callable[[Any], bool]]] = None) -> bool:
    """A strict object: required keys present and valid, optional keys valid when present, nothing else."""
    optional = optional or {}
    if not isinstance(p, dict) or not set(p) <= set(required) | set(optional) or not set(required) <= set(p):
        return False
    return all(check(p[k]) for k, check in required.items()) and all(
        check(p[k]) for k, check in optional.items() if k in p
    )


def _ids(v: Any) -> bool:
    return isinstance(v, list) and 1 <= len(v) <= CITATIONS_MAX_RECORDS and all(_uuid(i) for i in v)


def _case_no(v: Any) -> bool:
    return _text(v, 0, 50) and bool(_CASE_NO.match(v))


def _ingest_fetch(p: Any) -> bool:
    """contracts IngestFetchPayload: a union, since five sources have a list shape and a document shape."""
    if not isinstance(p, dict):
        return False
    source = p.get("source")
    if not isinstance(source, str):
        return False
    src = {"source": lambda v: v == source}
    page = {"page": lambda v: _int(v, 1, INGEST_MAX_PAGE)}
    if source == "kvkk":
        return _shape(p, {**src, "url": _url}) or _shape(p, {**src, **page})
    if source == "rekabet":
        return _shape(p, {**src, "url": _url}, {"pdfUrl": _url}) or _shape(p, {**src, **page})
    if source == "aym":
        kind = {**src, "kararTipi": lambda v: isinstance(v, str) and v in AYM_DECISION_TYPES}
        return _shape(p, {**kind, **page}) or _shape(
            p, {**kind, "id": lambda v: isinstance(v, str) and bool(_GUID.match(v))}
        )
    if source in COURT_SOURCES:
        unit = {**src, "unit": lambda v: _text(v, 1, 100)}
        return _shape(p, {**unit, "year": lambda v: _int(v, 1900, 2100), **page}) or _shape(
            p,
            {**unit, "id": lambda v: isinstance(v, str) and bool(_COURT_DOC_ID.match(v)), "esas": _case_no,
             "karar": _case_no, "date": _date},
        )
    if source in ("openalex", "crossref"):
        return _shape(p, {**src, "doi": lambda v: _text(v, 1, 200)})
    if source == "eurlex":
        return _shape(p, {**src, "celex": lambda v: _text(v, 1, 50)})
    if source == "mevzuat":
        return _shape(
            p,
            {**src, "kanunNo": lambda v: isinstance(v, str) and bool(_KANUN_NO.match(v))},
            {"title": lambda v: _text(v, 1, 300), "tur": lambda v: _int(v, 1, 99),
             "tertip": lambda v: _int(v, 1, 9), "snapshotDate": _date, "rgDate": _date},
        ) and ("snapshotDate" in p or "rgDate" in p)
    return False


def _citations_extract(p: Any) -> bool:
    return (
        _shape(p, {"recordId": _uuid})
        or _shape(p, {"recordIds": _ids})
        or _shape(p, {"batchId": lambda v: _text(v, 1, 200), "recordIds": _ids, "poll": lambda v: _int(v, 0, 150)})
    )


def _notify_send(p: Any) -> bool:
    ok = _shape(
        p,
        {"type": lambda v: v in NOTIFICATION_TYPES, "userId": _uuid},
        {"subtype": lambda v: v in BILLING_NOTICE_KINDS, "refId": lambda v: _text(v, 0, 100),
         "channels": lambda v: isinstance(v, list) and all(c in NOTIFICATION_CHANNELS for c in v)},
    )
    return ok and ("subtype" not in p or p["type"] == "odeme")


_RECORD = lambda p: _shape(p, {"recordId": _uuid})  # noqa: E731
_EMPTY = lambda p: _shape(p, {})  # noqa: E731

PAYLOAD_CHECKS: Dict[JobType, Callable[[Any], bool]] = {
    JobType.INGEST_FETCH: _ingest_fetch,
    JobType.ANON_RUN: _RECORD,
    JobType.EMBED_CHUNKS: _RECORD,
    JobType.CITATIONS_EXTRACT: _citations_extract,
    JobType.RULES_EXTRACT: lambda p: _shape(p, {"userId": _uuid, "kind": lambda v: v in ("tez", "makale")}),
    JobType.BILLING_MONTHLY_GRANT: _EMPTY,
    JobType.BILLING_RECONCILE: lambda p: _shape(p, {}, {"day": _date}),
    JobType.NOTIFY_SEND: _notify_send,
    JobType.KALEMCIK_DAILY: _EMPTY,
    JobType.MEVZUAT_RG_DAILY: lambda p: _shape(p, {}, {"date": _date}),
    JobType.ACCOUNT_PURGE: lambda p: _shape(p, {"userId": _uuid}),
}


def payload_problem(job_type: JobType, payload: Any) -> Optional[str]:
    """None when the payload meets the contract, else "invalid_payload" or "no_schema" (never the content)."""
    check = PAYLOAD_CHECKS.get(job_type)
    if check is None:
        return "no_schema"
    try:
        return None if check(payload) else "invalid_payload"
    except Exception:  # noqa: BLE001 - a malformed payload must never crash the consumer
        return "invalid_payload"


def valid_payload(job_type: JobType, payload: Any) -> bool:
    return payload_problem(job_type, payload) is None


# --- Consumer ---------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class ClaimedJob:
    id: str
    type: JobType
    payload: Dict[str, Any]
    attempts: int
    max_attempts: int


class Cursor(Protocol):
    def execute(self, query: str, params: Optional[Dict[str, Any]] = None) -> Any: ...

    def fetchall(self) -> List[tuple]: ...


Handler = Callable[[ClaimedJob], Any]
Log = Callable[..., None]


def json_log(msg: str, **extra: Any) -> None:
    print(json.dumps({"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "svc": "worker-py", "msg": msg,
                      **extra}), flush=True)


def _returned(cur: Cursor) -> bool:
    """True when the last UPDATE ... RETURNING matched a row (the lock was still ours)."""
    try:
        return bool(cur.fetchall())
    except Exception:  # noqa: BLE001 - a driver without a result set: assume the row matched
        return True


class _LockHeartbeat:
    """Renews the lock of one job every `seconds` while its handler runs.

    It uses the consumer's cursor, which stays idle until the handler returns (handlers open their own
    connections); stop() joins the thread before the cursor is used again.
    """

    def __init__(self, cur: Cursor, job: ClaimedJob, worker: str, seconds: float, on_lost: Callable[[str], None],
                 log: Log):
        self.cur, self.job, self.worker, self.seconds = cur, job, worker, seconds
        self.on_lost, self.log = on_lost, log
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self._run, name=f"heartbeat-{job.id}", daemon=True)
        self.lost = False

    def __enter__(self) -> "_LockHeartbeat":
        if self.seconds > 0:
            self.thread.start()
        return self

    def __exit__(self, *exc: Any) -> None:
        self.stopped.set()
        if self.thread.is_alive():
            self.thread.join()

    def _run(self) -> None:
        while not self.stopped.wait(self.seconds):
            try:
                self.cur.execute(HEARTBEAT_JOB_SQL, {"id": self.job.id, "worker": self.worker})
                if not _returned(self.cur) and not self.lost:
                    self.lost = True
                    self.on_lost("heartbeat")
            except Exception as exc:  # noqa: BLE001 - class name only; the next beat tries again
                self.log("heartbeat failed", jobId=str(self.job.id), error=type(exc).__name__)


class JobConsumer:
    """Claims jobs with FOR UPDATE SKIP LOCKED and dispatches them to idempotent handlers."""

    def __init__(self, worker_id: str, handlers: Dict[JobType, Handler],
                 heartbeat_seconds: float = JOB_HEARTBEAT_SECONDS, log: Log = json_log):
        self.worker_id = worker_id
        self.handlers = handlers
        self.heartbeat_seconds = heartbeat_seconds
        self.log = log

    def channels(self) -> Iterable[str]:
        return [jobs_channel(t) for t in self.handlers]

    def _lost(self, job: ClaimedJob, step: str) -> None:
        self.log("lock lost", jobId=str(job.id), type=job.type.value, step=step)

    def run_once(self, cur: Cursor, job_type: JobType, limit: int = 5) -> int:
        handler = self.handlers.get(job_type)
        if handler is None:
            return 0
        cur.execute(CLAIM_JOBS_SQL, {"type": job_type.value, "worker": self.worker_id, "limit": limit})
        rows = cur.fetchall()
        for row in rows:
            job = ClaimedJob(id=row[0], type=JobType(row[1]), payload=row[2], attempts=row[3], max_attempts=row[4])
            self._run(cur, job, handler)
        return len(rows)

    def _run(self, cur: Cursor, job: ClaimedJob, handler: Handler) -> None:
        params = {"id": job.id, "worker": self.worker_id}
        problem = payload_problem(job.type, job.payload)
        if problem is not None:
            cur.execute(BURY_JOB_SQL, {**params, "error": INVALID_PAYLOAD_ERROR})
            self.log("job buried", jobId=str(job.id), type=job.type.value, reason=problem)
            if not _returned(cur):
                self._lost(job, "bury")
            return
        failure: Optional[BaseException] = None
        result: Any = None
        with _LockHeartbeat(cur, job, self.worker_id, self.heartbeat_seconds, lambda s: self._lost(job, s),
                            self.log):
            try:
                result = handler(job)
            except Exception as exc:  # noqa: BLE001 - error class only, no content
                failure = exc
        if failure is None:
            try:
                encoded = json.dumps(result)
            except (TypeError, ValueError) as exc:
                failure = exc
            else:
                cur.execute(COMPLETE_JOB_SQL, {**params, "result": encoded})
                if not _returned(cur):
                    self._lost(job, "complete")
                return
        cur.execute(FAIL_JOB_SQL, {**params, "error": type(failure).__name__})
        if not _returned(cur):
            self._lost(job, "fail")
