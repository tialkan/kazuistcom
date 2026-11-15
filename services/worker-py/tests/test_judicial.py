"""AYM, Yargitay and Danistay connectors: replay of real responses recorded on 2026-11-15, offline.

The fixtures are real service answers (personal names removed from the AYM ones). The CAPTCHA answer is
synthetic: its shape (status EXCEPTION, detailMessage DisplayCaptcha) is taken from the sites' own page script.
"""

from __future__ import annotations

import base64
import json
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from connectors import aym, danistay, yargitay
from connectors.judicial import decision_html_to_text, slug
from core.challenge import looks_like_challenge
from core.errors import ChallengeDetected, HttpError, ParseError, SourceDisabled
from core.fetcher import Response
from core.pipeline import InMemoryRepository, is_publishable
from core.sources import SourceRegistry
from helpers import ALL_ON, NO_ROBOTS, build_fetcher, fixture_bytes, ok

NOW = datetime(2026, 11, 15, 3, 0, tzinfo=timezone.utc)
JSON = "application/json"
CAPTCHA_ANSWER = json.dumps(
    {"status": "EXCEPTION", "detailMessage": "DisplayCaptcha", "data": None}
).encode()


# --- shared text extraction -------------------------------------------------------------------------------
def test_decision_text_folds_word_wrapping_and_keeps_rows() -> None:
    markup = (
        "<html><head><style>p{color:red}</style><title>x</title></head><body>"
        "<p>Birinci satır\nikinci satır aynı paragraf</p>"
        "<table><tr><td><p>Başvurucu</p></td><td><p>:</p></td><td><p>A. B.</p></td></tr></table>"
        "<p>Son paragraf burada ve yeterince uzun bir metindir.</p></body></html>"
    )
    text = decision_html_to_text(markup)
    assert text.splitlines()[0] == "Birinci satır ikinci satır aynı paragraf"
    assert "Başvurucu : A. B." in text.splitlines()
    assert "color:red" not in text and "<" not in text


def test_decision_text_empty_raises() -> None:
    with pytest.raises(ParseError):
        decision_html_to_text("<html><body><p> </p></body></html>")


def test_slug() -> None:
    assert slug("İçtihadı Birleştirme Büyük Genel Kurulu") == "ictihadi-birlestirme-buyuk-genel-kurulu"


# --- AYM --------------------------------------------------------------------------------------------------
def test_aym_list_bireysel_filters_merits_and_drops_applicant_name() -> None:
    page = aym.parse_search(fixture_bytes("aym/bb-liste.json"), aym.BB)
    assert page.total == 18003 and page.page == 50 and page.page_size == 100
    assert len(page.items) == 6
    merits = [i for i in page.items if i.is_merits]
    assert len(merits) == 4
    assert {i.result for i in merits} == {"Esas (İhlal)", "Esas (İhlal Olmadığı)"}
    assert any(not i.is_merits for i in page.items)  # "Kabul Edilemezlik vd." is skipped
    assert not hasattr(page.items[0], "basvuru_adi")
    assert all(i.basvuru_no and i.decision_date for i in page.items)


def test_aym_list_norm_denetimi_all_count() -> None:
    page = aym.parse_search(fixture_bytes("aym/nd-liste.json"), aym.ND)
    assert page.total == 5620 and len(page.items) == 2
    assert all(i.is_merits and i.esas_no and i.karar_no for i in page.items)
    assert page.items[0].esas_no == "2024/159" and page.items[0].karar_no == "2024/152"


def test_aym_bireysel_decision_to_record() -> None:
    draft = aym.parse_decision(fixture_bytes("aym/bb-karar.json"), aym.BB, NOW, "gerekmez")
    assert draft.type == "karar" and draft.court == "Anayasa Mahkemesi"
    assert draft.chamber == "İkinci Bölüm"
    assert draft.esas_no == "2013/7455" and draft.karar_no is None
    assert draft.decision_date == date(2015, 3, 25)
    assert draft.title == "Anayasa Mahkemesi, İkinci Bölüm, B. No: 2013/7455 (25.03.2015)"
    assert draft.authority_class == "yuksek_emsal"
    assert draft.source_key.startswith("aym:bb:") and draft.requires_anonymization
    # the page's own address: base64url of "kbb:<uuid>"
    token = draft.source_url.split("id=")[1].split("&")[0]
    assert base64.urlsafe_b64decode(token + "==").decode().startswith("kbb:")
    assert draft.license_basis and draft.fetched_at == NOW
    # Word markup is gone, the structure is kept
    assert "mso-" not in draft.text and "<!--" not in draft.text and "LatentStyles" not in draft.text
    assert "I. BAŞVURUNUN KONUSU" in draft.text
    assert any(ln.startswith("Başkan :") for ln in draft.text.splitlines())
    # the title is indexed: no applicant name may be in it
    assert "[ANONİM]" not in draft.title and "ÖZDEMİR" not in draft.title


