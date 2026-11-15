"""High court members and open sources (plan Ek E), run on the real AYM, Yargitay and Danistay answers
recorded by the connectors (tests/fixtures, 2026-11-15). Every name written in this file is SYNTHETIC. Names
and text read from the fixtures are only counted: assertions compare precomputed numbers and flags, so a
failure report (pytest shows the operands) never carries decision text into a log."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List

import pytest

from anonymizer.pipeline import anonymize
from anonymizer.policy import court_key, default_policy, load_policy, source_namespace
from anonymizer.public_names import index_text
from anonymizer.roles import find_cued_persons, find_panel_members
from connectors import aym, danistay, yargitay

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures"
NOW = datetime(2026, 11, 15, tzinfo=timezone.utc)
PARTY_ROLES = {"davaci", "davali", "basvurucu", "sanik", "magdur", "katilan", "musteki", "tanik", "bilirkisi",
               "arabulucu", "vekil", "cocuk", "kisi"}


def _bytes(rel: str) -> bytes:
    return (FIXTURES / rel).read_bytes()


def _aym_bb():
    return aym.parse_decision(_bytes("aym/bb-karar.json"), aym.BB, NOW)


def _aym_nd():
    return aym.parse_decision(_bytes("aym/nd-karar.json"), aym.ND, NOW)


def _yargitay():
    item = yargitay.parse_search(_bytes("yargitay/liste-hgk-2024.json")).items[4]
    return yargitay.parse_document(_bytes("yargitay/dokuman-1104187600.json"), item, NOW)


def _danistay():
    item = danistay.parse_search(_bytes("danistay/liste-iddk-2024.json")).items[2]
    return danistay.parse_document(_bytes("danistay/dokuman-1134943400.html"), item, NOW)


def _names(text: str, spans) -> List[str]:
    return [text[s.start : s.end] for s in spans]


def _person_spans(result):
    return [s for s in result.spans if s.entity == "PERSON"]


def _shown(names: List[str], text: str) -> int:
    """How many of `names` occur in `text` (a count, so a failing assertion prints no name)."""
    return sum(1 for n in names if n in text)


def _roles(spans) -> List[str]:
    return sorted({s.role or "" for s in spans})


# --- matching a record to an open source --------------------------------------------------------------------
def test_open_source_matches_court_names_and_source_key_namespace() -> None:
    p = default_policy()
    for court in ("Anayasa Mahkemesi", "ANAYASA MAHKEMESİ", "anayasa  mahkemesi", "T.C. Anayasa Mahkemesi",
                  "Türkiye Cumhuriyeti Anayasa Mahkemesi", "AYM"):
        assert p.open_source_for(court=court) == "AYM", court
    assert p.open_source_for(source_key="aym:bb:817f0b47-acf1-0404-a1b2-000000000000") == "AYM"
    # the namespace the connector wrote wins over a court name
    assert p.open_source_for(court="Yargıtay", source_key="aym:nd:x") == "AYM"
    for court in ("Avrupa İnsan Hakları Mahkemesi", "AİHM", "AIHM", "European Court of Human Rights"):
        assert p.open_source_for(court=court) == "AİHM", court
    for court in ("Avrupa Birliği Adalet Divanı", "ABAD", "Court of Justice of the European Union"):
        assert p.open_source_for(court=court) == "ABAD", court
    # equality only: other constitutional courts, the ICJ, prefixes and look alike namespaces do not match
    for court in ("Alman Federal Anayasa Mahkemesi", "Uluslararası Adalet Divanı",
                  "Anayasa Mahkemesi Raportörü", "Yargıtay", "Danıştay", "Ankara 3. Asliye Hukuk Mahkemesi",
                  "", None):
        assert p.open_source_for(court=court) is None, court
    for key in ("aymx:bb:1", "yargitay:hukuk-genel-kurulu:2024-812:2024-660", "aym", "", None):
        assert p.open_source_for(source_key=key) is None, key


def test_court_key_and_namespace_normalisation() -> None:
    assert court_key("ANAYASA MAHKEMESİ") == court_key("Anayasa Mahkemesi") == "anayasa mahkemesi"
    assert court_key("T.C.  Anayasa Mahkemesi") == "tc anayasa mahkemesi"
    assert court_key("AİHM") == court_key("AIHM") == court_key("aihm")
    assert court_key("Danıştay") == court_key("DANIŞTAY") == "danistay"
    assert source_namespace("aym:bb:1") == "aym" and source_namespace("AYM:nd:2") == "aym"
    assert source_namespace("aym") == ""


def test_open_source_match_must_name_a_listed_source(tmp_path: Path) -> None:
    text = (Path(__file__).resolve().parents[1] / "policy.yaml").read_text(encoding="utf-8")
    bad = tmp_path / "policy.yaml"
    bad.write_text(text.replace("      ABAD:\n", "      UAD:\n"), encoding="utf-8")
    with pytest.raises(ValueError):
        load_policy(bad)
    bad.write_text(text.replace("source_keys: [aym]", "source_keys: [\"aym:bb\"]"), encoding="utf-8")
    with pytest.raises(ValueError):
        load_policy(bad)


# --- AYM, real decisions ---------------------------------------------------------------------------------
def test_aym_individual_application_keeps_the_listed_panel_and_masks_the_rapporteur() -> None:
    d = _aym_bb()
    assert d.court == "Anayasa Mahkemesi" and d.source_key.startswith("aym:bb:")
    panel = find_panel_members(d.text)
    members = _names(d.text, panel)
    assert len(members) == 5  # Başkan and four Üyeler, one of them on the "Üyeler :" line, three below it
    rapporteur = [s for s in find_cued_persons(d.text) if s.role == "raportor"]
    assert len(rapporteur) == 1

    rapporteur_name = [d.text[rapporteur[0].start : rapporteur[0].end]]
    both = {"court": d.court, "source_key": d.source_key}
    for kw in ({"court": d.court}, {"source_key": d.source_key}, both):
        r = anonymize(d.text, **kw)
        assert r.open_source == "AYM"
        assert _shown(members, r.masked_text) == 5 and _shown(rapporteur_name, r.masked_text) == 0
        assert [s.mask for s in _person_spans(r)] == ["[Raportör]"]
        has_label = "Raportör : [Raportör]" in r.masked_text
        assert has_label
        # no party role cue is left in front of a readable name
        assert _roles(find_cued_persons(r.masked_text)) == ["hakim"]
        assert r.publishable

    # the same text from a court that is not an open source: the whole panel is masked
    for kw in ({}, {"court": "Yargıtay"}, {"court": "Alman Federal Anayasa Mahkemesi"}):
        r = anonymize(d.text, **kw)
        assert r.open_source is None
        assert _shown(members + rapporteur_name, r.masked_text) == 0
        assert len(find_panel_members(r.masked_text)) == 0 and len(find_cued_persons(r.masked_text)) == 0
        assert len(_person_spans(r)) == 6
        has_labels = "Başkan : [Hâkim 1]" in r.masked_text and "Raportör : [Raportör]" in r.masked_text
        assert has_labels


def test_aym_norm_review_keeps_the_signature_block() -> None:
    d = _aym_nd()
    assert d.source_key.startswith("aym:nd:")
    members = _names(d.text, find_panel_members(d.text))
    assert len(members) == 17  # Başkan, two Başkanvekili and fourteen Üye on the signature lines
    r = anonymize(d.text, court=d.court, source_key=d.source_key)
    assert r.open_source == "AYM"
    assert _shown(members, r.masked_text) == 17
    assert [s.mask for s in _person_spans(r)] == ["[Raportör]"]
    closed = anonymize(d.text)
    assert len(_person_spans(closed)) == 18
    assert _shown(members, closed.masked_text) == 0
    assert len(find_cued_persons(closed.masked_text)) == 0
    assert len(find_panel_members(closed.masked_text)) == 0


def test_aym_parties_stay_masked_on_the_real_layout() -> None:
    """Synthetic parties written into the real header and body: the applicant, the lawyer, a mayor named
    with a member word inside a sentence and a member who is also named as the applicant all stay masked."""
    d = _aym_bb()
    members = _names(d.text, find_panel_members(d.text))
    text, n = re.subn(r"Başvurucu : [A-ZÇĞİÖŞÜ]\. [A-ZÇĞİÖŞÜ]\.", "Başvurucu : Derya KUMRAL", d.text)
    assert n == 1
    text, n = re.subn(r"Vekili : Av\. [A-ZÇĞİÖŞÜ]\. [A-ZÇĞİÖŞÜ]\.", "Vekili : Av. Tolga SEVİNÇLİ", text)
    assert n == 1
    text += "\nBelediye Başkanı Kerem Ulusoylu ve meclis üyeleri Nazlı Erdemoğlu ile toplantıya katıldı."
    r = anonymize(text, court=d.court, source_key=d.source_key)
    synthetic = ["Derya KUMRAL", "Tolga SEVİNÇLİ", "Kerem Ulusoylu", "Nazlı Erdemoğlu"]
    assert [n for n in synthetic if n in r.masked_text] == []
    labels = "Başvurucu : [Başvurucu]" in r.masked_text and "Vekili : Av. [Vekil]" in r.masked_text
    assert labels
    assert _shown(members, r.masked_text) == 5

    # a listed member who is also named as the applicant is masked everywhere, the panel line included
    twin = members[2]
    r = anonymize(text.replace("Derya KUMRAL", twin), court=d.court, source_key=d.source_key)
    assert _shown([twin], r.masked_text) == 0
    assert _shown([n for n in members if n != twin], r.masked_text) == 4


def test_surname_of_a_masked_person_is_not_opened_by_a_member_with_the_same_surname() -> None:
    text = ("Başkan : Ayşe YILMAZ\nÜyeler : Can ERGÜN\nOya SUNAR\nBaşvurucu : Mehmet YILMAZ\n"
            "1. YILMAZ'ın talebi incelenmiştir.\n")
    r = anonymize(text, court="Anayasa Mahkemesi")
    assert "Başkan : Ayşe YILMAZ" in r.masked_text and "Oya SUNAR" in r.masked_text
    assert "Mehmet" not in r.masked_text and "1. YILMAZ'ın" not in r.masked_text


def test_panel_lines_only() -> None:
    text = ("Başkan : Ali VEZİROĞLU\nÜyeler : Can Deniz ERGÜN\nAyşe KARAKAYA\nMehmet Ali SARIBAŞ\n"
            "Raportör : Zeki TANRIVERDİ\nBaşvurucu : A. B.\nİKİNCİ BÖLÜM\n"
            "Başkan Ali VEZİROĞLU Başkanvekili Oya SUNGUR Başkanvekili X. Ece BALCI\n"
            "Üye Can Deniz ERGÜN Üye Ayşe KARAKAYA Üye Fuat İNCEDAL\nÜye\nTuna SELÇUKLU\n"
            "1. Belediye Başkanı Ali Kaya ve dernek üyesi Veli Konuk dinlenmiştir.\n")
    assert _names(text, find_panel_members(text)) == [
        "Ali VEZİROĞLU", "Can Deniz ERGÜN", "Ayşe KARAKAYA", "Mehmet Ali SARIBAŞ", "Ali VEZİROĞLU",
        "Oya SUNGUR", "X. Ece BALCI", "Can Deniz ERGÜN", "Ayşe KARAKAYA", "Fuat İNCEDAL", "Tuna SELÇUKLU"]
    r = anonymize(text, court="Anayasa Mahkemesi")
    assert "Ali Kaya" not in r.masked_text and "Veli Konuk" not in r.masked_text
    assert "Zeki TANRIVERDİ" not in r.masked_text and "Tuna SELÇUKLU" in r.masked_text


def test_member_cues_on_one_line_are_all_found() -> None:
    """Regression: the greedy cue match ran into the next "Üye" and the member after it was never masked."""
    line = "Başkan Ali VEZİROĞLU Başkanvekili Oya SUNGUR Üye Can ERGÜN Üye Ayşe KARAKAYA Üye Fuat İNCEDAL"
    assert _names(line, find_cued_persons(line)) == [
        "Ali VEZİROĞLU", "Oya SUNGUR", "Can ERGÜN", "Ayşe KARAKAYA", "Fuat İNCEDAL"]
    masked = anonymize(line, court="Yargıtay").masked_text
    assert masked == "Başkan [Hâkim 1] Başkanvekili [Hâkim 2] Üye [Hâkim 3] Üye [Hâkim 4] Üye [Hâkim 5]"


# --- Yargitay and Danistay, real decisions ------------------------------------------------------------------
@pytest.mark.parametrize("make", [_yargitay, _danistay], ids=["yargitay", "danistay"])
def test_yargitay_and_danistay_decisions_leave_no_party_name(make) -> None:
    d = make()
    r = anonymize(d.text, court=d.court, source_key=d.source_key)
    assert r.open_source is None and r.publishable
    # both sources publish the decisions anonymised ("Taraflar arasındaki", "(DAVALI) : ..."): no person left
    unchanged = r.masked_text == d.text
    assert len(r.spans) == 0 and unchanged
    assert len(find_cued_persons(r.masked_text)) == 0 and len(find_panel_members(r.masked_text)) == 0
    # synthetic parties and a signature block written into the real text are all masked
    extra = ("\nDAVACI : Selim KARAOĞLAN\nVEKİLİ : Av. Mine TUNÇBİLEK\nDAVALI : Hakan Özberk\n"
             "Başkan Ali VEZİROĞLU Üye Can ERGÜN Üye Oya SUNGUR\n")
    r = anonymize(d.text + extra, court=d.court, source_key=d.source_key)
    synthetic = ["Selim KARAOĞLAN", "Mine TUNÇBİLEK", "Hakan Özberk", "Ali VEZİROĞLU", "Can ERGÜN",
                 "Oya SUNGUR"]
    assert [n for n in synthetic if n in r.masked_text] == []
    assert len(find_cued_persons(r.masked_text)) == 0 and len(find_panel_members(r.masked_text)) == 0


# --- index and summary text ---------------------------------------------------------------------------------
def test_index_text_drops_the_open_panel_names() -> None:
    for make, count in ((_aym_bb, 5), (_aym_nd, 17)):
        d = make()
        members = _names(d.text, find_panel_members(d.text))
        r = anonymize(d.text, court=d.court, source_key=d.source_key)
        assert _shown(members, r.masked_text) == count
        idx = index_text(r.masked_text)
        assert _shown(members, idx) == 0 and len(find_panel_members(idx)) == 0
        kept = "[Raportör]" in idx and "[Üye 1]" in idx
        assert kept
        closed = anonymize(d.text).masked_text
        unchanged = index_text(closed) == closed
        assert unchanged
    text = ("Başkan : Ayşe YILMAZ\nÜyeler : Can ERGÜN\nOya SUNAR\n"
            "1. Üye Can ERGÜN'ün ve SUNAR'ın karşıoyları vardır.\n")
    assert index_text(anonymize(text, court="AYM").masked_text) == (
        "Başkan : [Üye 1]\nÜyeler : [Üye 2]\n[Üye 3]\n1. Üye [Üye 2]'ün ve [Üye 3]'ın karşıoyları vardır.\n")
