from __future__ import annotations

import json
import re
import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest
import yaml

from core import jobs
from core.jobs import (
    CLAIM_JOBS_SQL,
    PAYLOAD_CHECKS,
    PAYLOAD_EXEMPT,
    JobConsumer,
    JobState,
    JobType,
    jobs_channel,
    payload_problem,
    valid_payload,
)

ROOT = Path(__file__).resolve().parents[3]
SPEC = ROOT / "packages" / "contracts" / "openapi.yaml"
DB_JOBS = ROOT / "packages" / "db" / "src" / "jobs.ts"
CONTRACT_JOBS = ROOT / "packages" / "contracts" / "src" / "jobs.ts"
CONTRACT_BILLING = ROOT / "packages" / "contracts" / "src" / "billing.ts"
FIXTURES = ROOT / "packages" / "contracts" / "test" / "fixtures" / "job-payloads.json"


def _enum(name: str) -> list:
    spec = yaml.safe_load(SPEC.read_text(encoding="utf-8"))
    return spec["components"]["schemas"][name]["enum"]


def _ts_list(path: Path, name: str) -> List[str]:
    src = path.read_text(encoding="utf-8")
    m = re.search(rf"export const {name} = \[(.*?)\]", src, re.S)
    assert m, name
    return re.findall(r"'([^']+)'", m.group(1))


def test_job_types_match_contract() -> None:
    assert [t.value for t in JobType] == _enum("JobType")


def test_job_states_match_contract() -> None:
    assert [s.value for s in JobState] == _enum("JobState")


def test_channel_name() -> None:
    assert jobs_channel(JobType.BILLING_MONTHLY_GRANT) == "jobs_billing_monthly_grant"


def test_claim_uses_skip_locked() -> None:
    assert "FOR UPDATE SKIP LOCKED" in CLAIM_JOBS_SQL


# packages/db/src/jobs.ts statement -> (Python constant, names of $1, $2, ...).
PAIRS = {
    "claimJobsSql": ("CLAIM_JOBS_SQL", ["type", "worker", "limit"]),
    "completeJobSql": ("COMPLETE_JOB_SQL", ["id", "result", "worker"]),
    "failJobSql": ("FAIL_JOB_SQL", ["id", "error", "worker"]),
    "buryJobSql": ("BURY_JOB_SQL", ["id", "error", "worker"]),
    "heartbeatJobSql": ("HEARTBEAT_JOB_SQL", ["id", "worker"]),
    "releaseStaleJobsSql": ("RELEASE_STALE_JOBS_SQL", ["seconds"]),
    "enqueueJobSql": ("ENQUEUE_JOB_SQL", ["type", "payload", "dedupe_key", "run_after"]),
    "enqueueOnceSql": ("ENQUEUE_ONCE_SQL", ["type", "payload", "dedupe_key", "run_after"]),
}


def _norm(sql: str) -> str:
    return " ".join(sql.split())


@pytest.mark.parametrize("ts_name", sorted(PAIRS))
def test_statements_mirror_packages_db(ts_name: str) -> None:
    src = DB_JOBS.read_text(encoding="utf-8")
    m = re.search(rf"export const {ts_name} = `(.*?)`;", src, re.S)
    assert m, ts_name
    py_name, names = PAIRS[ts_name]
    ts_sql = re.sub(r"\$(\d+)", lambda g: f"%({names[int(g.group(1)) - 1]})s", m.group(1))
    assert _norm(ts_sql) == _norm(getattr(jobs, py_name))


def test_constants_mirror_packages_db() -> None:
    src = DB_JOBS.read_text(encoding="utf-8")
    assert f"JOB_STALE_SECONDS = {jobs.JOB_STALE_SECONDS};" in src
    assert "JOB_HEARTBEAT_SECONDS = JOB_STALE_SECONDS / 3;" in src
    assert f"INVALID_PAYLOAD_ERROR = '{jobs.INVALID_PAYLOAD_ERROR}';" in src
    assert f"STALE_LOCK_ERROR = '{jobs.STALE_LOCK_ERROR}';" in src


def test_payload_vocabularies_match_contract() -> None:
    assert sorted(jobs.NOTIFICATION_TYPES) == sorted(_enum("NotificationType"))
    assert sorted(jobs.BILLING_NOTICE_KINDS) == sorted(_ts_list(CONTRACT_BILLING, "billingNoticeKinds"))
    assert sorted(jobs.NOTIFICATION_CHANNELS) == sorted(_ts_list(CONTRACT_JOBS, "notificationChannels"))
    assert sorted(t.value for t in PAYLOAD_EXEMPT) == sorted(_ts_list(CONTRACT_JOBS, "jobPayloadExempt"))
    assert sorted(jobs.AYM_DECISION_TYPES) == sorted(_ts_list(CONTRACT_JOBS, "aymDecisionTypes"))
    assert sorted(jobs.COURT_SOURCES) == sorted(_ts_list(CONTRACT_JOBS, "courtSources"))
    m = re.search(r"export const INGEST_MAX_PAGE = ([0-9_]+);", CONTRACT_JOBS.read_text(encoding="utf-8"))
    assert m and int(m.group(1).replace("_", "")) == jobs.INGEST_MAX_PAGE


