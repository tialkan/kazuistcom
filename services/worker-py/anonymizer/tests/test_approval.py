"""Editor approval of anonymization review items (plan 6.4/6): an "onay" publishes the held record on the next
anon.run, approvals.py queues that run. All text below is SYNTHETIC.

The PostgreSQL test runs when KAZUIST_IT_DATABASE_URL points at a database with the packages/db migrations
applied; it works inside one transaction and rolls it back."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, List

import pytest

from anonymizer import approvals
from anonymizer.job import make_anon_run_handler
from anonymizer.pipeline import Approval, anonymize
from anonymizer.store import APPROVAL_SQL, MemoryAnonStore, SqlAnonStore, approval_from_row
from core.jobs import ClaimedJob, JobType

RID = "00000000-0000-4000-8000-0000000000c1"
# "Tarkan Özdağ'a" has no role cue: a suffix candidate below the review threshold, so the run is held.
HELD = "Dosya kapsamına göre Tarkan Özdağ'a ait araç, davacı Selin Akbulut tarafından satın alınmıştır."
AT = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)


def _job(record_id: str = RID, n: int = 1) -> ClaimedJob:
    return ClaimedJob(f"j{n}", JobType.ANON_RUN, {"recordId": record_id}, 1, 5)


def _held_store(text: str = HELD) -> MemoryAnonStore:
    return MemoryAnonStore({RID: (text, "Ankara 3. Asliye Hukuk Mahkemesi", "uyap:test:1")})


def test_held_record_is_published_after_onay() -> None:
    store = _held_store()
    handle = make_anon_run_handler(lambda: store)
    first = handle(_job())
    assert first["publishable"] is False and first["review"] == 1
    assert store.masked_text[RID] is None and store.embed_jobs == [] and len(store.review_rows) == 1

    store.decide(RID, "onay", by="editor-1", at=AT)
    second = handle(_job(n=2))
    assert second["publishable"] is True and second["review"] == 1
    masked = store.masked_text[RID]
    assert masked is not None and "Tarkan" not in masked and "Selin" not in masked
    assert store.embed_jobs == [RID] and store.review_rows == []
    approval = store.saved[RID].approval
    assert approval is not None and approval.decided_by == "editor-1" and approval.decided_at == AT

    # a later run of the same version stays published without a new item
    handle(_job(n=3))
    assert store.masked_text[RID] == masked and store.review_rows == []


def test_the_latest_editor_decision_of_the_version_counts() -> None:
    for later in ("ret", "duzelt"):
        held = _held_store()
        handle = make_anon_run_handler(lambda store=held: store)
        handle(_job())
        approved = held.decide(RID, "onay", at=AT)
        # a later negative decision on an item with the same items, before the run that would publish
        held.decided.append({**approved, "id": "review-later", "decision": later,
                             "decided_at": AT.replace(hour=13)})
        out = handle(_job(n=2))
        assert out["publishable"] is False
        assert held.masked_text[RID] is None and len(held.review_rows) == 1

    # the other way round: a "ret", then an "onay" on the item the next run opened
    store = _held_store()
    handle = make_anon_run_handler(lambda: store)
    handle(_job())
    store.decide(RID, "ret", at=AT)
    assert handle(_job(n=2))["publishable"] is False and len(store.review_rows) == 1
    store.decide(RID, "onay", at=AT.replace(hour=13))
    assert handle(_job(n=3))["publishable"] is True and store.review_rows == []


def test_approval_must_cover_every_item_of_the_run() -> None:
    store = _held_store()
    handle = make_anon_run_handler(lambda: store)
    handle(_job())
    store.decide(RID, "onay", at=AT)
    # the text changed after the decision: one more candidate the editor never saw
    store.records[RID] = (HELD + " Ayrıca Derya Kumral'ın beyanı alınmıştır.", None, None)
    out = handle(_job(n=2))
    assert out["publishable"] is False and out["review"] == 2
    assert store.masked_text[RID] is None and store.embed_jobs == [] and len(store.review_rows) == 1


def test_approval_of_another_version_does_not_count() -> None:
    r = anonymize(HELD)
    assert r.review and not r.publishable
    items = r.review_keys()
    other = Approval("rq-1", r.anonymization_version.replace("+ner.none", "+ner.akdeniz27@99995f7"), items)
    assert r.with_approval(other).approval is None
    same = Approval("rq-1", r.anonymization_version, items)
    assert r.with_approval(same).publishable and r.with_approval(same).review_queue_row(RID) is None
    partial = Approval("rq-1", r.anonymization_version, frozenset(list(items)[1:]))
    assert r.with_approval(partial).approval is None


def test_onay_never_publishes_a_run_without_ner_where_ner_is_required() -> None:
    store = _held_store()
    handle = make_anon_run_handler(lambda: store, require_ner=True)
    handle(_job())
    assert store.review_rows[0]["payload"]["blocked"] == "ner_unavailable"
    store.decide(RID, "onay", at=AT)
    out = handle(_job(n=2))
    assert out["publishable"] is False
    assert store.masked_text[RID] is None and store.review_rows[0]["payload"]["blocked"] == "ner_unavailable"


def test_approval_from_row_is_strict() -> None:
    payload = {"anonymizationVersion": "v", "items": [{"charStart": 1, "charEnd": 4, "entity": "PERSON",
                                                       "mask": "[Kişi 1]"}]}
    a = approval_from_row("rq", "onay", json.dumps(payload), "u1", AT)
    assert a is not None and a.items == frozenset({(1, 4, "PERSON", "[Kişi 1]")}) and a.decided_by == "u1"
    assert approval_from_row("rq", "ret", payload) is None
    assert approval_from_row("rq", "onay", {**payload, "blocked": "ner_unavailable"}) is None
    assert approval_from_row("rq", "onay", {**payload, "items": [{"charStart": "x"}]}) is None
    assert approval_from_row("rq", "onay", {"items": []}) is None


class ApprovalCursor:
    """Answers LOAD with a held text and APPROVAL with an "onay" row that lists the run's item."""

    def __init__(self, approval_row: Any = None) -> None:
        self.calls: List[tuple] = []
        self._rows: List[tuple] = []
        self.approval_row = approval_row

    def execute(self, query: str, params: Any = None) -> None:
        self.calls.append((query, params))
        if query.startswith("SELECT text"):
            self._rows = [(HELD, None, "uyap:test:1")]
        elif query == APPROVAL_SQL:
            self._rows = [self.approval_row] if self.approval_row else []
        else:
            self._rows = []

    def fetchall(self) -> List[tuple]:
        return self._rows


