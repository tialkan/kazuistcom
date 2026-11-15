"""Discovery jobs: list pages become document jobs; known decisions are skipped; the queue is the resume point."""

from __future__ import annotations

import json
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List

import pytest

from connectors import aym, danistay, yargitay
from core import discovery
from core.jobs import ClaimedJob, JobType
from core.pipeline import InMemoryRepository
from core.runtime import Runtime, make_handlers
from helpers import NO_ROBOTS, build_fetcher, fixture_bytes, ok

JSON = "application/json"


def _handler(routes: Dict[str, object], tmp_path: Path, clock, repo: InMemoryRepository):
    fetcher, transport = build_fetcher(routes, tmp_path, clock)

    @contextmanager
    def provider():
        yield repo

    handler = make_handlers(Runtime(fetcher.registry, fetcher, provider))[JobType.INGEST_FETCH]
    return (lambda payload: handler(ClaimedJob("j", JobType.INGEST_FETCH, payload, 1, 5))), transport


def _payloads(repo: InMemoryRepository) -> List[Dict[str, Any]]:
    return [j["payload"] for j in repo.jobs if j["type"] == "ingest.fetch"]


def _aym_routes():
    hosts = ("kararlarbilgibankasi.anayasa.gov.tr", "normkararlarbilgibankasi.anayasa.gov.tr")
    routes: Dict[str, object] = {f"https://{h}/robots.txt": NO_ROBOTS for h in hosts}
    routes[aym.search_url(aym.BB)] = lambda body: ok(
        fixture_bytes("aym/bb-liste.json") if b'"size":100' in body else fixture_bytes("aym/bb-karar.json"), JSON
    )
    return routes


def test_aym_list_job_queues_merits_only_and_the_next_page(tmp_path: Path, clock) -> None:
    repo = InMemoryRepository()
    run, _ = _handler(_aym_routes(), tmp_path, clock, repo)
    result = run({"source": "aym", "kararTipi": "BireyselBasvuru", "page": 50})
    assert result == {"listed": 6, "merits": 4, "queued": 4, "next": True}
    payloads = _payloads(repo)
    docs = [p for p in payloads if "id" in p]
    assert len(docs) == 4 and {"source": "aym", "kararTipi": "BireyselBasvuru", "page": 51} in payloads
    assert all(set(p) == {"source", "kararTipi", "id"} for p in docs)  # identifiers only
    keys = [j["dedupe_key"] for j in repo.jobs]
    assert all(k and k.startswith("aym:") for k in keys) and "aym:list:BireyselBasvuru:51" in keys


def test_aym_list_job_skips_known_decisions_and_stops_on_last_page(tmp_path: Path, clock) -> None:
    page = aym.parse_search(fixture_bytes("aym/bb-liste.json"), aym.BB)
    merits = [i for i in page.items if i.is_merits]
    repo = InMemoryRepository()
    repo.dedupe_index[merits[0].key] = "rec-existing"
    run, _ = _handler(_aym_routes(), tmp_path, clock, repo)
    result = run({"source": "aym", "kararTipi": "BireyselBasvuru", "page": 50})
    assert result["queued"] == 3
    # a page past the end (page * 100 >= total) queues no next page
    repo2 = InMemoryRepository()
    run2, _ = _handler(_aym_routes(), tmp_path / "b", clock, repo2)
    assert run2({"source": "aym", "kararTipi": "BireyselBasvuru", "page": 181})["next"] is False
    assert not any(p.get("page") for p in _payloads(repo2))


def test_aym_document_job_ingests_and_queues_anonymisation(tmp_path: Path, clock) -> None:
    uuid = json.loads(fixture_bytes("aym/bb-karar.json"))["data"][0]["id"]
    repo = InMemoryRepository()
    run, _ = _handler(_aym_routes(), tmp_path, clock, repo)
    result = run({"source": "aym", "kararTipi": "BireyselBasvuru", "id": uuid})
    assert result["created"] is True and set(result) == {"recordId", "created"}
    assert [j["type"] for j in repo.jobs] == ["anon.run"]
    assert next(iter(repo.records.values()))["anonymized"] is False


@pytest.mark.parametrize(
    "payload",
    [
        {"source": "aym", "kararTipi": "Baska", "page": 1},
        {"source": "aym", "kararTipi": "BireyselBasvuru", "page": 0},
        {"source": "aym", "kararTipi": "BireyselBasvuru", "id": "not-a-uuid"},
        {"source": "yargitay", "unit": "Hukuk Genel Kurulu", "year": 1800, "page": 1},
        {"source": "yargitay", "unit": "Hukuk Genel Kurulu", "id": "12", "esas": "x", "karar": "2024/1", "date": "2024-01-01"},
        {"source": "danistay", "unit": "", "page": 1, "year": 2024},
    ],
)
def test_bad_payloads_are_refused_before_any_request(payload: dict, tmp_path: Path, clock) -> None:
    repo = InMemoryRepository()
    run, transport = _handler(_aym_routes(), tmp_path, clock, repo)
    with pytest.raises(discovery.BadJob):
        run(payload)
    assert transport.calls == [] and repo.jobs == []