def test_aym_norm_decision_to_record() -> None:
    draft = aym.parse_decision(fixture_bytes("aym/nd-karar.json"), aym.ND, NOW)
    assert draft.esas_no == "2015/66" and draft.karar_no == "2015/66"
    assert draft.decision_date == date(2015, 7, 13)
    assert draft.authority_class == "baglayici_karar" and draft.chamber is None
    assert draft.title == "Anayasa Mahkemesi, E. 2015/66, K. 2015/66 (13.07.2015)"
    assert draft.source_key.startswith("aym:nd:")
    assert len(draft.text) > 1000


def test_aym_parse_errors() -> None:
    with pytest.raises(ParseError):
        aym.parse_search(b"<html>spa shell</html>", aym.BB)
    with pytest.raises(ParseError):
        aym.parse_decision(json.dumps({"total": 0, "data": []}).encode(), aym.BB, NOW)
    row = json.loads(fixture_bytes("aym/bb-karar.json"))
    row["data"][0]["icerik"] = ""
    with pytest.raises(ParseError):
        aym.parse_decision(json.dumps(row).encode(), aym.BB, NOW)
    with pytest.raises(ValueError):
        aym.list_body("Baska", 1)


def _aym_routes(**extra):
    robots = {f"https://{h}/robots.txt": NO_ROBOTS for h in ("kararlarbilgibankasi.anayasa.gov.tr", "normkararlarbilgibankasi.anayasa.gov.tr")}
    return {**robots, **extra}


def test_aym_connector_flow_posts_json_and_queues_anonymisation(tmp_path: Path, clock) -> None:
    uuid = json.loads(fixture_bytes("aym/bb-karar.json"))["data"][0]["id"]
    url = aym.search_url(aym.BB)
    routes = _aym_routes(
        **{url: lambda body: ok(fixture_bytes("aym/bb-liste.json") if b'"size":100' in body else fixture_bytes("aym/bb-karar.json"), JSON)}
    )
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    conn = aym.AymConnector(fetcher)
    page = conn.list_page(aym.BB, 50)
    assert page.total == 18003
    repo = InMemoryRepository()
    out = conn.fetch_decision(aym.BB, uuid, repo)
    assert out.created and out.anon_queued
    row = repo.records[out.record_id]
    assert row["anonymized"] is False and row["masked_text"] is None and not is_publishable(row)
    assert [j["type"] for j in repo.jobs] == ["anon.run"]
    # request shape: honest identity, JSON body, no borrowed origin
    posts = [(u, h, b) for (u, h), b in zip(transport.calls, transport.bodies) if b is not None]
    assert json.loads(posts[0][2]) == {"kararTipi": "BireyselBasvuru", "page": 50, "size": 100}
    assert json.loads(posts[1][2]) == {"kararTipi": "BireyselBasvuru", "id": uuid, "page": 1, "size": 1}
    for _, headers, _ in posts:
        assert headers["User-Agent"].startswith("KazuistBot/1.0")
        assert "Origin" not in headers and "Referer" not in headers
    # the list page is not archived (applicant names); the decision is
    assert len(repo.raws) == 1 and repo.raws[0].external_id == f"aym:BireyselBasvuru:{uuid}"
    assert repo.raws[0].sha256 and repo.raws[0].url == url


def test_aym_norm_uses_norm_host(tmp_path: Path, clock) -> None:
    url = aym.search_url(aym.ND)
    assert url.startswith("https://normkararlarbilgibankasi.anayasa.gov.tr/")
    fetcher, _ = build_fetcher(_aym_routes(**{url: ok(fixture_bytes("aym/nd-liste.json"), JSON)}), tmp_path, clock)
    assert aym.AymConnector(fetcher).list_page(aym.ND, 1, 2).total == 5620


def test_aym_layout_change_counts_as_error(tmp_path: Path, clock) -> None:
    url = aym.search_url(aym.BB)
    fetcher, _ = build_fetcher(_aym_routes(**{url: ok(b"<html>new layout</html>", "text/html")}), tmp_path, clock)
    with pytest.raises(ParseError):
        aym.AymConnector(fetcher).list_page(aym.BB, 1)
    assert fetcher.breaker.error_rate("aym") > 0


