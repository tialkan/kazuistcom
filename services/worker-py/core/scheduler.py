"""Collection scheduler (plan 6.1 "Tazelik", 6.2/3 night hours, 6.2/1 approval).

Every tick it works out which collection jobs are due and enqueues them into the jobs table (ENQUEUE_ONCE_SQL, ADR-0035:
one job per key, whatever its state, so a restart or a second scheduler never doubles a bucket). It enqueues
nothing for a source that is switched off, not approved (in production), stopped by the breaker or outside its
window; the reason is returned. --dry-run plans without touching the database.

Cadence per source (Istanbul time, UTC+3 without daylight saving):

  resmi-gazete  daily from 07:00        mevzuat.rg_daily for today's issue (it queues the mevzuat re-fetches)
  kvkk, rekabet weekly, 01:00-06:00     list job, page 1 (the list job queues the documents and the next page)
  aym           weekly, 01:00-06:00     list job per decision type
  yargitay,
  danistay      weekly, 01:00-06:00     list job per core unit for this and last year; older years are a backfill of
                                        one unit-year per tick (a once-only key per unit-year)
  eurlex        monthly, 01:00-06:00    one job per selected act
  mevzuat       no schedule of its own  (RG triggered)
  openalex,
  crossref      no schedule             (DOIs are queued by the citation pipeline)

Jobs whose payload shape the job contract (core/jobs.py payload_problem) does not accept yet are not enqueued
either; they are reported as contract_pending until the architect adds the shapes
(docs/istekler/veri-toplama-ingest-payloadlari.md). assume_contract=True plans as if they were accepted.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional, Set

from .errors import SourceDisabled
from .jobs import ENQUEUE_ONCE_SQL, JobType, payload_problem
from .sources import SourceRegistry

ISTANBUL = timezone(timedelta(hours=3))
NIGHT_HOURS = range(1, 6)  # 01:00 to 05:59
RG_FIRST_HOUR = 7
BACKFILL_PER_TICK = 1

KnownKeys = Callable[[List[str]], Set[str]]


@dataclass(frozen=True)
class PlannedJob:
    source: str
    job_type: JobType
    payload: Dict[str, Any]
    dedupe_key: str


@dataclass
class PlanResult:
    now: str
    planned: List[PlannedJob] = field(default_factory=list)
    skipped: List[Dict[str, str]] = field(default_factory=list)

    def summary(self) -> Dict[str, Any]:
        """Counts and reasons only; no payload."""
        by_source: Dict[str, int] = {}
        for p in self.planned:
            by_source[p.source] = by_source.get(p.source, 0) + 1
        return {"now": self.now, "planned": by_source, "skipped": self.skipped}


def _week(local: datetime) -> str:
    iso = local.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def _slug(value: str) -> str:
    from connectors.judicial import slug

    return slug(value)


def _candidates(source: str, local: datetime) -> List[PlannedJob]:
    """Jobs due in the current bucket for a source, before any gating. Pure."""
    week, year = _week(local), local.year
    ingest = JobType.INGEST_FETCH
    if source == "resmi-gazete":
        day = local.date().isoformat()
        return [PlannedJob(source, JobType.MEVZUAT_RG_DAILY, {"date": day}, f"sched:rg:{day}")]
    if source in ("kvkk", "rekabet"):
        return [PlannedJob(source, ingest, {"source": source, "page": 1}, f"sched:{source}:{week}")]
    if source == "aym":
        from connectors import aym

        return [
            PlannedJob(source, ingest, {"source": "aym", "kararTipi": t, "page": 1}, f"sched:aym:{t}:{week}")
            for t in (aym.BB, aym.ND)
        ]
    if source in ("yargitay", "danistay"):
        from connectors import danistay, yargitay

        module = yargitay if source == "yargitay" else danistay
        return [
            PlannedJob(
                source, ingest, {"source": source, "unit": unit, "year": y, "page": 1},
                f"sched:{source}:{_slug(unit)}:{y}:{week}",
            )
            for unit in module.UNITS
            for y in (year, year - 1)
        ]  # fmt: skip
    if source == "eurlex":
        from connectors.eurlex import SELECTED_ACTS

        month = f"{local.year}-{local.month:02d}"
        return [
            PlannedJob(source, ingest, {"source": "eurlex", "celex": c}, f"sched:eurlex:{c}:{month}")
            for c in sorted(SELECTED_ACTS)
        ]
    return []


def _backfill(source: str, local: datetime) -> List[PlannedJob]:
    """Older years of the court sources, one once-only job per unit-year."""
    if source not in ("yargitay", "danistay"):
        return []
    from connectors import danistay, yargitay

    module = yargitay if source == "yargitay" else danistay
    return [
        PlannedJob(
            source, JobType.INGEST_FETCH, {"source": source, "unit": unit, "year": y, "page": 1},
            f"sched:{source}:{_slug(unit)}:{y}:backfill",
        )
        for y in range(local.year - 2, module.FIRST_YEAR - 1, -1)
        for unit in module.UNITS
    ]  # fmt: skip


NO_SCHEDULE = {
    "mevzuat": "RG tetiklemeli: mevzuat.rg_daily kuyruğa alır",
    "openalex": "DOI kimliklerini atıf ağı hattı kuyruğa alır",
    "crossref": "DOI kimliklerini atıf ağı hattı kuyruğa alır",
}
SCHEDULED = ("resmi-gazete", "kvkk", "rekabet", "aym", "yargitay", "danistay", "eurlex")


class Scheduler:
    def __init__(
        self,
        registry: SourceRegistry,
        known_keys: Optional[KnownKeys] = None,
        assume_contract: bool = False,
        backfill_per_tick: int = BACKFILL_PER_TICK,
    ):
        self.registry = registry
        self.known_keys: KnownKeys = known_keys or (lambda keys: set())
        self.assume_contract = assume_contract
        self.backfill_per_tick = backfill_per_tick

    def _gate(self, source: str, local: datetime) -> Optional[str]:
        names = self.registry.names()
        if source not in names:
            return "source has no file in docs/kaynaklar"
        needs = [source] + (["mevzuat"] if source == "resmi-gazete" else [])
        for name in needs:
            try:
                self.registry.check_enabled(name)
            except SourceDisabled as exc:
                return f"{name}: {exc}"
        hour = local.hour
        if source == "resmi-gazete":
            return None if hour >= RG_FIRST_HOUR else f"before {RG_FIRST_HOUR:02d}:00 local (issue not out yet)"
        return None if hour in NIGHT_HOURS else "outside the 01:00-06:00 local night window"

    def plan(self, now: datetime) -> PlanResult:
        local = now.astimezone(ISTANBUL)
        result = PlanResult(now=local.isoformat(timespec="minutes"))
        for source, why in NO_SCHEDULE.items():
            result.skipped.append({"source": source, "reason": why})
        for source in SCHEDULED:
            reason = self._gate(source, local)
            if reason is not None:
                result.skipped.append({"source": source, "reason": reason})
                continue
            due = _candidates(source, local)
            back = _backfill(source, local)
            known = self.known_keys([j.dedupe_key for j in due + back])
            fresh = [j for j in due if j.dedupe_key not in known]
            if len(fresh) < len(due):
                n = len(due) - len(fresh)
                result.skipped.append({"source": source, "reason": f"{n} already queued in this bucket"})
            todo_back = [j for j in back if j.dedupe_key not in known][: self.backfill_per_tick]
            for job in fresh + todo_back:
                if not self.assume_contract and payload_problem(job.job_type, job.payload) is not None:
                    result.skipped.append({"source": source, "reason": "contract_pending"})
                    continue
                result.planned.append(job)
        deduped: List[Dict[str, str]] = []
        for item in result.skipped:  # one line per source and reason is enough
            if item not in deduped:
                deduped.append(item)
        result.skipped = deduped
        return result


# --- database side --------------------------------------------------------------------------------------
KNOWN_JOB_KEYS_SQL = """
SELECT dedupe_key FROM jobs WHERE type = ANY(%(types)s::job_type[]) AND dedupe_key = ANY(%(keys)s)
"""


def pg_known_keys(cur: Any) -> KnownKeys:
    def known(keys: List[str]) -> Set[str]:
        if not keys:
            return set()
        types = [JobType.INGEST_FETCH.value, JobType.MEVZUAT_RG_DAILY.value]
        cur.execute(KNOWN_JOB_KEYS_SQL, {"types": types, "keys": keys})
        return {row[0] for row in cur.fetchall()}

    return known


def enqueue_plan(cur: Any, planned: Iterable[PlannedJob]) -> int:
    """Enqueue once per key; returns how many rows were new."""
    created = 0
    for job in planned:
        params = {
            "type": job.job_type.value,
            "payload": json.dumps(job.payload),
            "dedupe_key": job.dedupe_key,
            "run_after": None,
        }
        cur.execute(ENQUEUE_ONCE_SQL, params)
        if cur.fetchone() is not None:
            created += 1
    return created


Log = Callable[..., None]


def run_tick(
    connect: Callable[[], Any],
    registry: SourceRegistry,
    now: datetime,
    dry_run: bool = False,
    assume_contract: bool = False,
    log: Optional[Log] = None,
) -> Dict[str, Any]:
    with connect() as conn:
        with conn.cursor() as cur:
            plan = Scheduler(registry, pg_known_keys(cur), assume_contract).plan(now)
            enqueued = 0 if dry_run else enqueue_plan(cur, plan.planned)
    summary = {**plan.summary(), "enqueued": enqueued, "dryRun": dry_run}
    if log:
        log("scheduler tick", **summary)
    return summary


def start_scheduler_thread(
    env: Mapping[str, str], registry: SourceRegistry, connect: Callable[[], Any], stop: threading.Event, log: Log
) -> Optional[threading.Thread]:
    """KAZUIST_SCHEDULER=on starts the loop; anything else leaves collection to manual runs. The tick period is
    KAZUIST_SCHEDULE_TICK_SECONDS (default 600). KAZUIST_SCHEDULER_DRY_RUN=on only logs the plan."""
    if env.get("KAZUIST_SCHEDULER", "off").strip().lower() not in ("on", "1", "true"):
        return None
    dry = env.get("KAZUIST_SCHEDULER_DRY_RUN", "off").strip().lower() in ("on", "1", "true")
    period = max(60.0, float(env.get("KAZUIST_SCHEDULE_TICK_SECONDS", "600")))

    def loop() -> None:
        while not stop.is_set():
            try:
                run_tick(connect, registry, datetime.now(timezone.utc), dry_run=dry, log=log)
            except Exception as exc:  # noqa: BLE001 - database down or similar; class name only
                log("scheduler tick failed", error=type(exc).__name__)
            stop.wait(period)

    thread = threading.Thread(target=loop, name="scheduler", daemon=True)
    thread.start()
    return thread


# --- command line ---------------------------------------------------------------------------------------
def main(argv: Optional[List[str]] = None, env: Optional[Mapping[str, str]] = None) -> int:
    """python -m core.scheduler --dry-run [--now ISO] [--assume-contract]: print the plan, touch nothing."""
    parser = argparse.ArgumentParser(prog="core.scheduler")
    parser.add_argument("--dry-run", action="store_true", help="plan only; enqueue nothing")
    parser.add_argument("--now", help="ISO timestamp with offset, default now (UTC)")
    parser.add_argument("--assume-contract", action="store_true", help="plan shapes the job contract lacks")
    args = parser.parse_args(argv)
    env = env if env is not None else os.environ
    now = datetime.fromisoformat(args.now) if args.now else datetime.now(timezone.utc)
    if now.tzinfo is None:
        parser.error("--now needs a UTC offset, for example 2026-11-16T02:30:00+03:00")
    registry = SourceRegistry.load(env=env)
    url = env.get("DATABASE_URL")
    if not url:  # no database: nothing to enqueue into and no queued keys to compare with
        plan = Scheduler(registry, assume_contract=args.assume_contract).plan(now)
        print(json.dumps({**plan.summary(), "dryRun": True, "database": False}, ensure_ascii=False, indent=1))
        return 0
    import psycopg

    summary = run_tick(
        lambda: psycopg.connect(url), registry, now, dry_run=args.dry_run, assume_contract=args.assume_contract
    )
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
