from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient

from core.api import create_app
from core.dedupe import dedupe_key, normalize_case_number
from core.jobs import ClaimedJob, JobType
from core.pipeline import PgRepository, InMemoryRepository, ingest
from core.records import RecordDraft
from core.runtime import Runtime, make_handlers
from core.sources import SourceRegistry
from core.storage import LocalObjectStore, RawArchive, S3ObjectStore
from helpers import ALL_ON, NO_ROBOTS, build_fetcher, fixture_bytes, ok

NOW = datetime(2026, 10, 19, tzinfo=timezone.utc)


def test_case_number_normalisation() -> None:
    assert normalize_case_number("E. 2013/19-199") == normalize_case_number("e:2013/19 - 199") == "2013/19-199"
    assert normalize_case_number("K. 2013/1418") == "2013/1418"


def test_dedupe_key_uses_case_identifiers_then_text() -> None:
    a = dedupe_key("Yargıtay", "HGK", "E. 2013/19-199", "K. 2013/1418", date(2015, 1, 1))
    b = dedupe_key("yargıtay", "hgk", "2013/19-199", "2013/1418", date(2015, 1, 1), text="different text")
    assert a == b and a.startswith("case:")
    assert dedupe_key("Yargıtay", "HGK", "2013/19-199", "2013/1419", date(2015, 1, 1)) != a
    t1 = dedupe_key(None, None, None, None, None, text="Aynı   metin\n burada")
    t2 = dedupe_key(None, None, None, None, None, text="aynı metin burada")
    assert t1 == t2 and t1.startswith("txt:")
    with pytest.raises(ValueError):
        dedupe_key(None, None, None, None, None)


def test_record_requires_provenance() -> None:
    with pytest.raises(ValueError):
        RecordDraft("karar", "t", "emsal", "", "https://x", "k", NOW, "txt")


def test_decision_not_publishable_until_anonymised() -> None:
    from core.pipeline import is_publishable

    repo = InMemoryRepository()
    d = RecordDraft("karar", "t", "emsal", "lisans", "https://x", "k1", NOW, "txt", court="C", esas_no="2020/1")
    out = ingest(d, None, repo)
    assert not is_publishable(repo.records[out.record_id]) and out.anon_queued
    n = RecordDraft("mevzuat", "t", "baglayici_norm", "lisans", "https://x", "k2", NOW, "txt")
    out2 = ingest(n, None, repo)
    assert is_publishable(repo.records[out2.record_id]) and not out2.anon_queued


def test_same_decision_from_two_sources_dedupes() -> None:
    repo = InMemoryRepository()
    base = dict(type="karar", title="t", authority_class="emsal", license_basis="l", fetched_at=NOW, text="x",
                court="Yargıtay", chamber="HGK", esas_no="2013/19-199", karar_no="2013/1418", decision_date=date(2015, 1, 1))
    a = ingest(RecordDraft(source_url="https://a", source_key="a:1", **base), None, repo)
    b = ingest(RecordDraft(source_url="https://b", source_key="b:1", **base), None, repo)
    assert a.record_id == b.record_id and len(repo.records) == 1 and len(repo.jobs) == 1


def test_local_store_blocks_path_escape(tmp_path) -> None:
    store = LocalObjectStore(tmp_path / "s")
    store.put("raw/a/b", b"1")
    assert store.get("raw/a/b") == b"1"
    with pytest.raises(ValueError):
        store.put("../evil", b"1")


def test_s3_store_uses_client_interface() -> None:
    class Client:
        def __init__(self) -> None:
            self.objs: dict = {}

        def put_object(self, Bucket, Key, Body, **kw):  # noqa: N803
            self.objs[(Bucket, Key)] = Body

        def head_object(self, Bucket, Key):  # noqa: N803
            if (Bucket, Key) not in self.objs:
                raise KeyError(Key)

    c = Client()
    arch = RawArchive(S3ObjectStore(c, "bucket"))
    doc = arch.save("kvkk", "id", "https://www.kvkk.gov.tr/x", b"abc", "text/html", NOW)
    arch.save("kvkk", "id", "https://www.kvkk.gov.tr/x", b"abc", "text/html", NOW)
    assert list(c.objs) == [("bucket", doc.object_key)]


