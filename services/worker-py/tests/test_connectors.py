"""Replayable parsing tests: every connector runs against recorded fixtures, offline."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from connectors.base import html_to_text
from connectors import crossref, eurlex, kvkk, mevzuat, openalex, rekabet, resmi_gazete
from core.errors import ParseError
from core.pipeline import InMemoryRepository, is_publishable
from helpers import NO_ROBOTS, build_fetcher, fixture_bytes, make_pdf, ok

NOW = datetime(2026, 10, 19, 3, 0, tzinfo=timezone.utc)


# --- Resmi Gazete -----------------------------------------------------------------------------------------
def test_rg_fihrist() -> None:
    issue = resmi_gazete.parse_fihrist(fixture_bytes("rg/20261016.htm"), "https://www.resmigazete.gov.tr/eskiler/2026/10/20261016.htm")
    assert issue.issue_date == date(2026, 10, 16)
    assert issue.issue_number == "33402"
    assert len(issue.entries) == 55
    first = issue.entries[0]
    assert first.section == "YASAMA BÖLÜMÜ" and first.category == "TBMM KARARI"
    assert first.url == "https://www.resmigazete.gov.tr/eskiler/2026/10/20261016-1.pdf"
    assert first.title.startswith("Kişisel Verileri Koruma Kurulu Üyelikleri")
    cats = {e.category for e in issue.entries}
    assert {"YÖNETMELİKLER", "TEBLİĞLER", "ANAYASA MAHKEMESİ KARARLARI"} <= cats
    titles = [e.title for e in issue.entries]
    assert any(t.startswith("154 kV") for t in titles)  # leading number of a real title is kept
    amending = resmi_gazete.amending_entries(issue)
    assert any("Kamu İhale Genel Tebliğinde Değişiklik" in e.title for e in amending)
    assert all(e.affects_mevzuat for e in amending)


def test_rg_connector_fetch(tmp_path: Path, clock) -> None:
    url = "https://www.resmigazete.gov.tr/eskiler/2026/10/20261016.htm"
    routes = {"https://www.resmigazete.gov.tr/robots.txt": NO_ROBOTS, url: ok(fixture_bytes("rg/20261016.htm"))}
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    issue, result = resmi_gazete.ResmiGazeteConnector(fetcher).fetch_issue(date(2026, 10, 16))
    assert len(issue.entries) == 55 and result.raw is not None


def test_rg_rejects_garbage() -> None:
    with pytest.raises(ParseError):
        resmi_gazete.parse_fihrist(b"<html>nope</html>", "https://www.resmigazete.gov.tr/x.htm")


# --- KVKK -------------------------------------------------------------------------------------------------
def test_kvkk_list() -> None:
    entries, pages = kvkk.parse_list(fixture_bytes("kvkk/liste.html").decode("utf-8"))
    assert len(entries) == 6
    last = entries[-1]
    assert last.karar_no == "2024/1393" and last.decision_date == date(2024, 8, 15)
    assert last.url == "https://www.kvkk.gov.tr/Icerik/8885/2024-1393"
    assert pages and pages[0].endswith("?page=1")


def test_kvkk_detail_to_record() -> None:
    url = "https://www.kvkk.gov.tr/Icerik/8881/2024-592"
    draft = kvkk.parse_detail(fixture_bytes("kvkk/detay-2024-592.html").decode("utf-8"), url, NOW)
    assert draft.type == "kurul_karari" and draft.court == kvkk.COURT
    assert draft.karar_no == "2024/592" and draft.decision_date == date(2024, 4, 18)
    assert draft.source_key == "kvkk:8881" and draft.source_url == url and draft.fetched_at == NOW
    assert draft.license_basis and "karar verilmiştir" in draft.text
    assert draft.requires_anonymization
    assert draft.dedupe.startswith("case:")


def test_kvkk_ingest_queues_anonymisation(tmp_path: Path, clock) -> None:
    detail = "https://www.kvkk.gov.tr/Icerik/8881/2024-592"
    routes = {"https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS, detail: ok(fixture_bytes("kvkk/detay-2024-592.html"))}
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    repo = InMemoryRepository()
    out = kvkk.KvkkConnector(fetcher).fetch_decision(detail, repo)
    assert out.created and out.anon_queued
    row = repo.records[out.record_id]
    assert row["anonymized"] is False and not is_publishable(row)
    assert repo.jobs == [{"type": "anon.run", "payload": {"recordId": out.record_id}, "dedupe_key": f"anon:{out.record_id}"}]
    assert all(j["type"] != "embed.chunks" for j in repo.jobs)
    assert repo.raws[0].sha256 and repo.raws[0].url == detail
    again = kvkk.KvkkConnector(fetcher).fetch_decision(detail, repo)  # idempotent
    assert not again.created and len(repo.records) == 1 and len(repo.jobs) == 1


def test_kvkk_layout_change_counts_as_error(tmp_path: Path, clock) -> None:
    detail = "https://www.kvkk.gov.tr/Icerik/1/x"
    routes = {"https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS, detail: ok(b"<html><body>redesigned</body></html>")}
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    with pytest.raises(ParseError):
        kvkk.KvkkConnector(fetcher).fetch_decision(detail, InMemoryRepository())
    assert fetcher.breaker.error_rate("kvkk") > 0


# --- Rekabet ----------------------------------------------------------------------------------------------
def test_rekabet_list_and_detail() -> None:
    entries = rekabet.parse_list(fixture_bytes("rekabet/son-kurul-kararlari.html").decode("utf-8"))
    assert len(entries) == 4
    assert entries[0].karar_no == "26-35/978-413" and entries[0].decision_date == date(2026, 9, 23)
    assert entries[0].karar_turu == "Birleşme ve Devralma"
    url = "https://www.rekabet.gov.tr/tr/SonKurulKarari/32b4d098-26c3-f111-9405-0050568585c9"
    draft = rekabet.parse_detail(fixture_bytes("rekabet/kurul-karari-detay.html").decode("utf-8"), url, NOW)
    assert draft.karar_no == "26-35/990-420" and draft.decision_date == date(2026, 9, 23)
    assert draft.court == "Rekabet Kurulu" and draft.source_key.startswith("rekabet:32b4d098")
    assert "izin verildi" in draft.text and draft.title.startswith("Shenzhen")


def test_rekabet_pdf_text_extraction() -> None:
    pdf = make_pdf(["Rekabet Kurulu karar metni", "Gerekce ve hukum bolumu"])
    text = rekabet.extract_pdf_text(pdf)
    assert "Rekabet Kurulu karar metni" in text and "Gerekce" in text
    with pytest.raises(ParseError):
        rekabet.extract_pdf_text(b"not a pdf")


def test_rekabet_decision_with_pdf_text(tmp_path: Path, clock) -> None:
    page = "https://www.rekabet.gov.tr/tr/SonKurulKarari/32b4d098-26c3-f111-9405-0050568585c9"
    pdf_url = "https://www.rekabet.gov.tr/Karar/test.pdf"
    routes = {
        "https://www.rekabet.gov.tr/robots.txt": ok(b"<html>site page</html>"),
        page: ok(fixture_bytes("rekabet/kurul-karari-detay.html")),
        pdf_url: ok(make_pdf(["Tam karar metni burada"]), "application/pdf"),
    }
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    repo = InMemoryRepository()
    out = rekabet.RekabetConnector(fetcher).fetch_decision(page, repo, pdf_url)
    assert "Tam karar metni burada" in repo.records[out.record_id]["text"]
    assert out.anon_queued


# --- Mevzuat ----------------------------------------------------------------------------------------------
META = mevzuat.LawMeta("9999", "Sentetik Örnek Kanun")


def _articles(name: str):
    return mevzuat.parse_articles(fixture_bytes(f"mevzuat/{name}").decode("utf-8"))


def test_mevzuat_article_parsing() -> None:
    arts = _articles("ornek-kanun-v1.txt")
    assert [a.label for a in arts] == ["Madde 1", "Madde 2", "Madde 3", "Madde 4", "Ek Madde 1", "Geçici Madde 1"]
    assert [a.heading for a in arts[:4]] == ["Amaç", "Kapsam", "Tanımlar", "Yürürlük"]
    assert "(2) İkinci fıkra" in arts[1].text and "Tanımlar" not in arts[1].text
    assert arts[2].text.endswith("ifade eder.")
    assert [a.key for a in arts][-2:] == ["ek1", "gecici1"]


def test_mevzuat_amendment_and_repeal_notes() -> None:
    arts = {a.label: a for a in _articles("ornek-kanun-v2.txt")}
    assert arts["Madde 2"].amended_by == "9998 sayılı Kanun (15/6/2026)"
    assert arts["Madde 2"].amended_date == date(2026, 6, 15)
    assert arts["Madde 4"].repealed
    assert not arts["Madde 1"].repealed


def test_mevzuat_version_snapshot_closes_old_version_and_opens_new() -> None:
    repo = InMemoryRepository()
    t1, t2 = date(2026, 1, 1), date(2026, 6, 15)
    for snap, name in ((t1, "v1"), (t2, "v2")):
        drafts = mevzuat.build_article_records(
            META, _articles(f"ornek-kanun-{name}.txt"), "https://www.mevzuat.gov.tr/x", NOW, snap
        )
        for d in drafts:
            from core.pipeline import ingest

            ingest(d, None, repo)
    rid = next(i for i, r in repo.records.items() if r["source_key"] == "mevzuat:9999:m2")
    chain = repo.versions[rid]
    assert len(chain) == 2
    assert (chain[0].valid_from, chain[0].valid_to) == (t1, date(2026, 6, 14))
    assert (chain[1].valid_from, chain[1].valid_to) == (t2, None)
    assert chain[1].amended_by == "9998 sayılı Kanun (15/6/2026)"
    unchanged = next(i for i, r in repo.records.items() if r["source_key"] == "mevzuat:9999:m1")
    assert len(repo.versions[unchanged]) == 1  # same text: no new version
    repealed = next(i for i, r in repo.records.items() if r["source_key"] == "mevzuat:9999:m4")
    assert repo.records[repealed]["status"] == "yururlukten_kalkti"
    assert all(r["anonymized"] for r in repo.records.values()) and not repo.jobs  # norms: no anonymisation job


def test_mevzuat_connector_fetch_wraps_html(tmp_path: Path, clock) -> None:
    text = fixture_bytes("mevzuat/ornek-kanun-v1.txt").decode("utf-8")
    html = "<html><body>" + "".join(f"<p>{ln}</p>" for ln in text.splitlines()) + "</body></html>"
    url = mevzuat.text_url(META)
    assert url.startswith("https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?")
    routes = {"https://www.mevzuat.gov.tr/robots.txt": ok(b"User-agent: Googlebot\nNoindex:/x\n", "text/plain"), url: ok(html.encode())}
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    repo = InMemoryRepository()
    outs = mevzuat.MevzuatConnector(fetcher).fetch_law(META, repo, date(2026, 1, 1))
    assert len(outs) == 7  # law record plus six articles
    assert repo.records[outs[0].record_id]["source_key"] == "mevzuat:9999"
    # users get the page address, not the iframe document the text was read from
    assert repo.records[outs[0].record_id]["source_url"] == mevzuat.law_url(META)


def test_mevzuat_bold_label_layout_of_the_text_document() -> None:
    """Layout reported on 2026-11-15 for the iframe document (bold labels and headings, footnote markers).
    SYNTHETIC markup: the raw bytes could not be fetched from the development network."""
    html = (
        "<html><body><p><b>ÖRNEK KANUN</b></p><p><b>BİRİNCİ BÖLÜM</b></p><p><b>Amaç</b></p>"
        "<p><b>MADDE 1-</b> (1) Bu Kanunun amacı örnektir.</p>"
        "<p><b>Tanımlar</b></p>"
        "<p><b>MADDE 2-</b> (Değişik: 2/3/2024-7499/33 md.) (1) Tanımlar şunlardır:"
        '<a href="#_ftn1">[1]</a></p><p>a) Birinci tanım,</p><p>b) İkinci tanım.</p>'
        "<p><b>MADDE 3-</b> (Mülga: 2/3/2024-7499/34 md.)</p></body></html>"
    )
    arts = mevzuat.parse_articles(html_to_text(html))
    assert [a.label for a in arts] == ["Madde 1", "Madde 2", "Madde 3"]
    assert arts[0].heading == "Amaç" and arts[1].heading == "Tanımlar"
    assert arts[1].amended_by == "7499 sayılı Kanun (2/3/2024)" and "b) İkinci tanım." in arts[1].text
    assert arts[2].repealed


# --- OpenAlex and Crossref ---------------------------------------------------------------------------------
def test_openalex_work() -> None:
    data = json.loads(fixture_bytes("openalex/work-nature12373.json"))
    draft = openalex.parse_work(data, NOW)
    assert draft.type == "makale" and draft.license_basis == "CC0 (OpenAlex verisi)"
    assert draft.source_key == "openalex:W2159974629" and draft.openalex_cited_by == data["cited_by_count"]
    assert draft.extra["work"]["doi"] == "10.1038/nature12373" and draft.extra["work"]["authors"]
    assert not draft.requires_anonymization


def test_openalex_abstract_rebuild_and_doi_guard() -> None:
    assert openalex.rebuild_abstract({"b": [1], "a": [0], "c": [2]}) == "a b c"
    with pytest.raises(ValueError):
        openalex.work_url_for_doi("10.1/../../etc?x=1 y")


def test_openalex_key_goes_in_header_not_url(tmp_path: Path, clock) -> None:
    url = "https://api.openalex.org/works/https://doi.org/10.1038/nature12373"
    routes = {"https://api.openalex.org/robots.txt": ok(b"User-agent: *\nAllow: /\n", "text/plain"), url: ok(fixture_bytes("openalex/work-nature12373.json"), "application/json")}
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    repo = InMemoryRepository()
    openalex.OpenAlexConnector(fetcher, api_key="test-key-not-real").fetch_by_doi("10.1038/nature12373", repo)
    call_url, headers = transport.calls[-1]
    assert "test-key-not-real" not in call_url and headers["Authorization"] == "Bearer test-key-not-real"
    assert len(repo.works) == 1


def test_crossref_work(tmp_path: Path, clock) -> None:
    payload = json.loads(fixture_bytes("crossref/work-nature12373.json"))
    draft = crossref.parse_work(payload, NOW)
    assert draft.source_key == "crossref:10.1038/nature12373" and draft.extra["work"]["year"] == 2013
    assert draft.extra["work"]["authors"] and draft.source_url == "https://doi.org/10.1038/nature12373"
    with pytest.raises(ParseError):
        crossref.parse_work({"status": "failed"}, NOW)
    url = "https://api.crossref.org/works/10.1038/nature12373"
    routes = {"https://api.crossref.org/robots.txt": NO_ROBOTS, url: ok(fixture_bytes("crossref/work-nature12373.json"), "application/json")}
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    repo = InMemoryRepository()
    out = crossref.CrossrefConnector(fetcher).fetch_by_doi("10.1038/nature12373", repo)
    assert out.created and not out.anon_queued


# --- EUR-Lex / CELLAR -------------------------------------------------------------------------------------
def test_eurlex_articles_and_act() -> None:
    markup = fixture_bytes("eurlex/32016R0679-ilk2.xhtml").decode("utf-8")
    arts = eurlex.parse_articles(markup)
    assert [a[0] for a in arts] == ["1", "2"]
    assert arts[0][1] == "Subject-matter and objectives"
    draft = eurlex.parse_act("32016R0679", markup, NOW)
    assert draft.jurisdiction == "EU" and draft.type == "ab_hukuku"
    assert draft.authority_class == "karsilastirmali"  # plan Ek F, never binding for Türkiye
    assert draft.source_url == "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679"
    assert "protection of natural persons" in draft.text
    assert draft.license_basis == "AB yeniden kullanım kararı (2011/833/AB)"


def test_eurlex_only_selected_acts_and_cellar_redirect(tmp_path: Path, clock) -> None:
    from core.fetcher import Response

    final = "https://publications.europa.eu/resource/cellar/3e485e15-11bd-11e6-ba9a-01aa75ed71a1.0006.03/DOC_1"
    routes = {
        "https://publications.europa.eu/robots.txt": ok(b"User-agent: *\nAllow: /\nDisallow: /s/*\n", "text/plain"),
        "https://publications.europa.eu/resource/celex/32016R0679": Response(302, {"location": final.replace("https", "http")}, b"", ""),
        final: ok(fixture_bytes("eurlex/32016R0679-ilk2.xhtml"), "application/xhtml+xml"),
    }
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    repo = InMemoryRepository()
    eurlex.EurLexConnector(fetcher).fetch_act("32016R0679", repo)
    assert len(repo.records) == 1
    with pytest.raises(ValueError):
        eurlex.EurLexConnector(fetcher).fetch_act("32000R0001", repo)
    with pytest.raises(ValueError):
        eurlex.cellar_url("../../etc/passwd")
