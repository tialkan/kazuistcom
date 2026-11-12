from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from contextlib import contextmanager
from typing import Any, List

import pytest

from core.jobs import JobConsumer, JobType
from core.main import Heartbeat, WorkerLoop, build_handlers, main, make_anon_handler, start_health_server


class FakeCursor:
    def __init__(self, conn: "FakeConn") -> None:
        self.conn = conn
        self._rows: List[tuple] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *exc: Any) -> None:
        return None

    def execute(self, query: str, params: Any = None) -> None:
        word = query.strip().split()[0]
        self.conn.statements.append(word)
        if "SKIP LOCKED" in query:
            self._rows = self.conn.queue[:1]
            self.conn.queue = self.conn.queue[1:]
        elif query.strip().startswith("UPDATE jobs") and "RETURNING" in query:
            # complete, fail and bury match the worker id; this fake worker always still holds the lock.
            self._rows = [("j",)]
        elif "FROM records" in query:
            self._rows = [("Davaci Ahmet Yilmaz tarafindan acilan dava.", None)]
        else:
            self._rows = []

    def fetchall(self) -> List[tuple]:
        return self._rows


class FakeConn:
    def __init__(self, queue: List[tuple] | None = None) -> None:
        self.queue = list(queue or [])
        self.statements: List[str] = []

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)


def test_loop_drains_jobs_releases_stale_locks_and_stops_after_the_job_in_hand() -> None:
    stop = threading.Event()
    seen: List[str] = []

    def handler(job):
        seen.append(job.id)
        if len(seen) == 2:
            stop.set()  # SIGTERM arrives while the second job runs
        return {"ok": True}

    # Payloads meet the contract (ADR-0035); an invalid one would be buried without reaching the handler.
    p = {"recordId": "00000000-0000-4000-8000-000000000001"}
    conn = FakeConn([("j1", "anon.run", p, 1, 5), ("j2", "anon.run", p, 1, 5), ("j3", "anon.run", p, 1, 5)])
    waits: List[float] = []
    logs: List[str] = []
    loop = WorkerLoop(JobConsumer("w", {JobType.ANON_RUN: handler}), conn, waits.append, stop,
                      Heartbeat(60), batch=1, log=lambda msg, **_: logs.append(msg))
    loop.run()
    assert seen == ["j1", "j2"]
    assert conn.queue == [("j3", "anon.run", p, 1, 5)]  # never claimed
    assert conn.statements[0] == "UPDATE"  # stale lock release first
    assert waits == []
    assert logs == ["started", "stopped"]


def test_loop_survives_a_failing_round_and_waits() -> None:
    stop = threading.Event()

    class Broken:
        def cursor(self):
            raise ConnectionError("down")

    logs: List[tuple] = []

    def wait(seconds: float) -> None:
        stop.set()

    loop = WorkerLoop(JobConsumer("w", {JobType.ANON_RUN: lambda j: {}}), Broken(), wait, stop, Heartbeat(60),
                      log=lambda msg, **kw: logs.append((msg, kw)))
    loop.run()
    assert ("round failed", {"error": "ConnectionError"}) in logs


def test_health_probe_reflects_the_heartbeat() -> None:
    now = [0.0]
    hb = Heartbeat(max_age=10, clock=lambda: now[0])
    server = start_health_server(hb, "127.0.0.1", 0)
    url = f"http://127.0.0.1:{server.server_address[1]}/healthz"
    try:
        with urllib.request.urlopen(url) as r:
            assert r.status == 200
            assert json.loads(r.read()) == {"status": "ok"}
        now[0] = 11.0
        with pytest.raises(urllib.error.HTTPError) as err:
            urllib.request.urlopen(url)
        assert err.value.code == 503
        with pytest.raises(urllib.error.HTTPError) as missing:
            urllib.request.urlopen(url.replace("/healthz", "/other"))
        assert missing.value.code == 404
    finally:
        server.shutdown()


def test_registers_ingest_rg_and_anon_handlers() -> None:
    handlers = build_handlers(rt=object(), connect=lambda: None)
    assert set(handlers) == {JobType.INGEST_FETCH, JobType.MEVZUAT_RG_DAILY, JobType.ANON_RUN, JobType.EMBED_CHUNKS}


def test_anon_run_commits_or_rolls_back_as_one_transaction() -> None:
    outcomes: List[str] = []
    conn = FakeConn()

    @contextmanager
    def connect():
        try:
            yield conn
            outcomes.append("commit")
        except Exception:
            outcomes.append("rollback")
            raise

    handler = make_anon_handler(connect)
    job_type = JobType.ANON_RUN
    from core.jobs import ClaimedJob

    result = handler(ClaimedJob("j", job_type, {"recordId": "00000000-0000-4000-8000-000000000001"}, 1, 5))
    assert result["recordId"] == "00000000-0000-4000-8000-000000000001"
    # Counts and versions only; the record text never reaches jobs.result.
    assert set(result) == {"recordId", "spans", "review", "publishable", "anonymizationVersion"}
    with pytest.raises(Exception):
        handler(ClaimedJob("j", job_type, {}, 1, 5))
    assert outcomes == ["commit", "rollback"]


def test_main_without_database_url_exits_non_zero() -> None:
    assert main({}) == 1