# --- Yargitay ---------------------------------------------------------------------------------------------
def test_yargitay_list_and_document() -> None:
    page = yargitay.parse_search(fixture_bytes("yargitay/liste-hgk-2024.json"))
    assert page.total == 747 and len(page.items) == 5
    first = page.items[0]
    assert (first.id, first.unit, first.esas_no, first.karar_no) == ("1104181700", "Hukuk Genel Kurulu", "2024/817", "2024/735")
    assert first.decision_date == date(2024, 12, 18)
    item = page.items[4]
    draft = yargitay.parse_document(fixture_bytes("yargitay/dokuman-1104187600.json"), item, NOW)
    assert draft.title == "Yargıtay Hukuk Genel Kurulu, E. 2024/812, K. 2024/660 (11.12.2024)"
    assert draft.court == "Yargıtay" and draft.chamber == "Hukuk Genel Kurulu"
    assert draft.authority_class == "yuksek_emsal" and draft.requires_anonymization
    assert draft.source_key == "yargitay:hukuk-genel-kurulu:2024-812:2024-660"
    assert draft.source_url == "https://karararama.yargitay.gov.tr/getDokuman?id=1104187600"
    assert "İNCELENEN KARARIN" in draft.text and "<" not in draft.text


def test_yargitay_ibk_is_binding_and_renamed() -> None:
    page = yargitay.parse_search(fixture_bytes("yargitay/liste-bgk.json"))
    assert page.total == 40 and len(page.items) == 3
    draft = yargitay.parse_document(fixture_bytes("yargitay/dokuman-1104187600.json"), page.items[0], NOW)
    assert draft.chamber == "İçtihadı Birleştirme Büyük Genel Kurulu"
    assert draft.authority_class == "baglayici_karar"
    assert yargitay.authority_for("2. Hukuk Dairesi") == "emsal"


def test_yargitay_error_envelope_is_parse_error() -> None:
    err = json.dumps({"data": None, "metadata": {"FMTY": "ERROR", "FMC": "ADALET_RUNTIME_EXCEPTION"}}).encode()
    with pytest.raises(ParseError):
        yargitay.parse_search(err)
    item = yargitay.parse_search(fixture_bytes("yargitay/liste-hgk-2024.json")).items[0]
    with pytest.raises(ParseError):
        yargitay.parse_document(err, item, NOW)
    with pytest.raises(ParseError):
        yargitay.parse_search(json.dumps({"data": {"data": [{"id": "x"}], "recordsTotal": 1}}).encode())


def test_yargitay_connector_flow(tmp_path: Path, clock) -> None:
    base = yargitay.BASE
    routes = {
        f"{base}/robots.txt": ok(b'{"data":null,"metadata":{"FMTY":"ERROR"}}', JSON),  # not a robots file
        f"{base}/aramadetaylist": ok(fixture_bytes("yargitay/liste-hgk-2024.json"), JSON),
        f"{base}/getDokuman?id=1104187600": ok(fixture_bytes("yargitay/dokuman-1104187600.json"), JSON),
    }
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    conn = yargitay.YargitayConnector(fetcher)
    page = conn.list_page("Hukuk Genel Kurulu", 2024, 1)
    repo = InMemoryRepository()
    out = conn.fetch_decision(page.items[4], repo)
    assert out.anon_queued and repo.records[out.record_id]["anonymized"] is False
    body = next(json.loads(b) for b in transport.bodies if b)
    assert body["data"]["birimYrgKurulDaire"] == "Hukuk Genel Kurulu" and body["data"]["kararYil"] == "2024"
    assert body["data"]["pageSize"] == 10
    assert len(repo.raws) == 1  # the document, not the list
    # repeat: the same document does not create a second record
    again = conn.fetch_decision(page.items[4], repo)
    assert not again.created


def test_yargitay_captcha_stops_source_and_nothing_is_retried(tmp_path: Path, clock) -> None:
    base = yargitay.BASE
    routes = {
        f"{base}/robots.txt": NO_ROBOTS,
        f"{base}/aramadetaylist": ok(CAPTCHA_ANSWER, JSON),
    }
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    conn = yargitay.YargitayConnector(fetcher)
    with pytest.raises(ChallengeDetected):
        conn.list_page("Hukuk Genel Kurulu", 2024, 1)
    posts = sum(1 for b in transport.bodies if b)
    assert posts == 1  # no retry
    assert fetcher.alerts[-1] == {"source": "yargitay", "challenge": "DisplayCaptcha"}
    assert fetcher.registry.status()[-1]["source"] == "yargitay"
    assert not fetcher.registry.is_enabled("yargitay")
    with pytest.raises(SourceDisabled):
        conn.list_page("Hukuk Genel Kurulu", 2024, 2)
    assert sum(1 for b in transport.bodies if b) == 1  # still one request
    assert not (tmp_path / "raw").exists()  # the challenge answer was not archived


