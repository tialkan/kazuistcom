from __future__ import annotations

from typing import Any, Dict, List, Optional

from nlp import reconcile


class Cur:
    def __init__(self, rows: int) -> None:
        self.calls: List[tuple] = []
        self.n = rows

    def execute(self, sql: str, params: Optional[Dict[str, Any]] = None) -> None:
        self.calls.append((sql, params))

    def fetchall(self) -> List[tuple]:
        return [("job",)] * self.n


def test_enqueue_missing_binds_model_and_limit_and_counts_rows() -> None:
    cur = Cur(3)
    assert reconcile.enqueue_missing(cur, "bge-m3@abcdef1", 50) == 3
    assert cur.calls == [(reconcile.ENQUEUE_MISSING_SQL, {"model": "bge-m3@abcdef1", "limit": 50})]
    cur = Cur(0)
    assert reconcile.enqueue_missing(cur, None, 0) == 0
    assert cur.calls[0][1] == {"model": None, "limit": 1}


def test_enqueue_uses_the_trigger_dedupe_key_and_skips_active_jobs() -> None:
    sql = reconcile.ENQUEUE_MISSING_SQL
    assert "'embed:' || r.id::text" in sql
    assert (
        "ON CONFLICT (type, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running')"
        in sql
    )
    assert "r.masked_text IS NOT NULL" in sql
    assert "status IN ('queued', 'running'))" in sql  # active jobs excluded before LIMIT


def test_main_without_database_url_exits_non_zero() -> None:
    assert reconcile.main([], env={}) == 1