def test_sql_store_publishes_and_marks_reviewed_spans() -> None:
    held = anonymize(HELD)
    row = held.review_queue_row(RID)
    cur = ApprovalCursor(("rq-9", "onay", row["payload"], "u-editor", AT))
    out = make_anon_run_handler(lambda: SqlAnonStore(cur))(_job())
    assert out["publishable"] is True
    approval_call = next(p for q, p in cur.calls if q == APPROVAL_SQL)
    assert approval_call == {"id": RID, "version": held.anonymization_version}
    spans = [p for q, p in cur.calls if q.lstrip().startswith("INSERT INTO anonymization_spans")]
    reviewed = [p for p in spans if p["reviewed_by"] == "u-editor" and p["reviewed_at"] == AT]
    assert len(reviewed) == 1 and reviewed[0]["score"] < 0.8
    assert all(p["reviewed_by"] is None for p in spans if p not in reviewed)
    assert not any(q.lstrip().startswith("INSERT INTO review_queue") for q, _ in cur.calls)
    update = next(p for q, p in cur.calls if q.lstrip().startswith("UPDATE records"))
    assert update["anonymized"] is True and update["masked"] and "Tarkan" not in update["masked"]
    assert any(p and p.get("dedupe_key") == f"embed:{RID}" for _, p in cur.calls)

    # without a decision the same run opens an item and writes no text
    cur = ApprovalCursor(None)
    out = make_anon_run_handler(lambda: SqlAnonStore(cur))(_job())
    assert out["publishable"] is False
    update = next(p for q, p in cur.calls if q.lstrip().startswith("UPDATE records"))
    assert update["masked"] is None


def test_queue_approved_runs_one_statement_and_returns_ids() -> None:
    class Cur:
        def __init__(self) -> None:
            self.calls: List[str] = []

        def execute(self, query: str, params: Any = None) -> None:
            self.calls.append(query)

        def fetchall(self) -> List[tuple]:
            return [(RID,)]

    cur = Cur()
    assert approvals.queue_approved(cur) == [RID] and cur.calls == [approvals.QUEUE_APPROVED_SQL]
    assert approvals.main({}) == 2