def test_every_type_has_a_check_or_is_exempt() -> None:
    assert set(PAYLOAD_CHECKS) | set(PAYLOAD_EXEMPT) == set(JobType)
    assert not set(PAYLOAD_CHECKS) & set(PAYLOAD_EXEMPT)
    for t in PAYLOAD_EXEMPT:
        assert payload_problem(t, {}) == "no_schema"


def _fixtures() -> List[tuple]:
    data = json.loads(FIXTURES.read_text(encoding="utf-8"))
    return [(k, v) for k, v in data.items() if not k.startswith("_")]


def test_fixture_covers_every_checked_type() -> None:
    assert sorted(k for k, _ in _fixtures()) == sorted(t.value for t in PAYLOAD_CHECKS)


@pytest.mark.parametrize("type_name,cases", _fixtures())
def test_payload_checks_agree_with_zod_fixtures(type_name: str, cases: Dict[str, list]) -> None:
    t = JobType(type_name)
    for p in cases["valid"]:
        assert valid_payload(t, p), p
    for p in cases["invalid"]:
        assert payload_problem(t, p) == "invalid_payload", p


def test_python_only_edge_cases() -> None:
    rid = "00000000-0000-4000-8000-000000000001"
    assert not valid_payload(JobType.ANON_RUN, {"recordId": rid + "\n"})
    assert not valid_payload(JobType.MEVZUAT_RG_DAILY, {"date": "2026-11-12\n"})
    assert not valid_payload(JobType.INGEST_FETCH, {"source": "mevzuat", "kanunNo": "6698\n", "rgDate": "2026-11-12"})
    assert not valid_payload(JobType.INGEST_FETCH, {"source": "mevzuat", "kanunNo": "6698", "rgDate": "2026-11-12",
                                                    "tur": True})
    assert valid_payload(JobType.INGEST_FETCH, {"source": "mevzuat", "kanunNo": "6698", "rgDate": "2026-11-12",
                                                "tur": 1.0})
    assert not valid_payload(JobType.ANON_RUN, "not a dict")
    # v1.6 (ADR-0038): Python's \d and $ are wider than JavaScript's; the checks use [0-9] and \Z.
    guid = "817f0b47-acf1-0404-3232-c313b5441fd4"
    assert valid_payload(JobType.INGEST_FETCH, {"source": "aym", "kararTipi": "NormDenetimi", "id": guid})
    assert not valid_payload(JobType.INGEST_FETCH, {"source": "aym", "kararTipi": "NormDenetimi", "id": guid + "\n"})
    assert valid_payload(JobType.INGEST_FETCH, {"source": "kvkk", "page": 2.0})
    assert not valid_payload(JobType.INGEST_FETCH, {"source": "kvkk", "page": True})
    assert not valid_payload(JobType.INGEST_FETCH, {"source": ["kvkk"], "page": 1})
    doc = {"source": "yargitay", "id": "1104187600", "unit": "Hukuk Genel Kurulu", "esas": "2024/660",
           "karar": "2024/812", "date": "2024-10-02"}
    assert valid_payload(JobType.INGEST_FETCH, doc)
    assert not valid_payload(JobType.INGEST_FETCH, {**doc, "esas": "\u0662\u0660\u0662\u0664/660"})
    assert not valid_payload(JobType.INGEST_FETCH, {**doc, "id": "\u0661\u0662"})
    assert not valid_payload(JobType.INGEST_FETCH, {**doc, "karar": "2024/812\n"})


class FakeCursor:
    """Records statements; UPDATE ... RETURNING answers a row only while `owner` holds the lock."""

    def __init__(self, payload: Optional[Dict[str, Any]] = None, owner: str = "w") -> None:
        self.payload = payload if payload is not None else {"recordId": "00000000-0000-4000-8000-000000000001"}
        self.owner = owner
        self.calls: List[tuple] = []
        self._rows: List[tuple] = []
        self.lock = threading.Lock()

    def execute(self, query: str, params: Optional[Dict[str, Any]] = None) -> None:
        with self.lock:
            self.calls.append((query.strip().split()[0], query, params or {}))
            if "SKIP LOCKED" in query:
                self._rows = [("j1", "anon.run", self.payload, 1, 5)]
            elif "RETURNING" in query:
                self._rows = [("j1",)] if (params or {}).get("worker") == self.owner else []
            else:
                self._rows = []

    def fetchall(self) -> List[tuple]:
        return self._rows

    def kinds(self) -> List[str]:
        out = []
        for _, q, _p in self.calls:
            if "SKIP LOCKED" in q:
                out.append("claim")
            elif "status = 'done'" in q:
                out.append("complete")
            elif "attempts >= max_attempts" in q:
                out.append("fail")
            elif "status = 'dead'" in q:
                out.append("bury")
            elif "locked_at = now()" in q:
                out.append("heartbeat")
        return out


