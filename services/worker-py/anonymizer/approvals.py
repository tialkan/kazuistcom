"""Queues anon.run for records whose anonymization item an editor approved but which are still unpublished.

The admin panel records the decision only (apps/web/src/server/auth/admin.ts: queues without a side effect
there "only record the decision, their module owners apply it from review_queue"). anon.run applies it
(store.py, job.py): it publishes when the latest decided item of the same anonymizationVersion is an "onay"
listing every review item of the run. This sweep supplies the run. It selects records where

- an unblocked anonymization item was approved ("onay") for the record's current anonymization_version,
- masked_text is still NULL and no anonymization item of the record is open,
- no later "ret" or "duzelt" of that version cancels the approval, and
- no anon.run of the record failed or died after the decision (a failing record is not queued again),

and queues anon.run with the dedupe key core/pipeline.py uses (anon:<recordId>); a queued or running run of
the record absorbs the insert. Ids only: no text is read or written.

Use: python -m anonymizer.approvals (DATABASE_URL), once or from a periodic task; prints {"queued": n}.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, List, Mapping, Optional

QUEUE_APPROVED_SQL = """
INSERT INTO jobs (type, payload, dedupe_key)
SELECT DISTINCT 'anon.run'::job_type, jsonb_build_object('recordId', r.id::text), 'anon:' || r.id::text
FROM review_queue q
JOIN records r ON r.id = q.subject_id
WHERE q.queue = 'anonymization' AND q.subject_type = 'record' AND q.decision = 'onay'
  AND NOT (q.payload ? 'blocked')
  AND q.payload->>'anonymizationVersion' = r.anonymization_version
  AND r.masked_text IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM review_queue o
    WHERE o.queue = 'anonymization' AND o.subject_type = 'record' AND o.subject_id = r.id
      AND o.decision IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM review_queue l
    WHERE l.queue = 'anonymization' AND l.subject_type = 'record' AND l.subject_id = r.id
      AND l.decision IN ('ret', 'duzelt') AND l.decided_at > q.decided_at
      AND l.payload->>'anonymizationVersion' = r.anonymization_version)
  AND NOT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.type = 'anon.run'::job_type AND j.dedupe_key = 'anon:' || r.id::text
      AND j.status IN ('failed', 'dead') AND j.updated_at > q.decided_at)
ON CONFLICT (type, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running') DO NOTHING
RETURNING payload->>'recordId'
"""


def queue_approved(cur: Any) -> List[str]:
    """Run the sweep in the caller's transaction; returns the record ids that got an anon.run job."""
    cur.execute(QUEUE_APPROVED_SQL)
    return [str(row[0]) for row in cur.fetchall()]


def main(env: Optional[Mapping[str, str]] = None) -> int:
    env = os.environ if env is None else env
    url = env.get("DATABASE_URL")
    if not url:
        print(json.dumps({"error": "DATABASE_URL is not set"}), file=sys.stderr)
        return 2
    import psycopg  # type: ignore

    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            queued = queue_approved(cur)
    print(json.dumps({"queued": len(queued)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
