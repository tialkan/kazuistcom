from __future__ import annotations

from pathlib import Path

import yaml

from core.jobs import CLAIM_JOBS_SQL, JobConsumer, JobState, JobType, jobs_channel

SPEC = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "openapi.yaml"


def _enum(name: str) -> list:
    spec = yaml.safe_load(SPEC.read_text(encoding="utf-8"))
    return spec["components"]["schemas"][name]["enum"]


def test_job_types_match_contract() -> None:
    assert [t.value for t in JobType] == _enum("JobType")


def test_job_states_match_contract() -> None:
    assert [s.value for s in JobState] == _enum("JobState")


def test_channel_name() -> None:
    assert jobs_channel(JobType.BILLING_MONTHLY_GRANT) == "jobs_billing_monthly_grant"


def test_claim_uses_skip_locked() -> None:
    assert "FOR UPDATE SKIP LOCKED" in CLAIM_JOBS_SQL


class FakeCursor:
    def __init__(self) -> None:
        self.statements: list = []

    def execute(self, query, params=None):
        self.statements.append(query.strip().split()[0])

    def fetchall(self):
        return [("j1", "anon.run", {"recordId": "r1"}, 1, 5)]


def test_consumer_completes_and_fails() -> None:
    cur = FakeCursor()
    ok = JobConsumer("w", {JobType.ANON_RUN: lambda job: {"ok": True}})
    assert ok.run_once(cur, JobType.ANON_RUN) == 1
    assert cur.statements == ["WITH", "UPDATE"]

    def boom(job):
        raise ValueError("x")

    cur2 = FakeCursor()
    JobConsumer("w", {JobType.ANON_RUN: boom}).run_once(cur2, JobType.ANON_RUN)
    assert cur2.statements == ["WITH", "UPDATE"]