def test_consumer_completes_and_fails_with_the_worker_id() -> None:
    cur = FakeCursor()
    logs: List[tuple] = []
    ok = JobConsumer("w", {JobType.ANON_RUN: lambda job: {"ok": True}}, log=lambda m, **kw: logs.append((m, kw)))
    assert ok.run_once(cur, JobType.ANON_RUN) == 1
    assert cur.kinds() == ["claim", "complete"]
    assert cur.calls[1][2] == {"id": "j1", "worker": "w", "result": '{"ok": true}'}

    def boom(job):
        raise ValueError("secret text")

    cur2 = FakeCursor()
    JobConsumer("w", {JobType.ANON_RUN: boom}, log=lambda m, **kw: logs.append((m, kw))).run_once(cur2, JobType.ANON_RUN)
    assert cur2.kinds() == ["claim", "fail"]
    assert cur2.calls[1][2] == {"id": "j1", "worker": "w", "error": "ValueError"}
    assert logs == []


def test_consumer_buries_an_invalid_payload_without_running_or_logging_it() -> None:
    cur = FakeCursor({"recordId": "Ahmet Yilmaz"})
    ran: List[Any] = []
    logs: List[tuple] = []
    JobConsumer("w", {JobType.ANON_RUN: ran.append}, log=lambda m, **kw: logs.append((m, kw))).run_once(
        cur, JobType.ANON_RUN
    )
    assert ran == []
    assert cur.kinds() == ["claim", "bury"]
    assert cur.calls[1][2]["error"] == "invalid payload"
    assert logs == [("job buried", {"jobId": "j1", "type": "anon.run", "reason": "invalid_payload"})]
    assert "Ahmet" not in json.dumps(logs)


def test_consumer_reports_a_lost_lock_and_leaves_the_job() -> None:
    cur = FakeCursor(owner="other-worker")
    logs: List[tuple] = []
    JobConsumer("w", {JobType.ANON_RUN: lambda job: {}}, log=lambda m, **kw: logs.append((m, kw))).run_once(
        cur, JobType.ANON_RUN
    )
    assert cur.kinds() == ["claim", "complete"]
    assert logs == [("lock lost", {"jobId": "j1", "type": "anon.run", "step": "complete"})]


def test_consumer_fails_a_result_that_is_not_json() -> None:
    cur = FakeCursor()
    JobConsumer("w", {JobType.ANON_RUN: lambda job: {"x": object()}}, log=lambda *a, **k: None).run_once(
        cur, JobType.ANON_RUN
    )
    assert cur.kinds() == ["claim", "fail"]
    assert cur.calls[1][2]["error"] == "TypeError"


def test_heartbeat_renews_the_lock_while_the_handler_runs() -> None:
    cur = FakeCursor()

    def slow(job):
        time.sleep(0.12)
        return {}

    JobConsumer("w", {JobType.ANON_RUN: slow}, heartbeat_seconds=0.03, log=lambda *a, **k: None).run_once(
        cur, JobType.ANON_RUN
    )
    kinds = cur.kinds()
    assert kinds[0] == "claim" and kinds[-1] == "complete"
    assert kinds.count("heartbeat") >= 2
    beat = next(p for _, q, p in cur.calls if "locked_at = now()" in q and "SKIP" not in q)
    assert beat == {"id": "j1", "worker": "w"}
    n = len(cur.calls)
    time.sleep(0.1)
    assert len(cur.calls) == n  # the thread stopped with the handler


def test_heartbeat_reports_a_lost_lock_once() -> None:
    cur = FakeCursor(owner="other-worker")
    logs: List[tuple] = []

    def slow(job):
        time.sleep(0.12)
        return {}

    JobConsumer("w", {JobType.ANON_RUN: slow}, heartbeat_seconds=0.03,
                log=lambda m, **kw: logs.append((m, kw.get("step")))).run_once(cur, JobType.ANON_RUN)
    assert logs.count(("lock lost", "heartbeat")) == 1
    assert ("lock lost", "complete") in logs