def test_yargitay_list_job_then_document_job_round_trip(tmp_path: Path, clock) -> None:
    base = yargitay.BASE
    routes = {
        f"{base}/robots.txt": ok(b'{"data":null,"metadata":{"FMTY":"ERROR"}}', JSON),
        f"{base}/aramadetaylist": ok(fixture_bytes("yargitay/liste-hgk-2024.json"), JSON),
        f"{base}/getDokuman?id=1104187600": ok(fixture_bytes("yargitay/dokuman-1104187600.json"), JSON),
    }
    repo = InMemoryRepository()
    run, _ = _handler(routes, tmp_path, clock, repo)
    result = run({"source": "yargitay", "unit": "Hukuk Genel Kurulu", "year": 2024, "page": 1})
    assert result == {"listed": 5, "skipped": 0, "queued": 5, "next": True}
    payloads = _payloads(repo)
    nxt = [p for p in payloads if "page" in p]
    assert nxt == [{"source": "yargitay", "unit": "Hukuk Genel Kurulu", "year": 2024, "page": 2}]
    doc = next(p for p in payloads if p.get("id") == "1104187600")
    assert doc == {
        "source": "yargitay", "id": "1104187600", "unit": "Hukuk Genel Kurulu",
        "esas": "2024/812", "karar": "2024/660", "date": "2024-12-11",
    }  # fmt: skip
    out = run(doc)
    assert out["created"] is True
    rec = next(r for r in repo.records.values() if r["court"] == "Yargıtay")
    assert rec["source_key"] == "yargitay:hukuk-genel-kurulu:2024-812:2024-660" and rec["anonymized"] is False
    assert rec["protocol_status"] == "gerekli_yapilmadi"  # the plan asks for a protocol and none was applied for
    # the next sweep finds the decision known and queues one document fewer
    repo.jobs.clear()
    result2 = run({"source": "yargitay", "unit": "Hukuk Genel Kurulu", "year": 2024, "page": 1})
    assert result2["queued"] == 4


_DOC = {
    "source": "yargitay", "id": "1104187600", "unit": "Hukuk Genel Kurulu", "esas": "2024/812", "karar": "2024/660",
    "date": "2024-12-11",
}  # fmt: skip


@pytest.mark.parametrize("number", ["2024/817", "2019/1-123", "2024/2914/2", "2024/12(A)/10", "2024/1/0"])
def test_case_numbers_the_contract_accepts_do_not_go_dead(number: str, tmp_path: Path, clock) -> None:
    from core.jobs import payload_problem

    payload = {**_DOC, "karar": number}
    assert payload_problem(JobType.INGEST_FETCH, payload) is None  # the consumer lets it through
    base = yargitay.BASE
    routes = {
        f"{base}/robots.txt": ok(b'{"data":null,"metadata":{"FMTY":"ERROR"}}', JSON),
        f"{base}/getDokuman?id=1104187600": ok(fixture_bytes("yargitay/dokuman-1104187600.json"), JSON),
    }
    repo = InMemoryRepository()
    run, _ = _handler(routes, tmp_path, clock, repo)
    assert run(payload)["created"] is True  # and so does the handler (it raised BadJob for a trailing /n)


@pytest.mark.parametrize(
    "number",
    [
        "", "24/660", "2024/", "2024/660 E.", "2024/660/", "2024/660/a", "2024/660\n",
        "٢٠٢٤/660", "2024/٦٦٠", "2024/660/٢", "2024/" + "9" * 50,
    ],
)  # fmt: skip
def test_case_numbers_outside_the_contract_are_refused(number: str, tmp_path: Path, clock) -> None:
    from core.jobs import payload_problem

    payload = {**_DOC, "esas": number}
    assert payload_problem(JobType.INGEST_FETCH, payload) is not None
    repo = InMemoryRepository()
    run, transport = _handler({}, tmp_path, clock, repo)
    with pytest.raises(discovery.BadJob):
        run(payload)
    assert transport.calls == []


def test_discovery_case_number_pattern_is_the_contract_pattern() -> None:
    from pathlib import Path

    from connectors.judicial import case_number
    from core import jobs

    assert discovery._CASE_NO.pattern == jobs._CASE_NO.pattern
    contract = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "src" / "jobs.ts"
    assert r"/^[0-9]{4}\/[0-9A-Za-z()-]+(?:\/[0-9]+)?$/" in contract.read_text(encoding="utf-8")
    for number in ("2024/817", "2024/817/2", "2019/1-123"):
        assert case_number(number) == number and discovery._CASE_NO.match(number)