# --- real PostgreSQL ----------------------------------------------------------------------------------------
IT_URL = os.environ.get("KAZUIST_IT_DATABASE_URL")


@pytest.mark.skipif(not IT_URL, reason="KAZUIST_IT_DATABASE_URL is not set")
def test_approval_round_trip_on_postgres() -> None:
    import psycopg  # type: ignore

    with psycopg.connect(IT_URL) as conn:
        try:
            with conn.cursor() as cur:
                _round_trip(cur)
        finally:
            conn.rollback()


def _round_trip(cur: Any) -> None:
    editor = str(uuid.uuid4())
    cur.execute("INSERT INTO users (id, email) VALUES (%s, %s)", (editor, f"{editor}@ornek.test"))
    rid = str(uuid.uuid4())
    cur.execute(
        "INSERT INTO records (id, type, title, authority_class, license_basis, source_url, source_key,"
        " fetched_at, text, court)"
        " VALUES (%s, 'karar', 't', 'emsal', 'l', 'https://ornek.test', %s, now(), %s, 'Yargıtay')",
        (rid, f"test:{rid}", HELD))
    handle = make_anon_run_handler(lambda: SqlAnonStore(cur))

    def one(sql: str, *args: Any) -> Any:
        cur.execute(sql, args)
        return cur.fetchone()

    def state() -> Any:
        return one("SELECT anonymized, masked_text IS NOT NULL, anonymization_version FROM records"
                   " WHERE id = %s", rid)

    def jobs(kind: str) -> int:
        return one("SELECT count(*) FROM jobs WHERE type = %s::job_type AND payload->>'recordId' = %s",
                   kind, rid)[0]

    def decide(decision: str, seconds: int) -> None:
        cur.execute("UPDATE review_queue SET decision = %s, decided_by = %s,"
                    " decided_at = now() + make_interval(secs => %s)"
                    " WHERE subject_id = %s AND decision IS NULL", (decision, editor, seconds, rid))

    assert handle(_job(rid))["publishable"] is False
    assert state()[:2] == (False, False) and approvals.queue_approved(cur) == []  # nothing decided yet

    # the admin panel records the decision only; the sweep queues the run once
    decide("onay", 0)
    assert approvals.queue_approved(cur) == [rid] and jobs("anon.run") == 1
    assert approvals.queue_approved(cur) == [] and jobs("anon.run") == 1  # the queued run absorbs it

    out = handle(_job(rid, 2))
    assert out["publishable"] is True
    anonymized, has_text, version = state()
    assert anonymized is True and has_text and version == out["anonymizationVersion"]
    assert "Tarkan" not in one("SELECT masked_text FROM records WHERE id = %s", rid)[0]
    assert jobs("embed.chunks") == 1
    assert one("SELECT count(*) FROM anonymization_spans WHERE record_id = %s AND reviewed_by = %s"
               " AND reviewed_at IS NOT NULL", rid, editor)[0] == 1
    assert one("SELECT count(*) FROM review_queue WHERE subject_id = %s AND decision IS NULL", rid)[0] == 0
    cur.execute("UPDATE jobs SET status = 'done' WHERE type = 'anon.run' AND payload->>'recordId' = %s",
                (rid,))
    assert approvals.queue_approved(cur) == []  # published: nothing left to apply

    # a later "ret" on a new item of the same version cancels the approval
    cur.execute("UPDATE records SET text = %s, masked_text = NULL, anonymized = false WHERE id = %s",
                (HELD + " Ayrıca Derya Kumral'ın beyanı alınmıştır.", rid))
    assert handle(_job(rid, 3))["publishable"] is False
    decide("ret", 1)
    assert approvals.queue_approved(cur) == []
    assert handle(_job(rid, 4))["publishable"] is False

    # an "onay" after the "ret" counts again, unless a run of the record died after that decision
    decide("onay", 2)
    cur.execute("UPDATE jobs SET status = 'dead', updated_at = now() + interval '3 seconds'"
                " WHERE type = 'anon.run' AND payload->>'recordId' = %s", (rid,))
    assert approvals.queue_approved(cur) == []
    cur.execute("UPDATE jobs SET updated_at = now() WHERE type = 'anon.run' AND payload->>'recordId' = %s",
                (rid,))
    assert approvals.queue_approved(cur) == [rid]
    assert handle(_job(rid, 5))["publishable"] is True
