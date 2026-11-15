"""Open panel member names stay out of chunks (plan Ek E, FR-21, FR-80; istek
anonimlestirme-onay-ve-acik-kaynak madde 4), run on the real AYM, Yargitay and Danistay decisions recorded by
the connectors (tests/fixtures, 2026-11-15). Every name written in this file is SYNTHETIC. Names read from the
fixtures are only counted, so a failing assertion (pytest shows the operands) never carries a name or decision
text into a log."""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Sequence

import pytest

from anonymizer.pipeline import anonymize
from anonymizer.public_names import index_text
from anonymizer.roles import find_panel_members
from anonymizer.suffixes import tr_fold
from connectors import aym, danistay, yargitay
from core.jobs import ClaimedJob, JobType
from nlp import panel_names
from nlp.chunk import chunk_text, to_units
from nlp.embedder import EMBED_DIMENSIONS
from nlp.job import make_embed_chunks_handler
from nlp.panel_names import IndexTextMismatch, index_chunks, member_replacements
from nlp.store import MemoryEmbedStore, SqlEmbedStore

ROOT = Path(__file__).resolve().parents[4]
FIXTURES = ROOT / "services" / "worker-py" / "tests" / "fixtures"
PATTERNS = json.loads((ROOT / "packages" / "casuist" / "fixtures" / "kurul-satiri.json").read_text("utf-8"))
NOW = datetime(2026, 11, 15, tzinfo=timezone.utc)
RID = "00000000-0000-4000-8000-0000000000f1"


@pytest.fixture(autouse=True)
def _development_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """The rule layer runs without NER only in development (anonymizer fail closed elsewhere)."""
    monkeypatch.delenv("KAZUIST_ENV", raising=False)


def _aym_bb():
    return aym.parse_decision((FIXTURES / "aym/bb-karar.json").read_bytes(), aym.BB, NOW)


def _aym_nd():
    return aym.parse_decision((FIXTURES / "aym/nd-karar.json").read_bytes(), aym.ND, NOW)


def _yargitay():
    item = yargitay.parse_search((FIXTURES / "yargitay/liste-hgk-2024.json").read_bytes()).items[4]
    return yargitay.parse_document((FIXTURES / "yargitay/dokuman-1104187600.json").read_bytes(), item, NOW)


def _danistay():
    item = danistay.parse_search((FIXTURES / "danistay/liste-iddk-2024.json").read_bytes()).items[2]
    return danistay.parse_document((FIXTURES / "danistay/dokuman-1134943400.html").read_bytes(), item, NOW)


def _open_masked(d) -> str:
    r = anonymize(d.text, court=d.court, source_key=d.source_key)
    assert r.open_source == "AYM" and r.publishable
    return r.masked_text


def _members(masked: str) -> List[str]:
    return [masked[s.start : s.end] for s in find_panel_members(masked)]


def _mentions(names: Sequence[str], text: str) -> int:
    """Occurrences of the full names and of their surnames as whole words, Turkish folded (a count only)."""
    folded = tr_fold(text)
    words = {tr_fold(n) for n in names} | {tr_fold(n.split()[-1]) for n in names}
    return sum(len(re.findall(rf"(?<!\w){re.escape(w)}(?!\w)", folded)) for w in words)


class Recording:
    model = "test-embed@0000000"
    dimensions = EMBED_DIMENSIONS

    def __init__(self) -> None:
        self.seen: List[str] = []

    def embed(self, texts: Sequence[str], kind: str) -> List[List[float]]:
        self.seen.extend(texts)
        return [[1.0 / EMBED_DIMENSIONS**0.5] * EMBED_DIMENSIONS for _ in texts]


def _job(rid: str = RID) -> ClaimedJob:
    return ClaimedJob("j1", JobType.EMBED_CHUNKS, {"recordId": rid}, 1, 5)


# --- real AYM decisions through the embed.chunks handler ----------------------------------------------------
def _embed(masked: str):
    store = MemoryEmbedStore({RID: {"text": None, "masked_text": masked, "type": "karar"}})
    embedder = Recording()
    result = make_embed_chunks_handler(store, embedder, lambda *a, **k: None)(_job())
    # the record page text is untouched
    assert store.records[RID]["masked_text"] == masked
    return store.chunks[RID], embedder.seen, result