# --- Danistay ---------------------------------------------------------------------------------------------
def test_danistay_list_and_document() -> None:
    page = danistay.parse_search(fixture_bytes("danistay/liste-iddk-2024.json"))
    assert page.total == 3491 and len(page.items) == 5
    item = page.items[2]
    assert (item.id, item.unit, item.esas_no, item.karar_no) == ("1134943400", "İdare Dava Daireleri Kurulu", "2024/2942", "2024/3389")
    draft = danistay.parse_document(fixture_bytes("danistay/dokuman-1134943400.html"), item, NOW)
    assert draft.chamber == "İdari Dava Daireleri Kurulu"  # same name as plan Ek F and the authority classifier
    assert draft.title == "Danıştay İdari Dava Daireleri Kurulu, E. 2024/2942, K. 2024/3389 (16.12.2024)"
    assert draft.authority_class == "yuksek_emsal" and draft.court == "Danıştay"
    assert draft.source_key == "danistay:idari-dava-daireleri-kurulu:2024-2942:2024-3389"
    assert "TÜRK MİLLETİ ADINA" in draft.text and "&lt;" not in draft.text and "<br" not in draft.text
    assert draft.requires_anonymization


def test_danistay_duplicate_rows_collapse_to_one_record() -> None:
    page = danistay.parse_search(fixture_bytes("danistay/liste-vddk-2024.json"))
    assert page.total == 1012
    a, b = page.items[0], page.items[1]
    assert (a.esas_no, a.karar_no) == (b.esas_no, b.karar_no) and a.id != b.id
    body = fixture_bytes("danistay/dokuman-1134943400.html")
    da, db = (danistay.parse_document(body, i, NOW) for i in (a, b))
    assert da.source_key == db.source_key and da.authority_class == "yuksek_emsal"


def test_danistay_ibk_empty_list_is_valid() -> None:
    page = danistay.parse_search(fixture_bytes("danistay/liste-ibk-bos.json"))
    assert page.total == 0 and page.items == []
    assert danistay.authority_for("İçtihatları Birleştirme Kurulu") == "baglayici_karar"


def test_danistay_document_without_hidden_paragraph_is_parse_error() -> None:
    item = danistay.parse_search(fixture_bytes("danistay/liste-iddk-2024.json")).items[0]
    with pytest.raises(ParseError):
        danistay.parse_document(b"<html><body>no decision</body></html>", item, NOW)


def test_danistay_connector_flow(tmp_path: Path, clock) -> None:
    base = danistay.BASE
    routes = {
        f"{base}/robots.txt": ok(b'{"data":null,"metadata":{"FMTY":"ERROR"}}', JSON),
        f"{base}/aramadetaylist": ok(fixture_bytes("danistay/liste-iddk-2024.json"), JSON),
        f"{base}/getDokuman?id=1134943400&arananKelime=": ok(fixture_bytes("danistay/dokuman-1134943400.html")),
    }
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    conn = danistay.DanistayConnector(fetcher)
    page = conn.list_page("İdare Dava Daireleri Kurulu", 2024, 1)
    repo = InMemoryRepository()
    out = conn.fetch_decision(page.items[2], repo)
    assert out.anon_queued
    body = next(json.loads(b) for b in transport.bodies if b)
    assert body["data"]["daire"] == "İdare Dava Daireleri Kurulu" and body["data"]["kararYil"] == "2024"


# --- fetcher: POST, challenge, rate -----------------------------------------------------------------------
def test_real_responses_are_not_mistaken_for_challenges() -> None:
    page = fixture_bytes("danistay/dokuman-1134943400.html")
    assert looks_like_challenge(200, {"content-type": "text/html;charset=UTF-8"}, page) is None
    for name in ("yargitay/liste-hgk-2024.json", "yargitay/dokuman-1104187600.json", "aym/bb-karar.json"):
        assert looks_like_challenge(200, {"content-type": JSON}, fixture_bytes(name)) is None


