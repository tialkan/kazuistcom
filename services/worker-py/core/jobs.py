"""Job queue contract, Python side (plan Ek C.3).

Mirrors packages/db/src/jobs.ts and packages/contracts JobType/JobState. Python reads and writes with SQL
only and never changes the schema. Every handler must be idempotent; payloads carry ids, never personal data.
"""

from __future__ import annotations

from dataclasses import dataclass
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


class JobState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    DEAD = "dead"


def jobs_channel(job_type: JobType) -> str:
    """LISTEN channel for a job type: jobs_<type with dots replaced by underscores>."""
    return "jobs_" + job_type.value.replace(".", "_")


# Same statements as packages/db/src/jobs.ts, with psycopg placeholders.
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
WHERE id = %(id)s AND status = 'running'
"""

FAIL_JOB_SQL = """
UPDATE jobs SET
  status = CASE WHEN attempts >= max_attempts THEN 'dead'::job_status ELSE 'queued'::job_status END,
  error = %(error)s,
  run_after = now() + make_interval(secs => least(3600, 15 * power(2, attempts))),
  locked_by = NULL, locked_at = NULL, updated_at = now()
WHERE id = %(id)s AND status = 'running'
"""


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


class JobConsumer:
    """Claims jobs with FOR UPDATE SKIP LOCKED and dispatches them to idempotent handlers."""

    def __init__(self, worker_id: str, handlers: Dict[JobType, Handler]):
        self.worker_id = worker_id
        self.handlers = handlers

    def channels(self) -> Iterable[str]:
        return [jobs_channel(t) for t in self.handlers]

    def run_once(self, cur: Cursor, job_type: JobType, limit: int = 5) -> int:
        import json

        handler = self.handlers.get(job_type)
        if handler is None:
            return 0
        cur.execute(CLAIM_JOBS_SQL, {"type": job_type.value, "worker": self.worker_id, "limit": limit})
        rows = cur.fetchall()
        for row in rows:
            job = ClaimedJob(id=row[0], type=JobType(row[1]), payload=row[2], attempts=row[3], max_attempts=row[4])
            try:
                result = handler(job)
                cur.execute(COMPLETE_JOB_SQL, {"id": job.id, "result": json.dumps(result)})
            except Exception as exc:  # noqa: BLE001 - error class only, no content
                cur.execute(FAIL_JOB_SQL, {"id": job.id, "error": type(exc).__name__})
        return len(rows)
