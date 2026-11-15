"""Fail closed without NER outside development. All text below is SYNTHETIC."""

from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Any, List

import pytest

from anonymizer.job import make_anon_run_handler
from anonymizer.ner import EnsembleBackend, NullBackend, has_model, ner_required
from anonymizer.pipeline import NER_UNAVAILABLE, anonymize
from anonymizer.spans import Span
from anonymizer.store import MemoryAnonStore, SqlAnonStore
from core.jobs import ClaimedJob, JobType

RID = "00000000-0000-4000-8000-0000000000b1"
TEXT = "Davacı Selin Akbulut, telefon 0532 111 22 33."
MASKED = "Davacı [Davacı], telefon [Telefon]."


class FakeNer:
    """Stands in for a loaded model: finds the given name."""

    def __init__(self, name: str = "fake@0000000", needle: str = "Selin Akbulut", score: float = 0.97):
        self.name = name
        self.needle = needle
        self.score = score

    def detect(self, text: str) -> List[Span]:
        i = text.find(self.needle)
        return [] if i < 0 else [Span(i, i + len(self.needle), "PERSON", f"ner:{self.name}", self.score)]


def _job(job_id: str = "j", record_id: str = RID) -> ClaimedJob:
    return ClaimedJob(job_id, JobType.ANON_RUN, {"recordId": record_id}, 1, 5)


@pytest.mark.parametrize(
    "value, required",
    [(None, False), ("", False), ("development", False), ("test", False), (" Development ", False),
     ("production", True), ("Production", True), ("staging", True), ("prod", True)],
)
def test_ner_required_follows_kazuist_env(value, required) -> None:
    env = {} if value is None else {"KAZUIST_ENV": value}
    assert ner_required(env) is required


def test_ner_required_reads_the_process_environment(monkeypatch) -> None:
    assert ner_required() is False
    monkeypatch.setenv("KAZUIST_ENV", "production")
    assert ner_required() is True


def test_has_model() -> None:
    assert not has_model(None) and not has_model(NullBackend())
    assert has_model(FakeNer())
    assert not has_model(EnsembleBackend([NullBackend(), NullBackend()]))
    assert has_model(EnsembleBackend([NullBackend(), FakeNer()]))

    class NamedNone:
        name = "none"

        def detect(self, text):
            return []

    assert not has_model(NamedNone())


def test_rule_layer_alone_is_never_publishable_when_ner_is_required() -> None:
    r = anonymize(TEXT, require_ner=True)
    assert r.blocked == NER_UNAVAILABLE and not r.review
    assert r.publishable is False
    assert r.masked_text == MASKED  # still masked; it is only held back
    row = r.review_queue_row("rec-1")
    assert row is not None and row["payload"]["blocked"] == NER_UNAVAILABLE and row["payload"]["items"] == []
    assert row["priority"] >= 40
    assert "Selin" not in json.dumps(row, ensure_ascii=False)


def test_a_model_lifts_the_block() -> None:
    r = anonymize(TEXT, require_ner=True, ner=FakeNer())
    assert r.blocked is None and r.publishable and r.review_queue_row("rec-1") is None
    assert r.anonymization_version.endswith("+ner.fake@0000000")
    # An extra backend counts as well (eval harness).
    assert anonymize(TEXT, require_ner=True, extra=[FakeNer()]).publishable


def test_pipeline_reads_kazuist_env_by_default(monkeypatch) -> None:
    assert anonymize(TEXT).publishable
    for value in ("production", "staging"):
        monkeypatch.setenv("KAZUIST_ENV", value)
        r = anonymize(TEXT)
        assert r.blocked == NER_UNAVAILABLE and not r.publishable
    monkeypatch.setenv("KAZUIST_ENV", "development")
    assert anonymize(TEXT).publishable


def test_job_in_production_without_ner_saves_nothing_servable(monkeypatch, capsys) -> None:
    monkeypatch.setenv("KAZUIST_ENV", "production")
    monkeypatch.delenv("KAZUIST_NER_BACKEND", raising=False)
    store = MemoryAnonStore({RID: (TEXT, None)})
    out = make_anon_run_handler(lambda: store)(_job())  # NER from the environment: none
    assert out["publishable"] is False and out["review"] == 0
    assert set(out) == {"recordId", "spans", "review", "publishable", "anonymizationVersion"}
    assert out["anonymizationVersion"].endswith("+ner.none")
    assert store.masked_text[RID] is None and store.embed_jobs == []
    assert len(store.review_rows) == 1 and store.review_rows[0]["payload"]["blocked"] == NER_UNAVAILABLE
    logged = capsys.readouterr().out
    assert NER_UNAVAILABLE in logged and RID in logged and "Selin" not in logged and "0532" not in logged


def test_job_in_production_with_a_model_publishes(monkeypatch) -> None:
    monkeypatch.setenv("KAZUIST_ENV", "production")
    store = MemoryAnonStore({RID: (TEXT, None)})
    out = make_anon_run_handler(lambda: store, ner=FakeNer())(_job())
    assert out["publishable"] is True
    assert store.masked_text[RID] == MASKED and store.embed_jobs == [RID] and store.review_rows == []


def test_rerun_without_ner_withdraws_an_earlier_published_text() -> None:
    store = MemoryAnonStore({RID: (TEXT, None)})
    make_anon_run_handler(lambda: store, require_ner=False)(_job("j1"))
    assert store.masked_text[RID] == MASKED
    out = make_anon_run_handler(lambda: store, require_ner=True)(_job("j2"))
    assert out["publishable"] is False and store.masked_text[RID] is None


class FakeCursor:
    def __init__(self) -> None:
        self.calls: List[tuple] = []
        self._rows: List[tuple] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *exc: Any) -> None:
        return None

    def execute(self, query: str, params: Any = None) -> None:
        self.calls.append((query.split()[0], params))
        self._rows = [(TEXT, None)] if query.startswith("SELECT") else []

    def fetchall(self) -> List[tuple]:
        return self._rows


def test_sql_store_writes_null_text_and_queues_no_embedding_when_blocked() -> None:
    cur = FakeCursor()
    out = make_anon_run_handler(lambda: SqlAnonStore(cur), require_ner=True)(_job())
    assert out["publishable"] is False
    record_update = next(p for v, p in cur.calls if v == "UPDATE" and p and "masked" in p)
    assert record_update["anonymized"] is False and record_update["masked"] is None
    assert not any(p and "dedupe_key" in p for _, p in cur.calls)
    review = [p for v, p in cur.calls if v == "INSERT" and p and "priority" in p]
    assert len(review) == 1 and json.loads(review[0]["payload"])["blocked"] == NER_UNAVAILABLE
    assert "Selin" not in json.dumps([c[1] for c in cur.calls if c[0] != "SELECT"], default=str)


def test_worker_entry_point_fails_closed_in_production(monkeypatch) -> None:
    """core.main builds the handler per job with the NER backend loaded at start up; with KAZUIST_ENV=production
    and no backend the record is held, not published."""
    from core.main import make_anon_handler

    monkeypatch.setenv("KAZUIST_ENV", "production")
    monkeypatch.delenv("KAZUIST_NER_BACKEND", raising=False)
    cur = FakeCursor()

    class Conn:
        def cursor(self) -> FakeCursor:
            return cur

    @contextmanager
    def connect():
        yield Conn()

    out = make_anon_handler(connect, NullBackend())(_job())
    assert out["publishable"] is False
    record_update = next(p for v, p in cur.calls if v == "UPDATE" and p and "masked" in p)
    assert record_update["anonymized"] is False and record_update["masked"] is None