@pytest.mark.parametrize(
    ("headers", "body", "reason"),
    [
        ({"content-type": JSON}, b'{"detailMessage":"reCaptchaTimeout"}', "reCaptchaTimeout"),
        ({"content-type": "text/html"}, b"<html><div class='g-recaptcha'></div></html>", "g-recaptcha"),
        ({"content-type": "text/html"}, b"<title>Just a moment...</title>", "just a moment..."),
        ({"cf-mitigated": "challenge", "content-type": "text/html"}, b"x", "cf-mitigated"),
    ],
)
def test_challenge_markers(headers: dict, body: bytes, reason: str) -> None:
    assert looks_like_challenge(403, headers, body) == reason


def test_challenge_check_ignores_long_html_documents() -> None:
    big = b"<html>" + b"a" * 70000 + b" g-recaptcha </html>"
    assert looks_like_challenge(200, {"content-type": "text/html"}, big) is None


def test_get_challenge_also_stops_the_source(tmp_path: Path, clock) -> None:
    url = "https://www.kvkk.gov.tr/Icerik/1/x"
    routes = {
        "https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS,
        url: Response(403, {"content-type": "text/html", "cf-mitigated": "challenge"}, b"blocked", ""),
    }
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    with pytest.raises(ChallengeDetected):
        fetcher.fetch("kvkk", url)
    assert not fetcher.registry.is_enabled("kvkk")


def test_post_is_not_replayed_across_a_redirect(tmp_path: Path, clock) -> None:
    base = yargitay.BASE
    routes = {
        f"{base}/robots.txt": NO_ROBOTS,
        f"{base}/aramadetaylist": Response(302, {"location": "https://evil.example.com/x"}, b"", ""),
    }
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    with pytest.raises(HttpError):
        fetcher.fetch("yargitay", f"{base}/aramadetaylist", json_body={"data": {}}, external_id="x")
    assert all("evil.example.com" not in u for u, _ in transport.calls)


@pytest.mark.parametrize("source", ["aym", "yargitay", "danistay"])
def test_rate_limit_is_half_a_request_per_second(source: str, tmp_path: Path, clock) -> None:
    host = {"aym": "kararlarbilgibankasi.anayasa.gov.tr", "yargitay": "karararama.yargitay.gov.tr", "danistay": "karararama.danistay.gov.tr"}[source]
    routes = {f"https://{host}/robots.txt": NO_ROBOTS, f"https://{host}/p": lambda body: ok(b"{}", JSON)}
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    for n in range(4):
        fetcher.fetch(source, f"https://{host}/p", json_body={"n": n}, external_id=f"t{n}")
    # robots.txt and four posts are five requests: the first goes at once, each next one 2 seconds later
    assert fetcher.requests_made[source] == 5
    assert clock.sleeps == [2.0, 2.0, 2.0, 2.0]


# --- source registry --------------------------------------------------------------------------------------
def test_new_sources_load_unapproved_and_off_by_default() -> None:
    reg = SourceRegistry.load(env={})
    for name in ("aym", "yargitay", "danistay"):
        cfg = reg.get(name)
        assert cfg.approved is False and cfg.rps == 0.5 and cfg.license_basis
        assert not reg.is_enabled(name)
    assert reg.get("aym").record_protocol_status == "gerekmez"
    assert reg.get("yargitay").protocol_status == "gerekli_yapilmadi"
    # migration 0008 added the value to the protocol_status enum: records carry the source's own status
    assert reg.get("yargitay").record_protocol_status == "gerekli_yapilmadi"
    assert reg.get("danistay").record_protocol_status == "gerekli_yapilmadi"
    prod = SourceRegistry.load(env={**ALL_ON, "KAZUIST_ENV": "production"})
    for name in ("aym", "yargitay", "danistay"):
        assert not prod.is_enabled(name)  # switch on, but Tarik approval is missing
    assert "kararlarbilgibankasi.anayasa.gov.tr" in prod.all_hosts()


def test_record_protocol_statuses_match_the_database_enum() -> None:
    import re
    from pathlib import Path

    from core.sources import RECORD_PROTOCOL_STATUSES, SOURCE_PROTOCOL_STATUSES

    schema = Path(__file__).resolve().parents[3] / "packages" / "db" / "src" / "schema" / "corpus.ts"
    block = re.search(r"pgEnum\('protocol_status', \[(.*?)\]", schema.read_text(encoding="utf-8"), re.S)
    assert block
    assert set(re.findall(r"'([^']+)'", block.group(1))) == set(RECORD_PROTOCOL_STATUSES)
    assert set(SOURCE_PROTOCOL_STATUSES) <= set(RECORD_PROTOCOL_STATUSES)
    assert "gerekli_yapilmadi" in RECORD_PROTOCOL_STATUSES