@pytest.mark.parametrize(("make", "count"), [(_aym_bb, 5), (_aym_nd, 17)], ids=["aym-bb", "aym-nd"])
def test_real_aym_member_names_stay_on_the_record_and_out_of_chunks_and_embeddings(make, count) -> None:
    masked = _open_masked(make())
    members = _members(masked)
    # every listed member is readable in masked_text, which the record page shows
    assert len(members) == count and _mentions(members, masked) >= count
    rows, embedded, result = _embed(masked)
    plain = chunk_text(masked, sections=True)
    assert [(r["seq"], r["section"], r["char_start"], r["char_end"]) for r in rows] == [
        (c.seq, c.section, c.char_start, c.char_end) for c in plain
    ]
    # chunks.text (and so chunks.tsv), the embedded passages and jobs.result carry no member name
    assert sum(_mentions(members, r["text"]) for r in rows) == 0
    assert sum(len(find_panel_members(r["text"])) for r in rows) == 0
    assert len(embedded) == len(rows) and sum(_mentions(members, t) for t in embedded) == 0
    assert _mentions(members, json.dumps(result, ensure_ascii=False)) == 0
    assert set(result) == {"recordId", "chunks", "vectors", "embeddingModel"}
    labels = {m for r in rows for m in re.findall(r"\[Üye \d+\]", r["text"])}
    assert labels == {f"[Üye {i}]" for i in range(1, count + 1)}
    # outside the replaced names a chunk is exactly its masked_text slice
    reps = member_replacements(masked)
    for r in rows:
        if not any(s < r["char_end"] and r["char_start"] < e for s, e, _ in reps):
            assert r["text"] == masked[r["char_start"] : r["char_end"]]
    # the chunks together are index_text: same text between and around the passages
    whole = index_text(masked)
    assert all(r["text"] in whole for r in rows)


def test_real_aym_member_named_again_in_a_dissent_gets_the_panel_number_in_that_passage() -> None:
    d = _aym_nd()
    members = _members(_open_masked(d))
    # a dissent written into the real text names the second listed member and the fourth by surname alone
    second, fourth = members[1], members[3]
    tail = (
        f"\nKARŞI OY GEREKÇESİ\n1. {second}'in karşı oyuna katılmıyorum; "
        f"{fourth.split()[-1]}'ın görüşü de ayrıdır.\n"
    )
    r = anonymize(d.text + tail, court=d.court, source_key=d.source_key)
    rows, embedded, _ = _embed(r.masked_text)
    dissent = [row for row in rows if row["section"] == "karsi_oy"]
    assert len(dissent) == 1 and find_panel_members(dissent[0]["text"]) == []
    assert dissent[0]["text"].endswith(
        "1. [Üye 2]'in karşı oyuna katılmıyorum; [Üye 4]'ın görüşü de ayrıdır."
    )
    assert sum(_mentions(members, row["text"]) for row in rows) == 0
    assert sum(_mentions(members, t) for t in embedded) == 0


@pytest.mark.parametrize(
    "make", [_aym_bb, _aym_nd, _yargitay, _danistay], ids=["aym-bb", "aym-nd", "yargitay", "danistay"]
)
def test_closed_source_texts_are_chunked_unchanged(make) -> None:
    d = make()
    masked = anonymize(d.text).masked_text if d.court == "Anayasa Mahkemesi" else _closed(d)
    assert member_replacements(masked) == []
    plain = chunk_text(masked, sections=True)
    assert index_chunks(masked, plain) == plain


def _closed(d) -> str:
    r = anonymize(d.text, court=d.court, source_key=d.source_key)
    assert r.open_source is None
    return r.masked_text


# --- replacement details on synthetic text ------------------------------------------------------------------
PANEL = "Başkan : Ayşe YILMAZ\nÜyeler : Can ERGÜN\nOya SUNAR\nRaportör : [Raportör]\n"


def test_a_name_cut_by_a_passage_boundary_is_replaced_on_both_sides() -> None:
    masked = PANEL + "1. Bu karar " + "metin " * 6 + "Üye Can ERGÜN karşı oy yazmıştır"
    chunks = chunk_text(masked, max_chars=60, min_chars=10)
    out = index_chunks(masked, chunks)
    cut_before = masked[chunks[3].char_start : chunks[3].char_end].endswith("Üye Can")
    cut_after = masked[chunks[4].char_start : chunks[4].char_end].startswith("ERGÜN")
    assert cut_before and cut_after  # the passage boundary falls inside the name
    assert [c.text for c in out] == [
        "Başkan : [Üye 1]",
        "Üyeler : [Üye 2]",
        "[Üye 3]\nRaportör : [Raportör]",
        "1. Bu karar metin metin metin metin metin metin Üye [Üye 2]",
        "[Üye 2] karşı oy yazmıştır",
    ]
    assert [(c.seq, c.char_start, c.char_end, c.section) for c in out] == [
        (c.seq, c.char_start, c.char_end, c.section) for c in chunks
    ]


def test_offsets_are_utf16_units_like_the_typescript_chunks() -> None:
    masked = "Not 😀 işareti.\n" + PANEL + "SUNAR'ın görüşü 😀 alınmıştır."
    reps = member_replacements(masked)
    units = to_units(masked)
    assert [units[s:e] for s, e, _ in reps] == ["Ayşe YILMAZ", "Can ERGÜN", "Oya SUNAR", "SUNAR"]
    out = index_chunks(masked, chunk_text(masked))
    assert "".join(c.text for c in out).count("😀") == 2
    assert "[Üye 3]'ın görüşü 😀 alınmıştır." in out[-1].text


