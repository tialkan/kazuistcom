"""DOCX check: the generated templates pass, deliberate deviations are caught, hostile files are refused,
the HTTP endpoint is fail closed, and LibreOffice prints the page numbers the rules ask for."""

from __future__ import annotations

import base64
import io
import json
import zipfile
from pathlib import Path
from typing import Callable, Dict

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from docxcheck import safe_zip
from docxcheck.api import make_router
from docxcheck.check import check_docx, count_words, tr_key, tr_upper
from docxcheck.libreoffice import convert_to_pdf, page_labels, roman_value, soffice_path, verify_numbering
from docxcheck.rules import RuleError, Rules
from docxcheck.safe_zip import DocxError

FIX = Path(__file__).parent / "fixtures"
ROOT = Path(__file__).resolve().parents[4]

SECTIONS = ["Dış Kapak", "İç Kapak", "Kabul ve Onay", "Etik Beyan", "Özet", "Abstract", "Önsöz", "İçindekiler",
            "Kısaltmalar", "Tablolar Listesi", "Şekiller Listesi", "Giriş", "Birinci Bölüm", "İkinci Bölüm",
            "Sonuç", "Kaynakça", "Özgeçmiş"]
TEZ_RULES = {"sections": SECTIONS}
# A second, different rule set (top right numbers, decimal front matter); fixture built by eval/rules.
UST_SAG_RULES = {"sections": SECTIONS, "font": "Arial", "size": 11, "line": 1.15, "indent": 1, "spAfter": 0,
                 "mTop": 2.5, "mBottom": 2.5, "mLeft": 3, "mRight": 2, "pageNum": "ust-sag", "frontRoman": False,
                 "h1Size": 13, "h2Size": 12, "h3Size": 11, "footSize": 9, "h1Upper": False}
MAKALE_RULES = {"line": 1.15, "indent": 0, "wordLimit": {"min": None, "max": 15000},
                "absLimit": {"min": None, "max": 250}}


def tez() -> bytes:
    return (FIX / "tez.docx").read_bytes()


def makale() -> bytes:
    return (FIX / "makale.docx").read_bytes()