class FakeCursor:
    def __init__(self) -> None:
        self.calls: list = []
        self._next: tuple | None = ("rec-uuid", True)

    def execute(self, sql, params=None) -> None:
        self.calls.append((sql, params))

    def fetchone(self):
        return self._next


def test_pg_repository_statements() -> None:
    cur = FakeCursor()
    repo = PgRepository(cur)
    d = RecordDraft("karar", "t", "emsal", "l", "https://x", "k", NOW, "txt", court="C", esas_no="1/1")
    out = ingest(d, None, repo)
    assert out.record_id == "rec-uuid"
    sqls = [c[0] for c in cur.calls]
    assert "ON CONFLICT (source_key)" in sqls[0] and "INTO jobs" in sqls[-1]
    assert cur.calls[0][1]["anonymized"] is False and cur.calls[-1][1]["type"] == "anon.run"
    assert not any("embed" in str(c[1]) for c in cur.calls)


def test_internal_api_requires_token_and_stops_source(tmp_path, clock) -> None:
    fetcher, _ = build_fetcher({}, tmp_path, clock)
    rt = Runtime(fetcher.registry, fetcher, lambda: None)  # type: ignore[arg-type,return-value]
    open_app = TestClient(create_app(rt, env={}))
    assert open_app.get("/healthz").status_code == 200
    assert open_app.get("/internal/sources").status_code == 503  # no token configured: fail closed
    client = TestClient(create_app(rt, env={"KAZUIST_INTERNAL_TOKEN": "t0ken"}))
    assert client.get("/internal/sources").status_code == 401
    assert client.get("/internal/sources", headers={"X-Internal-Token": "bad"}).status_code == 401
    h = {"X-Internal-Token": "t0ken"}
    assert client.get("/internal/sources", headers=h).json()["sources"]
    assert client.post("/internal/sources/kvkk/stop", headers=h).status_code == 200
    assert not fetcher.registry.is_enabled("kvkk")
    assert client.post("/internal/sources/kvkk/reset", headers=h).status_code == 200
    assert fetcher.registry.is_enabled("kvkk")
    assert client.post("/internal/sources/unknown/stop", headers=h).status_code >= 400


def test_rg_daily_handler_queues_mevzuat_refetch(tmp_path, clock) -> None:
    url = "https://www.resmigazete.gov.tr/eskiler/2026/10/20261016.htm"
    routes = {"https://www.resmigazete.gov.tr/robots.txt": NO_ROBOTS, url: ok(fixture_bytes("rg/20261016.htm"))}
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    repo = InMemoryRepository()
    from contextlib import contextmanager

    @contextmanager
    def provider():
        yield repo

    rt = Runtime(fetcher.registry, fetcher, provider)
    handler = make_handlers(rt)[JobType.MEVZUAT_RG_DAILY]
    result = handler(ClaimedJob("j1", JobType.MEVZUAT_RG_DAILY, {"date": "2026-10-16"}, 1, 5))
    assert result["entries"] == 55 and set(result) == {"entries", "mevzuatQueued"}


def test_ingest_handler_rejects_unknown_source(tmp_path, clock) -> None:
    from contextlib import contextmanager

    fetcher, _ = build_fetcher({}, tmp_path, clock)

    @contextmanager
    def provider():
        yield InMemoryRepository()

    handler = make_handlers(Runtime(fetcher.registry, fetcher, provider))[JobType.INGEST_FETCH]
    with pytest.raises(ValueError):
        handler(ClaimedJob("j", JobType.INGEST_FETCH, {"source": "nope"}, 1, 5))
    assert SourceRegistry.load(env=dict(ALL_ON)).names()
