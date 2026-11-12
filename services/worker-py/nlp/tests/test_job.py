"""embed.chunks handler: masked text only, idempotent replace, stale text detection, vectorless fallback.
All texts are SYNTHETIC; RAW_SENTINEL stands for the unmasked records.text and must never reach a chunk, the
embedder, jobs.result or a log line."""

from __future__ import annotations

import json
import math
import re
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Sequence

import pytest

from core.jobs import ClaimedJob, JobConsumer, JobType
from nlp import reconcile, store
from nlp.chunk import chunk_text
from nlp.embedder import EMBED_DIMENSIONS, NullEmbedder
from nlp.job import InvalidPayload, make_embed_chunks_handler, make_embed_handler, record_id_of
from nlp.store import MemoryEmbedStore, SqlEmbedStore, StaleMaskedText, text_digest, vector_literal

RID = "00000000-0000-4000-8000-0000000000e1"
RAW_SENTINEL = "Ayşe Örnekçi"
RAW = f"Davacı {RAW_SENTINEL} tarafından açılan dava. " * 40
MASKED = "\n".join(
    [
        f"Davacı [Davacı] tarafından açılan dava, paragraf {i}. Mahkeme talebi inceledi ve karar verdi."
        for i in range(40)
    ]
)


def job(payload: Any, job_type: JobType = JobType.EMBED_CHUNKS) -> ClaimedJob:
    return ClaimedJob("j1", job_type, payload, 1, 5)


class FakeEmbedder:
    def __init__(
        self,
        model: str = "test-embed@0000000",
        dims: int = EMBED_DIMENSIONS,
        fail: Optional[Exception] = None,
        value: float = 0.5,
    ):
        self.model = model
        self.dimensions = dims
        self.fail = fail
        self.value = value
        self.seen: List[str] = []

    def embed(self, texts: Sequence[str], kind: str) -> List[List[float]]:
        assert kind == "passage"
        self.seen.extend(texts)
        if self.fail:
            raise self.fail
        return [[self.value] * self.dimensions for _ in texts]


class Logs:
    def __init__(self) -> None:
        self.lines: List[tuple] = []

    def __call__(self, msg: str, **extra: Any) -> None:
        self.lines.append((msg, extra))

    def text(self) -> str:
        return json.dumps(self.lines, ensure_ascii=False)


def memory(masked: Optional[str] = MASKED) -> MemoryEmbedStore:
    return MemoryEmbedStore({RID: {"text": RAW, "masked_text": masked}})


def test_writes_chunks_from_masked_text_only() -> None:
    s, emb, logs = memory(), FakeEmbedder(), Logs()
    result = make_embed_chunks_handler(s, emb, logs)(job({"recordId": RID}))
    rows = s.chunks[RID]
    expected = chunk_text(MASKED)
    assert len(rows) == len(expected) > 1
    assert [r["seq"] for r in rows] == list(range(len(rows)))
    for r, c in zip(rows, expected, strict=True):
        assert r["text"] == c.text == MASKED[r["char_start"] : r["char_end"]]
        assert RAW_SENTINEL not in r["text"]
        assert r["embedding_model"] == emb.model and len(r["embedding"]) == EMBED_DIMENSIONS
    assert all(RAW_SENTINEL not in t for t in emb.seen)
    assert result == {"recordId": RID, "chunks": len(rows), "vectors": len(rows), "embeddingModel": emb.model}
    assert RAW_SENTINEL not in json.dumps(result) and "Davacı" not in json.dumps(result, ensure_ascii=False)
    assert logs.lines == []


def test_repeated_job_replaces_and_a_changed_text_is_rechunked() -> None:
    s = memory()
    handle = make_embed_chunks_handler(s, NullEmbedder(), Logs())
    first = handle(job({"recordId": RID}))
    rows = list(s.chunks[RID])
    assert handle(job({"recordId": RID})) == first
    assert s.chunks[RID] == rows  # same rows, no duplicates
    s.set_masked_text(RID, "Yeni maskeli metin. [Davalı] itiraz etti.")
    assert RID not in s.chunks  # the records trigger deletes them
    assert handle(job({"recordId": RID}))["chunks"] == 1
    assert s.chunks[RID][0]["text"] == "Yeni maskeli metin. [Davalı] itiraz etti."