def patch(data: bytes, edits: Dict[str, Callable[[str], str]]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            raw = src.read(info.filename)
            if info.filename in edits:
                new = edits[info.filename](raw.decode("utf-8"))
                assert new != raw.decode("utf-8"), f"patch of {info.filename} changed nothing"
                raw = new.encode("utf-8")
            dst.writestr(info.filename, raw)
    return out.getvalue()


def by_key(report: dict) -> Dict[str, dict]:
    return {f["key"]: f for f in report["findings"]}


def run(data: bytes, kind: str = "tez", rules: dict | None = None) -> Dict[str, dict]:
    base = TEZ_RULES if kind == "tez" else MAKALE_RULES
    return by_key(check_docx(data, Rules.from_dict(kind, {**base, **(rules or {})})))


class TestGeneratedTemplatesFollowTheirRules:
    def test_thesis_template_has_no_deviation(self) -> None:
        report = check_docx(tez(), Rules.from_dict("tez", TEZ_RULES))
        assert report["summary"]["uyumsuz"] == 0, [f for f in report["findings"] if f["status"] == "uyumsuz"]
        assert report["sections"] == 2
        keys = by_key(report)
        for core in ("mTop", "mBottom", "mLeft", "mRight", "font", "size", "line", "pageNum"):
            assert keys[core]["status"] == "uygun", core
        assert keys["citation"]["status"] == "elle"

    def test_article_template_has_no_deviation(self) -> None:
        report = check_docx(makale(), Rules.from_dict("makale", MAKALE_RULES))
        assert report["summary"]["uyumsuz"] == 0, [f for f in report["findings"] if f["status"] == "uyumsuz"]
        assert report["sections"] == 1

    def test_other_rule_values_are_not_accepted_silently(self) -> None:
        # The same file against different rules must report differences: the check is not a rubber stamp.
        r = run(tez(), rules={"mLeft": 4, "font": "Arial", "size": 11, "line": 1, "pageNum": "alt-sag",
                              "frontRoman": False, "h1Size": 16, "footSize": 9, "spAfter": 12, "indent": 0})
        for key in ("mLeft", "font", "size", "line", "pageNum", "frontRoman", "h1Size", "footSize", "spAfter", "indent"):
            assert r[key]["status"] == "uyumsuz", key
        assert r["mTop"]["status"] == "uygun"


class TestDeviationsAreCaught:
    def test_margin(self) -> None:
        bad = patch(tez(), {"word/document.xml": lambda s: s.replace('w:left="1985"', 'w:left="1700"')})
        r = run(bad)
        assert r["mLeft"]["status"] == "uyumsuz" and r["mLeft"]["found"] == 3.0

    def test_font_in_normal_style(self) -> None:
        bad = patch(tez(), {"word/styles.xml": lambda s: s.replace("Times New Roman", "Arial")})
        assert run(bad)["font"]["status"] == "uyumsuz"

    def test_direct_formatting_overrides_the_style(self) -> None:
        def edit(doc: str) -> str:
            return doc.replace("<w:r><w:t xml:space=\"preserve\">[Bölüm metni.",
                               "<w:r><w:rPr><w:sz w:val=\"20\"/></w:rPr><w:t xml:space=\"preserve\">[Bölüm metni.")

        r = run(patch(tez(), {"word/document.xml": edit}))
        assert r["size"]["status"] == "uyumsuz" and r["size"]["share"] < 1

    def test_line_spacing(self) -> None:
        bad = patch(tez(), {"word/styles.xml": lambda s: s.replace('w:line="360"', 'w:line="240"')})
        assert run(bad)["line"]["status"] == "uyumsuz"

    def test_missing_page_number_field(self) -> None:
        def strip_field(s: str) -> str:
            return s.replace("PAGE", "XXXX")

        with zipfile.ZipFile(io.BytesIO(tez())) as z:
            footers = [n for n in z.namelist() if n.startswith("word/footer") and "PAGE" in z.read(n).decode()]
        assert footers
        bad = patch(tez(), {n: strip_field for n in footers})
        assert run(bad)["pageNum"]["status"] == "uyumsuz"

    def test_front_matter_not_roman(self) -> None:
        bad = patch(tez(), {"word/document.xml": lambda s: s.replace('w:fmt="lowerRoman"', 'w:fmt="decimal"')})
        assert run(bad)["frontRoman"]["status"] == "uyumsuz"

    def test_numbering_that_continues_instead_of_restarting(self) -> None:
        bad = patch(tez(), {"word/document.xml": lambda s: s.replace('<w:pgNumType w:start="1" w:fmt="decimal"/>',
                                                                       '<w:pgNumType w:fmt="decimal"/>')})
        r = run(bad)["frontRoman"]
        assert r["status"] == "uyumsuz" and r["detail"] == "start_not_one"

    def test_single_section_thesis(self) -> None:
        r = run(makale(), kind="tez")
        assert r["frontRoman"]["status"] == "uyumsuz" and r["frontRoman"]["detail"] == "needs_two_sections"

    def test_heading_not_upper_case(self) -> None:
        bad = patch(tez(), {"word/document.xml": lambda s: s.replace("GİRİŞ", "Giriş").replace("SONUÇ", "Sonuç")
                            .replace("KAYNAKÇA", "Kaynakça").replace("BİRİNCİ BÖLÜM", "Birinci Bölüm")
                            .replace("İKİNCİ BÖLÜM", "İkinci Bölüm").replace("ÖZGEÇMİŞ", "Özgeçmiş")
                            .replace("KABUL VE ONAY", "Kabul ve Onay").replace("ETİK BEYAN", "Etik Beyan")
                            .replace("ÖZET", "Özet").replace("ABSTRACT", "Abstract").replace("ÖNSÖZ", "Önsöz")
                            .replace("KISALTMALAR", "Kısaltmalar").replace("TABLOLAR LİSTESİ", "Tablolar Listesi")
                            .replace("ŞEKİLLER LİSTESİ", "Şekiller Listesi")})
        assert run(bad)["h1Upper"]["status"] == "uyumsuz"

    def test_missing_and_out_of_order_sections(self) -> None:
        r = run(tez(), rules={"sections": SECTIONS + ["Teşekkür"]})["sections"]
        assert r["status"] == "uyumsuz" and r["found"]["missing"] == ["Teşekkür"]
        swapped = SECTIONS[:12] + ["İkinci Bölüm", "Birinci Bölüm"] + SECTIONS[14:]
        r2 = run(tez(), rules={"sections": swapped})["sections"]
        assert r2["status"] == "uyumsuz" and r2["found"]["outOfOrder"] is True

    def test_word_limit_counts_between_introduction_and_references(self) -> None:
        r = run(makale(), kind="makale", rules={"wordLimit": {"min": None, "max": 5}})["wordLimit"]
        assert r["status"] == "uyumsuz" and r["found"] > 5 and r["detail"] == "intro_to_references"

    def test_text_below_the_minimum_is_for_the_user_to_judge_not_a_fault(self) -> None:
        # A template or a text still being written is short; only exceeding the maximum is a deviation.
        r = run(makale(), kind="makale", rules={"wordLimit": {"min": 5000, "max": 15000}, "absLimit": {"min": 150, "max": 200}})
        assert r["wordLimit"]["status"] == "elle" and r["wordLimit"]["detail"] == "below_min"
        assert r["absLimit"]["status"] == "elle"
        r2 = run(makale(), kind="makale", rules={"absLimit": {"min": None, "max": 5}})
        assert r2["absLimit"]["status"] == "uyumsuz"

    def test_paper_size(self) -> None:
        r = run(tez(), rules={"paper": "Letter"})["paper"]
        assert r["status"] == "uyumsuz"


class TestHostileFiles:
    def test_not_a_zip(self) -> None:
        with pytest.raises(DocxError) as e:
            check_docx(b"%PDF-1.7 not a docx", Rules.from_dict("tez", {}))
        assert e.value.code == "not_docx"

    def test_zip_without_word_document(self) -> None:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("hello.txt", "x")
        with pytest.raises(DocxError) as e:
            check_docx(buf.getvalue(), Rules.from_dict("tez", {}))
        assert e.value.code == "not_docx"

    def test_larger_than_twenty_megabytes(self) -> None:
        with pytest.raises(DocxError) as e:
            safe_zip.open_docx(b"PK\x03\x04" + b"0" * (safe_zip.MAX_FILE_BYTES + 1))
        assert e.value.code == "too_large"

    def test_zip_bomb_part_is_cut_on_the_real_stream(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setitem(safe_zip.PART_LIMITS, "word/document.xml", 50_000)
        bomb = patch(tez(), {"word/document.xml": lambda s: s.replace("</w:body>", "<!--" + "a" * 200_000 + "--></w:body>")})
        with pytest.raises(DocxError) as e:
            check_docx(bomb, Rules.from_dict("tez", {}))
        assert e.value.code == "zip_bomb"

    def test_too_many_entries(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(safe_zip, "MAX_ENTRIES", 5)
        with pytest.raises(DocxError) as e:
            check_docx(tez(), Rules.from_dict("tez", {}))
        assert e.value.code == "too_many_entries"

    def test_xml_entities_are_refused(self) -> None:
        evil = patch(tez(), {"word/document.xml": lambda s: s.replace(
            "<w:document", '<!DOCTYPE d [<!ENTITY a "aaaa">]><w:document', 1)})
        with pytest.raises(DocxError) as e:
            check_docx(evil, Rules.from_dict("tez", {}))
        assert e.value.code == "xml_entities"

    def test_broken_xml(self) -> None:
        broken = patch(tez(), {"word/styles.xml": lambda s: s[: len(s) // 2]})
        with pytest.raises(DocxError) as e:
            check_docx(broken, Rules.from_dict("tez", {}))
        assert e.value.code == "bad_xml"

    def test_report_contains_no_document_text(self) -> None:
        marked = patch(tez(), {"word/document.xml": lambda s: s.replace("[Etik beyan metni", "GIZLI-ADAY-ADI [Etik beyan metni")})
        text = json.dumps(check_docx(marked, Rules.from_dict("tez", TEZ_RULES)), ensure_ascii=False)
        assert "GIZLI-ADAY-ADI" not in text and "Etik beyan" not in text


class TestRules:
    def test_unknown_kind(self) -> None:
        with pytest.raises(RuleError):
            Rules.from_dict("odev", {})

    @pytest.mark.parametrize("data", [
        {"mTop": 99}, {"size": "12"}, {"pageNum": "orta"}, {"h1Upper": "evet"}, {"sections": "x"},
        {"wordLimit": {"min": -1, "max": 5}}, {"font": "x" * 100},
    ])
    def test_invalid_values_name_the_field(self, data: dict) -> None:
        with pytest.raises(RuleError):
            Rules.from_dict("tez", data)

    def test_helpers(self) -> None:
        assert tr_upper("giriş ışık") == "GİRİŞ IŞIK"
        assert tr_key("İÇİNDEKİLER") == "icindekiler"
        assert tr_key("Kısaltmalar") == "kisaltmalar"
        assert count_words("Bu, bir deneme-metnidir; 3 kelime değil.") == 6
        assert roman_value("xiv") == 14 and roman_value("12") is None


class TestRealWordDocument:
    def test_srs_document_is_read_and_differs_from_a_thesis_rule(self) -> None:
        data = (ROOT / "docs" / "kaynak" / "Kazuist.docx").read_bytes()
        report = check_docx(data, Rules.from_dict("makale", {"font": "Calibri"}))
        statuses = {f["key"]: f["status"] for f in report["findings"]}
        assert statuses["font"] == "uyumsuz"
        assert report["summary"]["uyumsuz"] >= 5


def client(token: str | None = "gizli") -> TestClient:
    app = FastAPI()
    app.include_router(make_router({"KAZUIST_INTERNAL_TOKEN": token} if token else {}))
    return TestClient(app)


def rules_header(kind: str = "tez", rules: dict | None = None) -> str:
    return base64.b64encode(json.dumps({"kind": kind, "rules": rules or TEZ_RULES}).encode()).decode()


class TestEndpoint:
    def post(self, c: TestClient, data: bytes, *, token: str | None = "gizli", rules: str | None = None):
        headers = {"X-Kazuist-Rules": rules or rules_header()}
        if token:
            headers["X-Internal-Token"] = token
        return c.post("/internal/docxcheck", content=data, headers=headers)

    def test_fail_closed_without_configured_token(self) -> None:
        assert self.post(client(None), tez()).status_code == 503

    def test_wrong_or_missing_token(self) -> None:
        assert self.post(client(), tez(), token="yanlis").status_code == 401
        assert self.post(client(), tez(), token=None).status_code == 401

    def test_happy_path(self) -> None:
        r = self.post(client(), tez())
        assert r.status_code == 200
        body = r.json()
        assert body["summary"]["uyumsuz"] == 0 and body["kind"] == "tez"

    def test_bad_rules_header(self) -> None:
        assert self.post(client(), tez(), rules="***").status_code == 400
        assert self.post(client(), tez(), rules=rules_header("odev")).status_code == 400
        assert self.post(client(), tez(), rules=rules_header("tez", {"mTop": 99})).status_code == 400

    def test_not_a_docx_is_unprocessable(self) -> None:
        r = self.post(client(), b"metin dosyasi")
        assert r.status_code == 422 and r.json()["detail"] == "not_docx"

    def test_oversized_body(self) -> None:
        r = self.post(client(), b"PK\x03\x04" + b"0" * (safe_zip.MAX_FILE_BYTES + 10))
        assert r.status_code == 413


needs_soffice = pytest.mark.skipif(soffice_path() is None, reason="LibreOffice (soffice) is not installed")


@needs_soffice
class TestLibreOfficeHeadless:
    """Plan 10.5/8 and 15.1: front matter i, ii, ... and main text 1, 2, ... in the PDF LibreOffice prints."""

    def test_thesis_template_prints_roman_then_arabic(self) -> None:
        labels = page_labels(convert_to_pdf(tez()), "alt-orta")
        result = verify_numbering(labels)
        assert result.ok, result.problems
        assert result.front[0] == "" and result.front[1] == "ii"
        assert result.main[:2] == ["1", "2"]

    def test_article_template_prints_arabic_from_one(self) -> None:
        labels = page_labels(convert_to_pdf(makale()), "alt-orta")
        assert labels[0] == "1"

    def test_top_right_numbers_and_decimal_front_matter(self) -> None:
        data = (FIX / "tez-ust-sag.docx").read_bytes()
        labels = page_labels(convert_to_pdf(data), "ust-sag")
        result = verify_numbering(labels, front_roman=False)
        assert result.ok, result.problems
        report = check_docx(data, Rules.from_dict("tez", UST_SAG_RULES))
        assert report["summary"]["uyumsuz"] == 0, [f for f in report["findings"] if f["status"] == "uyumsuz"]
