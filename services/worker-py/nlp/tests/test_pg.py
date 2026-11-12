"""embed.chunks against a real PostgreSQL with the packages/db migrations applied (records trigger of 0004,
chunks.tsv, halfvec(1024)). Runs only when KAZUIST_TEST_DATABASE_URL points at such a throw away database;
skipped in CI, which has no PostgreSQL service for worker-py. All texts are SYNTHETIC."""

from __future__ import annotations

import os
import uuid
from typing import Any, List, Optional, Sequence

import pytest

from core.jobs import ClaimedJob, JobConsumer, JobType
from nlp.chunk import chunk_text
from nlp.embedder import EMBED_DIMENSIONS, NullEmbedder
from nlp.job import make_embed_chunks_handler
from nlp.reconcile import enqueue_missing
from nlp.store import SqlEmbedStore, StaleMaskedText

URL = os.environ.get("KAZUIST_TEST_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(not URL, reason="KAZUIST_TEST_DATABASE_URL not set")

RAW_SENTINEL = "Zeynep Sentinelova"
MASKED = "\n".join(
    f"Paragraf {i}. Davacı [Davacı] kişisel verilerin silinmesini talep etti ve Kurul başvuruyu inceledi."
    for i in range(30)
)


def connect() -> Any:
    import psycopg

    return psycopg.connect(URL)


def q(sql: str, params: Optional[dict] = None) -> List[tuple]:
    import psycopg

    with psycopg.connect(URL, autocommit=True) as conn:
        cur = conn.execute(sql, params)
        return cur.fetchall() if cur.description else []


def insert_record(masked: Optional[str]) -> str:
    rid = str(uuid.uuid4())
    q(
        """INSERT INTO records (id, type, title, authority_class, license_basis, source_url, source_key,
                                fetched_at,
                              text, masked_text)
         VALUES (%(id)s, 'karar', 'Sentetik karar', 'emsal', 'test', 'https://example.org', %(key)s, now(),
                 %(raw)s, %(masked)s)""",
        {"id": rid, "key": f"test:{rid}", "raw": f"Davacı {RAW_SENTINEL} başvurdu. " * 30, "masked": masked},
    )
    return rid


def chunk_rows(rid: str) -> List[tuple]:
    return q(
        """SELECT seq, text, char_start, char_end, tsv IS NOT NULL, embedding IS NOT NULL, embedding_model
                FROM chunks WHERE record_id = %(id)s ORDER BY seq""",
        {"id": rid},
    )


class Fixed:
    model = "test-embed@0000000"
    dimensions = EMBED_DIMENSIONS

    def embed(self, texts: Sequence[str], kind: str) -> List[List[float]]:
        return [[1.0 / EMBED_DIMENSIONS**0.5] * EMBED_DIMENSIONS for _ in texts]


def done_job(rid: str) -> None:
    q(
        "UPDATE jobs SET status = 'done' WHERE dedupe_key = %(k)s AND status IN ('queued', 'running')",
        {"k": f"embed:{rid}"},
    )


def test_trigger_enqueues_and_the_consumer_writes_searchable_chunks() -> None:
    rid = insert_record(MASKED)
    assert q(
        "SELECT count(*) FROM jobs WHERE type = 'embed.chunks' AND dedupe_key = %(k)s AND status = 'queued'",
        {"k": f"embed:{rid}"},
    ) == [(1,)]
    handler = make_embed_chunks_handler(SqlEmbedStore(connect), Fixed(), lambda *a, **k: None)
    import psycopg

    with psycopg.connect(URL, autocommit=True) as conn:
        # Claim exactly this record's job: park the others, run the real consumer, restore.
        conn.execute(
            "UPDATE jobs SET run_after = now() + interval '1 day' WHERE type = 'embed.chunks' "
            "AND status = 'queued' AND dedupe_key <> %(k)s",
            {"k": f"embed:{rid}"},
        )
        with conn.cursor() as cur:
            assert (
                JobConsumer("t", {JobType.EMBED_CHUNKS: handler}).run_once(cur, JobType.EMBED_CHUNKS, 1) == 1
            )
        conn.execute("UPDATE jobs SET run_after = now() WHERE type = 'embed.chunks' AND status = 'queued'")
    [(status, result)] = q("SELECT status, result FROM jobs WHERE dedupe_key = %(k)s", {"k": f"embed:{rid}"})
    expected = chunk_text(MASKED)
    assert status == "done" and result == {
        "recordId": rid,
        "chunks": len(expected),
        "vectors": len(expected),
        "embeddingModel": "test-embed@0000000",
    }
    rows = chunk_rows(rid)
    assert [(r[0], r[1], r[2], r[3]) for r in rows] == [
        (c.seq, c.text, c.char_start, c.char_end) for c in expected
    ]
    assert all(r[4] and r[5] and r[6] == "test-embed@0000000" for r in rows)
    assert not any(RAW_SENTINEL in r[1] for r in rows)
    # Full text leg (packages/casuist sql.ts) finds the record through the generated tsvector.
    hits = q(
        """SELECT DISTINCT ch.record_id::text FROM chunks ch
                WHERE ch.tsv @@ to_tsquery('turkish', 'silinmesini & Kurul') AND ch.record_id = %(id)s""",
        {"id": rid},
    )
    assert hits == [(rid,)]
    # Vector leg: the cosine distance query runs on halfvec.
    [(d,)] = q(
        """SELECT min(embedding <=> %(v)s::halfvec) FROM chunks WHERE record_id = %(id)s""",
        {"v": "[" + ",".join(["1"] * EMBED_DIMENSIONS) + "]", "id": rid},
    )
    assert d < 0.01


def test_repeat_replaces_and_vectorless_rows_are_null() -> None:
    rid = insert_record(MASKED)
    store = SqlEmbedStore(connect)
    handler = make_embed_chunks_handler(store, Fixed(), lambda *a, **k: None)
    handler_job = ClaimedJob("j", JobType.EMBED_CHUNKS, {"recordId": rid}, 1, 5)
    handler(handler_job)
    ids1 = q("SELECT id FROM chunks WHERE record_id = %(id)s ORDER BY seq", {"id": rid})
    handler(handler_job)
    ids2 = q("SELECT id FROM chunks WHERE record_id = %(id)s ORDER BY seq", {"id": rid})
    assert len(ids1) == len(ids2) == len(chunk_text(MASKED)) and set(ids1).isdisjoint(ids2)
    make_embed_chunks_handler(store, NullEmbedder(), lambda *a, **k: None)(handler_job)
    assert all(not r[5] and r[6] is None for r in chunk_rows(rid))


def test_changed_text_while_embedding_fails_then_the_retry_writes_the_new_text() -> None:
    rid = insert_record(MASKED)
    real = SqlEmbedStore(connect)

    class Racing:
        def read(self, record_id: str) -> Any:
            got = real.read(record_id)
            q(
                "UPDATE records SET masked_text = %(t)s WHERE id = %(id)s",
                {"id": record_id, "t": "Yeni maskeli metin. [Davalı] itiraz etti."},
            )
            return got

        def replace(self, *args: Any) -> bool:
            return real.replace(*args)

    handler_job = ClaimedJob("j", JobType.EMBED_CHUNKS, {"recordId": rid}, 1, 5)
    with pytest.raises(StaleMaskedText):
        make_embed_chunks_handler(Racing(), NullEmbedder(), lambda *a, **k: None)(handler_job)
    assert chunk_rows(rid) == []
    make_embed_chunks_handler(real, NullEmbedder(), lambda *a, **k: None)(handler_job)
    assert [r[1] for r in chunk_rows(rid)] == ["Yeni maskeli metin. [Davalı] itiraz etti."]
    # Sent back to the editor: the trigger deletes the chunks and the job has nothing to write.
    q("UPDATE records SET masked_text = NULL WHERE id = %(id)s", {"id": rid})
    assert chunk_rows(rid) == []
    res = make_embed_chunks_handler(real, NullEmbedder(), lambda *a, **k: None)(handler_job)
    assert res["skipped"] == "not_servable" and chunk_rows(rid) == []


def test_reconcile_enqueues_records_without_chunks_or_with_another_model() -> None:
    import psycopg

    a = insert_record(MASKED)  # trigger job queued, no chunks yet
    b = insert_record("Tek paragraf maskeli metin.")
    handler_job = ClaimedJob("j", JobType.EMBED_CHUNKS, {"recordId": b}, 1, 5)
    make_embed_chunks_handler(SqlEmbedStore(connect), NullEmbedder(), lambda *a, **k: None)(handler_job)
    done_job(a)
    done_job(b)
    q(
        "UPDATE records SET updated_at = now() - interval '10 years' WHERE id IN (%(a)s, %(b)s)",
        {"a": a, "b": b},
    )

    def active(rid: str) -> int:
        return q(
            "SELECT count(*) FROM jobs WHERE dedupe_key = %(k)s AND status = 'queued'", {"k": f"embed:{rid}"}
        )[0][0]

    with psycopg.connect(URL, autocommit=True) as conn, conn.cursor() as cur:
        enqueue_missing(cur, None, 100000)
        assert (active(a), active(b)) == (1, 0)  # a has no chunks; b has text only chunks and no model is set
        enqueue_missing(cur, None, 100000)
        assert active(a) == 1  # an active job is not duplicated
        enqueue_missing(cur, "test-embed@0000000", 100000)
        assert active(b) == 1  # b's chunks have no vectors of the configured model
