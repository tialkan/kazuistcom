"""Scheduler to consumer, end to end against the job contract (open item of PR 105).

A fake jobs table stands in for PostgreSQL: scheduler.run_tick enqueues into it with the real ENQUEUE_ONCE_SQL,
the real JobConsumer claims the rows with the real CLAIM_JOBS_SQL and dispatches them to the real ingest.fetch
handler. The test proves that nothing the scheduler enqueues is buried as an invalid payload, and that every
follow-up job a discovery job queues is accepted by the contract again.
"""

from __future__ import annotations

import json
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from connectors import danistay, yargitay
from core import scheduler
from core.jobs import (
    BURY_JOB_SQL,
    CLAIM_JOBS_SQL,
    COMPLETE_JOB_SQL,
    ENQUEUE_ONCE_SQL,
    FAIL_JOB_SQL,
    HEARTBEAT_JOB_SQL,
    ClaimedJob,
    JobConsumer,
    JobType,
    payload_problem,
)
from core.pipeline import InMemoryRepository
from core.runtime import Runtime, make_handlers
from core.scheduler import KNOWN_JOB_KEYS_SQL
from core.sources import SourceRegistry
from helpers import ALL_ON, NO_ROBOTS, build_fetcher, fixture_bytes, ok

TR = timezone(timedelta(hours=3))
NIGHT = datetime(2026, 11, 16, 2, 30, tzinfo=TR)
JSON = "application/json"


class FakeJobsTable:
    """Just enough of the jobs table: once-per-key enqueue, claim, complete, fail and bury."""

    def __init__(self) -> None:
        self.rows: List[Dict[str, Any]] = []
        self._result: List[tuple] = []

    def __enter__(self) -> "FakeJobsTable":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def cursor(self) -> "FakeJobsTable":
        return self

    def execute(self, sql: str, params: Optional[dict] = None) -> None:
        p = params or {}
        self._result = []
        if sql == ENQUEUE_ONCE_SQL:
            if not any(r["type"] == p["type"] and r["dedupe_key"] == p["dedupe_key"] for r in self.rows):
                row = {
                    "id": f"job-{len(self.rows)}", "type": p["type"], "payload": json.loads(p["payload"]),
                    "dedupe_key": p["dedupe_key"], "status": "queued", "attempts": 0, "error": None,
                }  # fmt: skip
                self.rows.append(row)
                self._result = [(row["id"],)]
        elif sql == KNOWN_JOB_KEYS_SQL:
            keys = set(p["keys"])
            self._result = [(r["dedupe_key"],) for r in self.rows if r["dedupe_key"] in keys]
        elif sql == CLAIM_JOBS_SQL:
            for r in [r for r in self.rows if r["status"] == "queued" and r["type"] == p["type"]][: p["limit"]]:
                r["status"], r["attempts"] = "running", r["attempts"] + 1
                self._result.append((r["id"], r["type"], r["payload"], r["attempts"], 5))
        elif sql in (COMPLETE_JOB_SQL, FAIL_JOB_SQL, BURY_JOB_SQL, HEARTBEAT_JOB_SQL):
            row = next(r for r in self.rows if r["id"] == p["id"])
            if sql == COMPLETE_JOB_SQL:
                row["status"] = "done"
            elif sql == FAIL_JOB_SQL:
                row["status"], row["error"] = "queued", p["error"]
            elif sql == BURY_JOB_SQL:
                row["status"], row["error"] = "dead", p["error"]
            self._result = [(row["id"], row["status"])]

    def fetchall(self) -> List[tuple]:
        return self._result

    def fetchone(self) -> Optional[tuple]:
        return self._result[0] if self._result else None


