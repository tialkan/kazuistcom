"""Scheduler: due jobs per source, gated by switch, approval, breaker, night window and the job contract."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

import pytest

from connectors.eurlex import SELECTED_ACTS
from core import scheduler
from core.jobs import ENQUEUE_ONCE_SQL, JobType
from core.scheduler import PlannedJob, Scheduler
from core.sources import SourceRegistry
from helpers import ALL_ON

TR = timezone(timedelta(hours=3))
NIGHT = datetime(2026, 11, 16, 2, 30, tzinfo=TR)  # Monday, ISO week 47
MORNING = datetime(2026, 11, 16, 8, 0, tzinfo=TR)
NOON = datetime(2026, 11, 16, 12, 0, tzinfo=TR)


def _sched(env: Optional[dict] = None, **kw: Any) -> Scheduler:
    return Scheduler(SourceRegistry.load(env=env if env is not None else dict(ALL_ON)), **kw)


def _by_source(planned: List[PlannedJob]) -> dict:
    out: dict = {}
    for p in planned:
        out.setdefault(p.source, []).append(p)
    return out


def test_night_plan_with_contract_assumed() -> None:
    result = _sched(assume_contract=True).plan(NIGHT)
    got = _by_source(result.planned)
    assert len(got["kvkk"]) == 1 and len(got["rekabet"]) == 1 and len(got["aym"]) == 2
    assert len(got["yargitay"]) == 3 * 2 + 1  # three units, this and last year, plus one backfill
    assert len(got["danistay"]) == 3 * 2 + 1
    assert len(got["eurlex"]) == len(SELECTED_ACTS)
    assert "resmi-gazete" not in got  # 02:30: the issue is not out
    keys = [p.dedupe_key for p in result.planned]
    assert len(keys) == len(set(keys))
    assert "sched:aym:BireyselBasvuru:2026-W47" in keys and "sched:kvkk:2026-W47" in keys
    assert "sched:eurlex:" + sorted(SELECTED_ACTS)[0] + ":2026-11" in keys
    reasons = {(s["source"], s["reason"]) for s in result.skipped}
    assert ("resmi-gazete", "before 07:00 local (issue not out yet)") in reasons
    assert any(s == "mevzuat" for s, _ in reasons) and any(s == "openalex" for s, _ in reasons)


def test_every_night_payload_shape_is_in_the_job_contract() -> None:
    # Contract v1.6 (ADR-0038) accepts the list and document shapes; the default plan, which respects the job
    # contract, now equals the plan that assumes it, and nothing waits as contract_pending.
    result = _sched().plan(NIGHT)
    assumed = _sched(assume_contract=True).plan(NIGHT)
    assert [p.dedupe_key for p in result.planned] == [p.dedupe_key for p in assumed.planned]
    assert set(_by_source(result.planned)) == {"kvkk", "rekabet", "aym", "yargitay", "danistay", "eurlex"}
    assert not [s for s in result.skipped if s["reason"] == "contract_pending"]


def test_rg_daily_runs_from_seven_and_needs_mevzuat_too() -> None:
    morning = _sched().plan(MORNING)
    rg = _by_source(morning.planned)["resmi-gazete"]
    assert rg[0].job_type is JobType.MEVZUAT_RG_DAILY and rg[0].payload == {"date": "2026-11-16"}
    assert rg[0].dedupe_key == "sched:rg:2026-11-16"
    only_rg = _sched({"KAZUIST_SOURCE_RESMI_GAZETE": "on"}).plan(MORNING)
    assert not only_rg.planned
    assert {"source": "resmi-gazete", "reason": "mevzuat: source switch is off"} in only_rg.skipped


def test_bulk_sources_stay_out_of_daytime() -> None:
    result = _sched(assume_contract=True).plan(NOON)
    assert {p.source for p in result.planned} == {"resmi-gazete"}
    assert {"source": "aym", "reason": "outside the 01:00-06:00 local night window"} in result.skipped


def test_nothing_runs_without_switch_or_without_approval_in_production() -> None:
    off = _sched({}, assume_contract=True).plan(NIGHT)
    assert off.planned == []
    assert {"source": "aym", "reason": "aym: source switch is off"} in off.skipped
    prod = _sched({**ALL_ON, "KAZUIST_ENV": "production"}, assume_contract=True).plan(NIGHT)
    assert prod.planned == []  # every source is tarik_onayi: bekliyor
    assert {"source": "yargitay", "reason": "yargitay: source is not approved for production"} in prod.skipped


def test_breaker_or_challenge_stop_blocks_planning() -> None:
    reg = SourceRegistry.load(env=dict(ALL_ON))
    reg.trip("yargitay", "challenge: DisplayCaptcha")
    result = Scheduler(reg, assume_contract=True).plan(NIGHT)
    assert "yargitay" not in _by_source(result.planned)
    assert {"source": "yargitay", "reason": "yargitay: source stopped by breaker"} in result.skipped


def test_buckets_already_queued_are_not_planned_again() -> None:
    first = _sched(assume_contract=True).plan(NIGHT)
    queued = {p.dedupe_key for p in first.planned}
    again = _sched(known_keys=lambda keys: {k for k in keys if k in queued}, assume_contract=True).plan(NIGHT)
    # weekly and monthly buckets are gone; the backfill moves on to the next unit-year
    weekly = [p for p in again.planned if not p.dedupe_key.endswith(":backfill")]
    assert weekly == []
    back = [p for p in again.planned if p.dedupe_key.endswith(":backfill")]
    assert len(back) == 2 and not ({p.dedupe_key for p in back} & queued)
    assert any("already queued" in s["reason"] for s in again.skipped)


def test_backfill_walks_back_one_unit_year_per_tick() -> None:
    done: set = set()
    seen = []
    for _ in range(4):
        s = _sched(known_keys=lambda keys: {k for k in keys if k in done}, assume_contract=True)
        back = [p for p in s.plan(NIGHT).planned if p.source == "yargitay" and p.dedupe_key.endswith(":backfill")]
        assert len(back) == 1
        seen.append((back[0].payload["unit"], back[0].payload["year"]))
        done.add(back[0].dedupe_key)
    assert [y for _, y in seen] == [2024, 2024, 2024, 2023]  # newest old year first, every unit
    assert len({u for u, _ in seen[:3]}) == 3


def test_payloads_carry_identifiers_only() -> None:
    allowed = {"source", "page", "kararTipi", "unit", "year", "celex", "date"}
    for p in _sched(assume_contract=True).plan(NIGHT).planned + _sched().plan(MORNING).planned:
        assert set(p.payload) <= allowed
        assert all(isinstance(v, (str, int)) for v in p.payload.values())


class _Cur:
    def __init__(self, existing: set) -> None:
        self.existing, self.executed, self._row = existing, [], None

    def execute(self, sql: str, params: dict) -> None:
        self.executed.append((sql, params))
        key = params["dedupe_key"]
        self._row = None if key in self.existing else (key,)
        self.existing.add(key)

    def fetchone(self):  # noqa: ANN201
        return self._row


def test_enqueue_plan_is_once_per_key() -> None:
    jobs = _sched(assume_contract=True).plan(NIGHT).planned[:3]
    cur = _Cur({jobs[0].dedupe_key})
    assert scheduler.enqueue_plan(cur, jobs) == 2
    assert all(sql == ENQUEUE_ONCE_SQL for sql, _ in cur.executed)
    assert json.loads(cur.executed[0][1]["payload"]) == jobs[0].payload
    assert scheduler.enqueue_plan(cur, jobs) == 0  # a second tick adds nothing


def test_cli_dry_run_prints_the_plan_without_a_database(capsys: pytest.CaptureFixture) -> None:
    code = scheduler.main(
        ["--dry-run", "--now", "2026-11-16T02:30:00+03:00", "--assume-contract"],
        env={**ALL_ON, "KAZUIST_ENV": "development"},
    )
    out = json.loads(capsys.readouterr().out)
    assert code == 0 and out["dryRun"] is True and out["database"] is False
    assert out["planned"]["aym"] == 2 and "payload" not in json.dumps(out)


class _Conn:
    """Stand-in for a psycopg connection: counts statements, returns no rows."""

    def __init__(self) -> None:
        self.statements: List[str] = []

    def __enter__(self) -> "_Conn":
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    def cursor(self) -> "_Conn":
        return self

    def execute(self, sql: str, params: Optional[dict] = None) -> None:
        self.statements.append(sql)

    def fetchall(self) -> list:
        return []

    def fetchone(self):  # noqa: ANN201
        return None


def test_run_tick_dry_run_writes_nothing() -> None:
    conn = _Conn()
    reg = SourceRegistry.load(env=dict(ALL_ON))
    summary = scheduler.run_tick(lambda: conn, reg, NIGHT, dry_run=True, assume_contract=True)
    assert summary["dryRun"] is True and summary["enqueued"] == 0 and summary["planned"]["aym"] == 2
    assert not any("INSERT" in s for s in conn.statements)  # only the read of already queued keys
    live = scheduler.run_tick(lambda: conn, reg, NIGHT, dry_run=False, assume_contract=True)
    assert any("INSERT INTO jobs" in s for s in conn.statements) and live["enqueued"] == 0  # fake: no row returned


def test_scheduler_thread_runs_a_tick_when_switched_on() -> None:
    import threading
    import time

    conn = _Conn()
    stop = threading.Event()
    logs: list = []
    env = {"KAZUIST_SCHEDULER": "on", "KAZUIST_SCHEDULER_DRY_RUN": "on"}
    thread = scheduler.start_scheduler_thread(
        env, SourceRegistry.load(env=dict(ALL_ON)), lambda: conn, stop, lambda msg, **kw: logs.append((msg, kw))
    )
    assert thread is not None
    for _ in range(100):
        if logs:
            break
        time.sleep(0.02)
    stop.set()
    thread.join(timeout=2)
    assert logs and logs[0][0] == "scheduler tick" and logs[0][1]["dryRun"] is True
    assert not thread.is_alive()


def test_scheduler_thread_is_off_by_default() -> None:
    import threading

    stop = threading.Event()
    assert scheduler.start_scheduler_thread({}, SourceRegistry.load(env={}), lambda: None, stop, lambda *a, **k: None) is None