def test_danistay_list_job(tmp_path: Path, clock) -> None:
    base = danistay.BASE
    routes = {
        f"{base}/robots.txt": ok(b'{"data":null,"metadata":{"FMTY":"ERROR"}}', JSON),
        f"{base}/aramadetaylist": ok(fixture_bytes("danistay/liste-vddk-2024.json"), JSON),
    }
    repo = InMemoryRepository()
    run, _ = _handler(routes, tmp_path, clock, repo)
    result = run({"source": "danistay", "unit": "Vergi Dava Daireleri Kurulu", "year": 2024, "page": 1})
    assert result["listed"] == 3 and result["next"] is True
    # the duplicate row (same esas and karar) shares one dedupe key: queued once while it is waiting
    keys = [j["dedupe_key"] for j in repo.jobs if "id" in j["payload"]]
    assert len(keys) == 2 and len(set(keys)) == 2


def test_empty_ibk_list_queues_nothing(tmp_path: Path, clock) -> None:
    base = danistay.BASE
    routes = {
        f"{base}/robots.txt": NO_ROBOTS,
        f"{base}/aramadetaylist": ok(fixture_bytes("danistay/liste-ibk-bos.json"), JSON),
    }
    repo = InMemoryRepository()
    run, _ = _handler(routes, tmp_path, clock, repo)
    result = run({"source": "danistay", "unit": "İçtihatları Birleştirme Kurulu", "year": 2024, "page": 1})
    assert result == {"listed": 0, "skipped": 0, "queued": 0, "next": False}


def test_kvkk_and_rekabet_list_jobs(tmp_path: Path, clock) -> None:
    from connectors import kvkk, rekabet

    routes = {
        "https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS,
        kvkk.LIST_URL: ok(fixture_bytes("kvkk/liste.html")),
        "https://www.rekabet.gov.tr/robots.txt": NO_ROBOTS,
        rekabet.LIST_URL: ok(fixture_bytes("rekabet/son-kurul-kararlari.html")),
    }
    repo = InMemoryRepository()
    run, _ = _handler(routes, tmp_path, clock, repo)
    k = run({"source": "kvkk", "page": 1})
    assert k["listed"] == 6 and k["queued"] == 6 and k["next"] is True
    r = run({"source": "rekabet", "page": 1})
    assert r["next"] is False and r["queued"] == r["listed"] > 0
    payloads = _payloads(repo)
    assert {"source": "kvkk", "page": 2} in payloads
    assert all(p["url"].startswith("https://") for p in payloads if "url" in p)


def test_probe_reports_counts_and_error_rate_offline(tmp_path: Path, clock) -> None:
    from datetime import date

    from core.cli import probe
    from helpers import FakeTransport, public_resolver

    base = yargitay.BASE
    routes = {
        f"{base}/robots.txt": NO_ROBOTS,
        f"{base}/aramadetaylist": ok(fixture_bytes("yargitay/liste-hgk-2024.json"), JSON),
        f"{base}/getDokuman?id=1104181700": ok(fixture_bytes("yargitay/dokuman-1104187600.json"), JSON),
    }
    report = probe(
        "yargitay", env={}, transport=FakeTransport(routes), raw_dir=tmp_path / "raw", clock=clock,
        resolver=public_resolver,
    )  # fmt: skip
    assert report["outcome"] == "ok" and report["records"] == 1 and report["anonQueued"] == 1
    assert report["sample"]["total"] == 747 and report["sample"]["year"] == date.today().year - 1
    assert report["requests"] == 3 and report["errorRate"] == 0.0 and report["stopped"] is False
    assert probe("nope", env={})["outcome"] == "unknown source"


def test_probe_stops_at_a_captcha(tmp_path: Path, clock) -> None:
    from core.cli import probe
    from helpers import FakeTransport, public_resolver

    base = danistay.BASE
    routes = {
        f"{base}/robots.txt": NO_ROBOTS,
        f"{base}/aramadetaylist": ok(b'{"status":"EXCEPTION","detailMessage":"DisplayCaptcha"}', JSON),
    }
    transport = FakeTransport(routes)
    report = probe(
        "danistay", env={}, transport=transport, raw_dir=tmp_path / "raw", clock=clock, resolver=public_resolver
    )  # fmt: skip
    assert report["outcome"].startswith("ChallengeDetected") and report["stopped"] is True
    assert report["records"] == 0 and report["alerts"] == [{"source": "danistay", "challenge": "DisplayCaptcha"}]
    assert sum(1 for b in transport.bodies if b) == 1