def _handler(tmp_path: Path, clock, repo: InMemoryRepository):
    base_y, base_d = yargitay.BASE, danistay.BASE
    routes: Dict[str, object] = {
        f"{base_y}/robots.txt": NO_ROBOTS,
        f"{base_y}/aramadetaylist": ok(fixture_bytes("yargitay/liste-hgk-2024.json"), JSON),
        f"{base_d}/robots.txt": NO_ROBOTS,
        f"{base_d}/aramadetaylist": ok(fixture_bytes("danistay/liste-vddk-2024.json"), JSON),
    }
    fetcher, _ = build_fetcher(routes, tmp_path, clock)

    @contextmanager
    def provider():
        yield repo

    return make_handlers(Runtime(fetcher.registry, fetcher, provider))[JobType.INGEST_FETCH]


def test_everything_the_scheduler_enqueues_reaches_the_handler_and_none_is_buried(tmp_path: Path, clock) -> None:
    table = FakeJobsTable()
    registry = SourceRegistry.load(env=dict(ALL_ON))
    summary = scheduler.run_tick(lambda: table, registry, NIGHT)  # default plan: contract shapes only
    assert summary["enqueued"] == len(table.rows) > 0
    assert not [s for s in summary["skipped"] if s["reason"] == "contract_pending"]
    ingest_rows = [r for r in table.rows if r["type"] == "ingest.fetch"]
    sources = {r["payload"]["source"] for r in ingest_rows}
    assert sources == {"kvkk", "rekabet", "aym", "yargitay", "danistay", "eurlex"}
    assert all(payload_problem(JobType(r["type"]), r["payload"]) is None for r in table.rows)

    repo = InMemoryRepository()
    consumer = JobConsumer(
        "w1", {JobType.INGEST_FETCH: _handler(tmp_path, clock, repo)}, heartbeat_seconds=0, log=lambda *a, **k: None
    )
    claimed = consumer.run_once(table, JobType.INGEST_FETCH, limit=1000)
    assert claimed == len(ingest_rows)
    # Nothing was buried as invalid, and no handler refused a shape (BadJob or the unknown source error). The
    # other failures are the sources without a fixture here, which answer 404 offline.
    assert not [r for r in ingest_rows if r["status"] == "dead"]
    assert not [r for r in ingest_rows if r["error"] in ("BadJob", "ValueError")]
    court = [r for r in ingest_rows if r["payload"]["source"] in ("yargitay", "danistay")]
    assert any(r["status"] == "done" for r in court)  # the list jobs with a fixture ran to completion
    # a second tick in the same bucket adds only the next backfill step of each court (one unit-year per tick)
    before = len(table.rows)
    assert scheduler.run_tick(lambda: table, registry, NIGHT)["enqueued"] == 2
    assert all(r["dedupe_key"].endswith(":backfill") for r in table.rows[before:])


def test_follow_up_jobs_of_discovery_meet_the_contract(tmp_path: Path, clock) -> None:
    repo = InMemoryRepository()
    handler = _handler(tmp_path, clock, repo)
    for payload in (
        {"source": "yargitay", "unit": "Hukuk Genel Kurulu", "year": 2024, "page": 1},
        {"source": "danistay", "unit": "Vergi Dava Daireleri Kurulu", "year": 2024, "page": 1},
    ):
        handler(ClaimedJob("x", JobType.INGEST_FETCH, payload, 1, 5))
    assert repo.jobs  # document jobs and the next page
    for job in repo.jobs:
        assert payload_problem(JobType.INGEST_FETCH, job["payload"]) is None, job["payload"]


def test_cli_dry_run_plan_is_valid_without_assuming_the_contract(capsys) -> None:
    code = scheduler.main(["--dry-run", "--now", "2026-11-16T02:30:00+03:00"], env=dict(ALL_ON))
    out = json.loads(capsys.readouterr().out)
    assert code == 0 and out["dryRun"] is True
    assert out["planned"]["aym"] == 2 and out["planned"]["yargitay"] == 7 and out["planned"]["danistay"] == 7
    assert not [s for s in out["skipped"] if s["reason"] == "contract_pending"]