def test_text_changed_while_embedding_fails_the_job_and_the_retry_reads_the_new_text() -> None:
    s = memory()
    s.before_write = lambda rid: s.set_masked_text(rid, "Sonradan değişen maskeli metin.")
    handle = make_embed_chunks_handler(s, NullEmbedder(), Logs())
    with pytest.raises(StaleMaskedText):
        handle(job({"recordId": RID}))
    assert RID not in s.chunks
    s.before_write = None
    handle(job({"recordId": RID}))
    assert [r["text"] for r in s.chunks[RID]] == ["Sonradan değişen maskeli metin."]


def test_not_servable_records_are_skipped_without_writing() -> None:
    skipped = {"recordId": RID, "chunks": 0, "vectors": 0, "embeddingModel": None, "skipped": "not_servable"}
    s = memory(None)  # editor queue: masked_text NULL
    assert make_embed_chunks_handler(s, NullEmbedder(), Logs())(job({"recordId": RID})) == skipped
    assert s.chunks == {}
    missing = MemoryEmbedStore({})
    assert make_embed_chunks_handler(missing, NullEmbedder(), Logs())(job({"recordId": RID})) == skipped
    s = memory()
    s.before_write = lambda rid: s.set_masked_text(rid, None)  # sent back to the editor while embedding
    assert make_embed_chunks_handler(s, NullEmbedder(), Logs())(job({"recordId": RID})) == skipped
    assert RID not in s.chunks


@pytest.mark.parametrize(
    "payload", [None, {}, {"recordId": 5}, {"recordId": "not-a-uuid"}, {"recordId": RID, "text": "x"}, [RID]]
)
def test_payload_is_a_strict_uuid_object(payload: Any) -> None:
    with pytest.raises(InvalidPayload):
        record_id_of(job(payload))


def test_wrong_job_type_is_rejected() -> None:
    with pytest.raises(InvalidPayload):
        record_id_of(job({"recordId": RID}, JobType.ANON_RUN))


def test_without_a_model_chunks_have_no_vectors() -> None:
    s = memory()
    result = make_embed_chunks_handler(s, NullEmbedder("model_missing"), Logs())(job({"recordId": RID}))
    assert result["vectors"] == 0 and result["embeddingModel"] is None and result["chunks"] > 0
    assert all(r["embedding"] is None and r["embedding_model"] is None for r in s.chunks[RID])


@pytest.mark.parametrize(
    "emb",
    [FakeEmbedder(fail=MemoryError("boom " + MASKED)), FakeEmbedder(dims=384), FakeEmbedder(value=math.nan)],
)
def test_embedding_failure_degrades_to_text_only_chunks_and_logs_no_text(emb: FakeEmbedder) -> None:
    s, logs = memory(), Logs()
    result = make_embed_chunks_handler(s, emb, logs)(job({"recordId": RID}))
    assert result["chunks"] > 0 and result["vectors"] == 0 and result["embeddingModel"] is None
    assert all(r["embedding"] is None for r in s.chunks[RID])
    assert [m for m, _ in logs.lines] == ["embedding failed, chunks are written without vectors"]
    assert "Davacı" not in logs.text() and "boom" not in logs.text()


# --- SQL store over a fake psycopg connection -------------------------------------------------------------


class FakeCursor:
    def __init__(self, db: "FakeDb") -> None:
        self.db = db
        self.rows: List[tuple] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *exc: Any) -> None:
        return None

    def execute(self, sql: str, params: Optional[Dict[str, Any]] = None) -> None:
        self.db.log.append((sql, params))
        if sql == store.READ_SQL:
            self.rows = [(self.db.masked, text_digest(self.db.masked))] if self.db.masked is not None else []
        elif sql == store.LOCK_SQL:
            self.rows = [(text_digest(self.db.masked) if self.db.masked is not None else None,)]
        else:
            self.rows = []

    def executemany(self, sql: str, seq: Sequence[Dict[str, Any]]) -> None:
        for p in seq:
            self.db.log.append((sql, p))

    def fetchall(self) -> List[tuple]:
        return self.rows


class FakeDb:
    def __init__(self, masked: Optional[str]) -> None:
        self.masked = masked
        self.log: List[tuple] = []
        self.outcomes: List[str] = []

    @contextmanager
    def connect(self):
        self.outcomes.append("begin")
        try:
            yield self
            self.outcomes.append("commit")
        except Exception:
            self.outcomes.append("rollback")
            raise

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)


