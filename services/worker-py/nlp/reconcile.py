"""Reconciliation for embed.chunks (ADR-0026): python -m nlp.reconcile [--limit N].

The records trigger does not enqueue a second job while one is queued or running, so a masked_text change
that lands during a running job, or a job that went dead, can leave a servable record without chunks. This
enqueues embed.chunks (dedupe key embed:<id>) for servable records that

1. have no chunks, or
2. have chunks whose embedding_model is not the configured model, when a model is configured (chunks written
   without vectors before the model was installed, or by an earlier model),

skipping records that already have an active job. One run enqueues at most `limit` records, oldest change
first; run it periodically (a timer or cron, see docs/istekler/casuist-p9-arama-dizini.md). Prints one JSON
line with the count; no text, no ids.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Mapping, Optional, Sequence

from .embedder import embedder_from_env, json_log

ENQUEUE_MISSING_SQL = """
INSERT INTO jobs (type, payload, dedupe_key)
SELECT 'embed.chunks'::job_type, jsonb_build_object('recordId', r.id), 'embed:' || r.id::text
FROM records r
WHERE r.masked_text IS NOT NULL
  AND (
    NOT EXISTS (SELECT 1 FROM chunks c WHERE c.record_id = r.id)
    OR (%(model)s::text IS NOT NULL AND EXISTS (
      SELECT 1 FROM chunks c WHERE c.record_id = r.id AND c.embedding_model IS DISTINCT FROM %(model)s::text))
  )
  AND NOT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.type = 'embed.chunks' AND j.dedupe_key = 'embed:' || r.id::text
      AND j.status IN ('queued', 'running'))
ORDER BY r.updated_at, r.id
LIMIT %(limit)s
ON CONFLICT (type, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running') DO NOTHING
RETURNING id
"""


def enqueue_missing(cur: Any, model: Optional[str], limit: int = 1000) -> int:
    cur.execute(ENQUEUE_MISSING_SQL, {"model": model, "limit": max(1, limit)})
    return len(cur.fetchall())


def main(argv: Optional[Sequence[str]] = None, env: Optional[Mapping[str, str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m nlp.reconcile")
    parser.add_argument("--limit", type=int, default=1000)
    args = parser.parse_args(argv)
    env = env if env is not None else os.environ
    url = env.get("DATABASE_URL")
    if not url:
        json_log("DATABASE_URL is not set")
        return 1
    model = embedder_from_env(env).model
    import psycopg

    try:
        with psycopg.connect(url) as conn:
            with conn.cursor() as cur:
                n = enqueue_missing(cur, model, args.limit)
    except Exception as exc:  # noqa: BLE001 - class name only
        json_log("embed reconcile failed", error=type(exc).__name__)
        return 1
    json_log("embed reconcile", enqueued=n, model=model)
    return 0


if __name__ == "__main__":
    sys.exit(main())
