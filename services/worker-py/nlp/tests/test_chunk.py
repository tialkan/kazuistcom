"""nlp.chunk must cut exactly where packages/casuist/src/chunk.ts cuts (golden file written by the TypeScript
test packages/casuist/test/chunk-parity.test.ts). Texts are the fixture corpus and synthetic edge cases."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import pytest

from nlp.chunk import (
    SECTIONED_TYPES,
    chunk_text,
    from_units,
    headings_in,
    js_trim,
    section_heading,
    sentence_ends,
    to_units,
)

ROOT = Path(__file__).resolve().parents[4]
GOLDEN = ROOT / "packages" / "casuist" / "fixtures" / "parcalar.json"
CORPUS = ROOT / "packages" / "casuist" / "fixtures" / "kayitlar.json"

needs_golden = pytest.mark.skipif(
    not (GOLDEN.exists() and CORPUS.exists()), reason="casuist fixtures missing"
)


def ranges(text: str, **opts: Any) -> list[list[int]]:
    return [[c.char_start, c.char_end] for c in chunk_text(text, **opts)]


def sections(text: str, **opts: Any) -> list[Optional[str]]:
    return [c.section for c in chunk_text(text, **opts)]


@needs_golden
def test_fixture_corpus_boundaries_match_typescript() -> None:
    data = json.loads(GOLDEN.read_text(encoding="utf-8"))
    golden, labels = data["kayitlar"], data["bolumler"]
    records = json.loads(CORPUS.read_text(encoding="utf-8"))["kayitlar"]
    assert len(records) == len(golden) == 75
    sectioned = [r for r in records if r["type"] in SECTIONED_TYPES]
    assert {r["id"] for r in sectioned} == set(labels) and len(labels) == 8
    for r in records:
        on = r["type"] in SECTIONED_TYPES
        assert ranges(r["text"], sections=on) == golden[r["id"]], r["id"]
        if on:
            assert sections(r["text"], sections=True) == labels[r["id"]], r["id"]
        else:
            assert set(sections(r["text"])) <= {None}


@needs_golden
def test_edge_case_boundaries_match_typescript() -> None:
    examples = json.loads(GOLDEN.read_text(encoding="utf-8"))["ornekler"]
    assert {e["ad"] for e in examples} >= {
        "kisaltmalar",
        "bmp-disi",
        "bosluk-turleri",
        "pencere-siniri",
        "bos",
        "bolumler-satir-basi",
        "bolumler-satir-ici",
    }
    for e in examples:
        opts: dict[str, Any] = {
            k: e[src] for k, src in (("max_chars", "max"), ("min_chars", "min")) if src in e
        }
        opts["sections"] = e.get("bolumlu", False)
        assert ranges(e["metin"], **opts) == e["parcalar"], e["ad"]
        if opts["sections"]:
            assert sections(e["metin"], **opts) == e["bolumler"], e["ad"]


def test_section_headings() -> None:
    assert section_heading("II.GEREKÇE Suç tarihinde") == "gerekce"
    assert section_heading("IV. SONUÇ: Açıklanan nedenlerle") == "hukum"
    assert section_heading("C. Gerekçe") == "gerekce"
    assert section_heading("Davacı İstemi: 4. Davacı vekili") == "iddia"
    assert section_heading("KARŞI OY") == "karsi_oy"
    assert section_heading("Karşı oy:") == "karsi_oy"
    # Header fields and running text are not headings.
    assert section_heading("DAVA TARİHİ : 01.01.2020") is None
    assert section_heading("TEMYİZ EDEN: Davacı vekili") is None
    assert section_heading("Sonuç olarak talep reddedildi.") is None
    assert section_heading("DAVACI : [Davacı]") is None
    # Inline headings need an enumerator, a colon or a separate opinion heading.
    assert [(p, s) for p, s, _ in headings_in("Bitti. III. İLK DERECE MAHKEMESİ KARARI Mahkemece")] == [
        (7, "surec")
    ]
    assert headings_in("Bitti. DAVA TARİHİ 2020. KARAR verildi. 2. Daire Kararı ile") == []
    assert [s for _, s, _ in headings_in("x. V. TEMYİZ A. Temyiz Sebepleri Davacı")] == ["surec", "iddia"]
    assert [c.section for c in chunk_text("Kanun metni.\nKARŞI OY\nYazı.")] == [None]


@needs_golden
def test_chunk_text_is_the_utf16_slice_of_the_input() -> None:
    for e in json.loads(GOLDEN.read_text(encoding="utf-8"))["ornekler"]:
        units = to_units(e["metin"])
        for c in chunk_text(e["metin"], **({"max_chars": e["max"]} if "max" in e else {})):
            assert c.text == from_units(units[c.char_start : c.char_end])


def test_sizes_and_sequence() -> None:
    long = " ".join(["Bu bir cümledir ve hukuk metnidir."] * 60)
    text = f"Kısa paragraf.\n{long}\nSon paragraf burada."
    chunks = chunk_text(text, max_chars=400, min_chars=100)
    assert [c.seq for c in chunks] == list(range(len(chunks)))
    for c in chunks:
        assert text[c.char_start : c.char_end] == c.text
        assert len(c.text) <= 400
        assert c.section is None
    assert chunks[0].char_start == 0 and chunks[-1].char_end == len(text)


def test_short_paragraphs_merge_up_to_max_and_long_ones_split() -> None:
    lines = [f"Madde {i}. Kısa hüküm." for i in range(1, 30)]
    chunks = chunk_text("\n".join(lines), max_chars=200, min_chars=150)
    assert all(len(c.text) <= 200 for c in chunks)
    assert len(chunks) < len(lines)  # merged
    assert all("\n" in c.text for c in chunks[:-1])


def test_no_cut_after_abbreviations() -> None:
    text = f"{'a ' * 150}KVKK m. 11 ve E. 2019/1 sayılı karar. Sonra yeni cümle gelir {'b ' * 150}"
    chunks = chunk_text(text, max_chars=330, min_chars=10)
    assert not any(c.text.endswith(("m.", "E.")) for c in chunks)
    assert sentence_ends("Bkz. Örnek bkz. Örnek") == [
        3
    ]  # "Bkz" is not in the list (case sensitive), "bkz" is
    assert sentence_ends("Kanun vd. Sonra") == []
    assert sentence_ends("Bitti. Yeni") == [5]
    assert sentence_ends("Bitti. yeni") == []  # lower case does not open a sentence
    assert sentence_ends("Bitti.Yeni") == []  # whitespace is required
    assert sentence_ends("Bitti; (1) bent") == [5]


def test_empty_and_whitespace_only_text_has_no_chunks() -> None:
    assert chunk_text("") == []
    assert chunk_text(" \n\t\n\u00a0 \u3000") == []


def test_javascript_whitespace_and_utf16_offsets() -> None:
    assert js_trim("\u00a0\ufeff a \u2028") == "a"
    assert js_trim("\x1c a") == "\x1c a"  # Python strips \x1c, JavaScript does not
    text = "\U0001d400\U0001d401 bir. \U00020000"
    [c] = chunk_text(text)
    assert (c.char_start, c.char_end) == (0, 12)  # 3 astral characters count twice
    assert c.text == text
    assert from_units(to_units(text)) == text