def test_sql_store_locks_compares_deletes_and_inserts_in_one_transaction() -> None:
    db = FakeDb(MASKED)
    emb = FakeEmbedder()
    result = make_embed_handler(db.connect, emb, Logs())(job({"recordId": RID}))
    statements = [sql for sql, _ in db.log]
    n = result["chunks"]
    assert (
        statements == [store.READ_SQL, store.LOCK_SQL, store.DELETE_CHUNKS_SQL] + [store.INSERT_CHUNK_SQL] * n
    )
    assert db.outcomes == ["begin", "commit", "begin", "commit"]  # read, then write; embedding in between
    inserts = [p for sql, p in db.log if sql == store.INSERT_CHUNK_SQL]
    assert inserts[0]["embedding"].startswith("[0.5,0.5,") and inserts[0]["model"] == emb.model
    assert all(RAW_SENTINEL not in p["text"] for p in inserts)


def test_sql_store_rolls_back_on_a_changed_digest_and_writes_nothing() -> None:
    db = FakeDb(MASKED)
    s = SqlEmbedStore(db.connect)
    with pytest.raises(StaleMaskedText):
        s.replace(RID, text_digest("eski metin"), chunk_text(MASKED), [None] * len(chunk_text(MASKED)), None)
    assert [sql for sql, _ in db.log] == [store.LOCK_SQL]
    assert db.outcomes == ["begin", "rollback"]
    db = FakeDb(None)
    assert SqlEmbedStore(db.connect).replace(RID, "x", [], [], None) is False
    assert [sql for sql, _ in db.log] == [store.LOCK_SQL]


def test_vectorless_rows_bind_null_embedding_and_model() -> None:
    db = FakeDb("Tek paragraf. Kısa metin.")
    make_embed_handler(db.connect, NullEmbedder(), Logs())(job({"recordId": RID}))
    [insert] = [p for sql, p in db.log if sql == store.INSERT_CHUNK_SQL]
    assert insert["embedding"] is None and insert["model"] is None and insert["section"] is None
    assert (insert["start"], insert["end"], insert["seq"]) == (0, 25, 0)


def test_vector_literal() -> None:
    assert vector_literal(None) is None
    assert vector_literal([0.1, -0.25, 1.0]) == "[0.1,-0.25,1]"


def test_no_statement_reads_the_raw_text_column() -> None:
    """records.text is the unmasked text; only masked_text may be read (ADR-0023)."""
    for sql in (store.READ_SQL, store.LOCK_SQL, reconcile.ENQUEUE_MISSING_SQL):
        rest = sql.replace("masked_text", "").replace("::text", "")
        assert not re.search(r"\btext\b", rest), sql
    assert "FROM records" in store.READ_SQL and "masked_text IS NOT NULL" in store.READ_SQL
    assert "FOR SHARE" in store.LOCK_SQL


def test_consumer_completes_with_counts_or_fails_with_the_class_name() -> None:
    class QueueCursor(FakeCursor):
        def execute(self, sql: str, params: Optional[Dict[str, Any]] = None) -> None:
            if "SKIP LOCKED" in sql:
                self.db.log.append(("claim", params))
                self.rows = [("j1", "embed.chunks", {"recordId": RID}, 1, 5)]
                return
            super().execute(sql, params)

    class QueueDb(FakeDb):
        def cursor(self) -> FakeCursor:
            return QueueCursor(self)

    db = QueueDb(MASKED)
    consumer = JobConsumer(
        "w", {JobType.EMBED_CHUNKS: make_embed_handler(db.connect, NullEmbedder(), Logs())}
    )
    with db.cursor() as cur:
        assert consumer.run_once(cur, JobType.EMBED_CHUNKS, 1) == 1
    done = [
        p
        for sql, p in db.log
        if isinstance(sql, str) and sql.strip().startswith("UPDATE jobs SET status = 'done'")
    ]
    assert json.loads(done[0]["result"])["chunks"] > 0

    stale = QueueDb(MASKED)

    def flip(_rid: str) -> None:
        stale.masked = "değişti"

    s = SqlEmbedStore(stale.connect)
    original = s.replace

    def replace(*args: Any) -> bool:
        flip(RID)
        return original(*args)

    s.replace = replace  # type: ignore[method-assign]
    consumer = JobConsumer("w", {JobType.EMBED_CHUNKS: make_embed_chunks_handler(s, NullEmbedder(), Logs())})
    with stale.cursor() as cur:
        consumer.run_once(cur, JobType.EMBED_CHUNKS, 1)
    failed = [p for sql, p in stale.log if isinstance(sql, str) and "attempts >= max_attempts" in sql]
    assert failed[0]["error"] == "StaleMaskedText"