def test_text_without_panel_names_is_returned_as_is() -> None:
    masked = "Başkan : [Hâkim 1]\nÜye : [Hâkim 2]\nDavacı [Davacı] tazminat istemiştir."
    chunks = chunk_text(masked)
    assert member_replacements(masked) == [] and index_chunks(masked, chunks) == chunks


def test_a_drift_from_index_text_fails_the_job_and_writes_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(panel_names, "index_text", lambda text: text)
    store = MemoryEmbedStore(
        {RID: {"text": None, "masked_text": PANEL + "1. Karar verildi.", "type": "karar"}}
    )
    with pytest.raises(IndexTextMismatch):
        make_embed_chunks_handler(store, Recording(), lambda *a, **k: None)(_job())
    assert store.chunks == {}


# --- the TypeScript guard (packages/casuist/src/panel.ts) on the same decisions -----------------------------
LINE = re.compile(PATTERNS["line"])
BREAK = re.compile(PATTERNS["lineBreak"])


def _flagged(text: str) -> bool:
    return any(LINE.match(line) for line in BREAK.split(text))


def test_typescript_guard_flags_every_text_with_a_readable_panel_name() -> None:
    texts = [
        _open_masked(_aym_bb()),
        _open_masked(_aym_nd()),
        PANEL,
        "Başkan Ali VEZİROĞLU Başkanvekili Oya SUNGUR\nÜye\nTuna SELÇUKLU\n",
        "\tÜYELER:\nCan ERGÜN\n",
    ]
    for t in texts:
        assert find_panel_members(t) and _flagged(t)
    # closed sources keep their on the fly passages
    closed = [
        anonymize(_aym_bb().text).masked_text,
        anonymize(_aym_nd().text).masked_text,
        _closed(_yargitay()),
        _closed(_danistay()),
        "Başkan : [Hâkim 1]\nÜye : [Hâkim 2]\n",
    ]
    for t in closed:
        assert not find_panel_members(t) and not _flagged(t)
    # every line break of str.splitlines is a break of the guard, so no panel line hides inside a guard line
    for sep in ["\n", "\r", "\r\n", "\v", "\f", "\x1c", "\x1d", "\x1e", "\x85", "\u2028", "\u2029"]:
        assert _flagged(f"Karar{sep}Başkan : Ayşe YILMAZ"), repr(sep)


# --- the same record through PostgreSQL: chunks.tsv has no member name --------------------------------------
URL = os.environ.get("KAZUIST_TEST_DATABASE_URL", "")


@pytest.mark.skipif(not URL, reason="KAZUIST_TEST_DATABASE_URL not set")
def test_real_aym_decision_leaves_no_member_lexeme_in_chunks_tsv() -> None:
    import psycopg

    masked = _open_masked(_aym_nd())
    # as written in the text, so the query and the document go through the same parser and lower casing
    surnames = sorted({n.split()[-1] for n in _members(masked)})
    expected = len(surnames)
    rid = str(uuid.uuid4())
    with psycopg.connect(URL, autocommit=True) as conn:
        conn.execute(
            """INSERT INTO records (id, type, title, authority_class, license_basis, source_url, source_key,
                                    fetched_at, text, masked_text)
               VALUES (%(id)s, 'karar', 'Test kaydı', 'baglayici_karar', 'test', 'https://example.org',
                       %(key)s, now(), 'x', %(m)s)""",
            {"id": rid, "key": f"test:{rid}", "m": masked},
        )
    store = SqlEmbedStore(lambda: psycopg.connect(URL))
    assert make_embed_chunks_handler(store, Recording(), lambda *a, **k: None)(_job(rid))["chunks"] > 0
    with psycopg.connect(URL, autocommit=True) as conn:

        def hits(sql: str, word: str) -> int:
            return conn.execute(sql, {"id": rid, "w": word}).fetchone()[0]

        in_tsv = (
            "SELECT count(*) FROM chunks WHERE record_id = %(id)s "
            "AND tsv @@ plainto_tsquery('turkish', %(w)s)"
        )
        in_text = (
            "SELECT count(*) FROM records WHERE id = %(id)s "
            "AND to_tsvector('turkish', masked_text) @@ plainto_tsquery('turkish', %(w)s)"
        )
        in_record = sum(hits(in_text, w) for w in surnames)
        in_chunks = sum(hits(in_tsv, w) for w in surnames)
        assert in_record == expected  # the record page text has every member
        assert in_chunks == 0
        assert (
            hits("SELECT count(*) FROM chunks WHERE record_id = %(id)s AND text LIKE %(w)s", "%[Üye 1]%") >= 1
        )
        conn.execute("DELETE FROM records WHERE id = %(id)s", {"id": rid})
