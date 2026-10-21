"""NER layer tests. Pure helpers run in CI without the "ner" extra; the model test runs only where the
exported models exist locally (KAZUIST_NER_DIR) and is skipped elsewhere. All text is SYNTHETIC."""

from __future__ import annotations

import importlib.util
import json
import random
import sys
from pathlib import Path

import pytest

from anonymizer.job import make_anon_run_handler
from anonymizer.ner import (EnsembleBackend, NullBackend, backend_from_env, bio_entities, candidate_spans,
                            char_windows, greedy_select, load_backend, local_model_dir, normalize_spans, parse_spec,
                            windows, word_units)
from anonymizer.pipeline import anonymize
from anonymizer.spans import Span
from anonymizer.store import MemoryAnonStore

ROOT = Path(__file__).resolve().parents[4]
EVAL = ROOT / "eval" / "anon"


def test_word_units_follow_hushmark_tokenisation() -> None:
    assert [u[0] for u in word_units("Tezcan'ın 2021/5 sayılı, Ali-Veli")] == [
        "Tezcan", "'", "ın", "2021", "/", "5", "sayılı", ",", "Ali-Veli"]
    text = "Ayşe  Kaya."
    assert [(text[s:e], s) for _, s, e in word_units(text)] == [("Ayşe", 0), ("Kaya", 6), (".", 10)]


def test_candidate_spans_and_greedy_select() -> None:
    spans = candidate_spans(4, 2)
    assert spans == [(0, 0), (0, 1), (1, 1), (1, 2), (2, 2), (2, 3), (3, 3)]
    assert candidate_spans(30, 24)[-1] == (29, 29) and len(candidate_spans(30, 24)) == sum(
        min(24, 30 - s) for s in range(30))
    picked = greedy_select([(0.9, 0, 1, 0), (0.95, 1, 2, 0), (0.8, 3, 3, 1), (0.95, 0, 0, 0)])
    # equal scores: the narrower span wins, then the earlier one; overlaps are dropped
    assert picked == [(0.95, 0, 0, 0), (0.95, 1, 2, 0), (0.8, 3, 3, 1)]


@pytest.mark.parametrize("seed", range(25))
def test_windows_own_every_unit_once(seed: int) -> None:
    r = random.Random(seed)
    n = r.randint(1, 400)
    costs = [r.randint(0, 6) for _ in range(n)]
    budget, margin = r.choice([(254, 24), (40, 8), (12, 8), (6, 2)])
    ws = windows(costs, budget, margin)
    owned = [i for w in ws for i in range(w.own_start, w.own_end)]
    assert owned == list(range(n))
    for k, w in enumerate(ws):
        assert w.start <= w.own_start < w.own_end <= w.end
        assert sum(max(1, c) for c in costs[w.start : w.end]) <= budget or w.end - w.start == 1
        if k > 0 and ws[k - 1].end - ws[k - 1].start > 2 * margin:  # previous window overlaps this one
            assert w.own_start - w.start == margin
        if w.end - w.start > 2 * margin and k < len(ws) - 1:
            assert w.end - w.own_end == margin


def test_windows_edge_cases() -> None:
    assert windows([], 10, 2) == []
    one = windows([50], 10, 2)  # a unit over budget gets its own window
    assert len(one) == 1 and (one[0].start, one[0].end) == (0, 1)
    assert len(windows([1] * 9, 10, 2)) == 1


def test_char_windows_cover_text() -> None:
    text = " ".join(f"kelime{i}" for i in range(400))
    ws = char_windows(text, 200, 5)
    assert len(ws) > 1 and ws[0][2] == 0 and ws[-1][3] == len(text)
    for (s, e, a, b), nxt in zip(ws, ws[1:]):
        assert b == nxt[2] and s <= a < b <= e + 1


def test_bio_entities_first_aggregation() -> None:
    words = [("B-PER", 0.9, 0, 4), ("I-PER", 0.7, 5, 9), ("O", 0.99, 10, 13), ("I-PER", 0.6, 14, 18),
             ("B-LOC", 0.8, 19, 25), ("B-PER", 0.95, 26, 30), ("B-PER", 0.85, 31, 35)]
    assert bio_entities(words) == [("PER", 0.8, 0, 9), ("PER", 0.6, 14, 18), ("LOC", 0.8, 19, 25),
                                   ("PER", 0.95, 26, 30), ("PER", 0.85, 31, 35)]


def _norm(text: str, start: int = 0, end: int = None, entity: str = "PERSON") -> list:
    end = len(text) if end is None else end
    return [text[s.start : s.end] for s in normalize_spans(text, Span(start, end, entity, "ner:x", 0.9))]


def test_normalize_spans() -> None:
    assert _norm("Av. Cem Tunçel\nDAVALI : Burak Tezcan İnşaat") == ["Cem Tunçel", "Burak Tezcan"]
    assert _norm("Kemal Sarıgül ile Hakan Ertürk") == ["Kemal Sarıgül", "Hakan Ertürk"]
    assert _norm("SERKAN DUMANLI VE AYLİN DUMANLI") == ["SERKAN DUMANLI", "AYLİN DUMANLI"]
    assert _norm("Kayalı, Nurhan") == ["Kayalı", "Nurhan"]
    assert _norm("DAVALI :") == [] and _norm(" , ") == []
    assert _norm("Tanık Selin Karaduman") == ["Selin Karaduman"]
    assert _norm("Bayram Kaya") == ["Bayram Kaya"] and _norm("Veli Ilgaz") == ["Veli Ilgaz"]
    assert _norm("Ayşe Yılmaz Ltd. Şti.") == ["Ayşe Yılmaz"]
    # A closing dot of an initial is part of the name; a sentence dot is not.
    assert _norm("A.K.") == ["A.K."] and _norm("M. Ali Kaya") == ["M. Ali Kaya"]
    assert _norm("Fadime Koçer.") == ["Fadime Koçer"] and _norm("Av.") == [] and _norm("Av. Dr. Can Er") == ["Can Er"]
    # Non person spans are only trimmed.
    assert _norm(" Lale Mahallesi, Defne Sokak No: 12 ", entity="ADDRESS") == ["Lale Mahallesi, Defne Sokak No: 12"]


def test_normalisation_never_unmasks_a_gold_name() -> None:
    """Every gold PERSON span, given as a model span on its own or widened with its left context (titles,
    role words, line break), must stay fully covered after normalisation."""
    for path in [*(EVAL / "sentetik").glob("*.json"), *(EVAL / "zor").glob("*.json")]:
        d = json.loads(path.read_text(encoding="utf-8"))
        t = d["text"]
        for g in d["annotations_a"]:
            if g["entity"] != "PERSON":
                continue
            line_start = t.rfind("\n", 0, g["start"]) + 1
            for start in {g["start"], max(line_start, g["start"] - 12)}:
                pieces = normalize_spans(t, Span(start, g["end"], "PERSON", "ner:x", 0.9))
                covered = {i for p in pieces for i in range(p.start, p.end)}
                assert set(range(g["start"], g["end"])) <= covered, (d["id"], t[start : g["end"]])


def test_parse_spec_and_null_backend(tmp_path) -> None:
    assert parse_spec("") == [] and parse_spec("none") == []
    assert parse_spec("hushmark-berturk-112m+akdeniz27") == ["hushmark-berturk-112m", "akdeniz27"]
    with pytest.raises(KeyError):
        parse_spec("bilinmeyen")
    assert isinstance(load_backend("", root=tmp_path), NullBackend)
    with pytest.raises(FileNotFoundError):
        load_backend("hushmark-berturk-112m+akdeniz27", root=tmp_path)


def test_backend_from_env_fails_closed(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("KAZUIST_NER_BACKEND", raising=False)
    assert backend_from_env().name == "none"
    monkeypatch.setenv("KAZUIST_NER_DIR", str(tmp_path))
    monkeypatch.setenv("KAZUIST_NER_BACKEND", "hushmark-berturk-112m")
    with pytest.raises(FileNotFoundError):
        backend_from_env()
    with pytest.raises(FileNotFoundError):  # the worker refuses to start instead of running rules only
        make_anon_run_handler(lambda: MemoryAnonStore({}))


class _Fake:
    def __init__(self, name: str, spans):
        self.name = name
        self._spans = spans

    def detect(self, text: str):
        return [Span(text.index(w), text.index(w) + len(w), "PERSON", f"ner:{self.name}", sc) for w, sc in self._spans]


def test_ensemble_and_pipeline_split_merged_names() -> None:
    text = "Olay günü Kemal Sarıgül ile Hakan Ertürk kavga etmiştir. Sarıgül yaralanmıştır."
    merged = _Fake("a", [("Kemal Sarıgül ile Hakan Ertürk", 0.97)])
    other = _Fake("b", [("Hakan Ertürk", 0.9)])
    ens = EnsembleBackend([merged, other])
    assert ens.name == "a+b"
    r = anonymize(text, ner=ens)
    assert r.anonymization_version.endswith("+ner.a+b")
    out = r.masked_text
    assert "Kemal" not in out and "Ertürk" not in out and "Sarıgül" not in out
    assert " ile " in out  # the conjunction stays, two people get two labels
    assert "[Kişi 1]" in out and "[Kişi 2]" in out
    assert out.endswith("[Kişi 1] yaralanmıştır.")


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, EVAL / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_hard_set_is_valid_and_reproducible() -> None:
    b = _load("build_hard")
    docs = b.generate()
    on_disk = sorted((EVAL / "zor").glob("zor-*.json"))
    assert len(docs) == len(on_disk) >= 30
    assert [json.loads(p.read_text(encoding="utf-8")) for p in on_disk] == docs
    persons = 0
    for d in docs:
        assert d["synthetic"] is True and d["handwritten"] is True and d["tags"]
        assert "[[" not in d["text"]
        for a in d["annotations_a"]:
            frag = d["text"][a["start"] : a["end"]]
            assert frag and frag == frag.strip()
            persons += a["entity"] == "PERSON"
    assert persons >= 60
    assert any("olumsuz" in d["tags"] and not any(a["entity"] == "PERSON" for a in d["annotations_a"])
               for d in docs)


_HARD = "Olay günü Kemal Sarıgül ile Hakan Ertürk kavga etmiştir. Sanığın annesi Fadime Koçer dinlendi."


@pytest.mark.skipif(local_model_dir("akdeniz27") is None, reason="model yerelde yok")
def test_akdeniz27_onnx_local_model_and_windows() -> None:
    pytest.importorskip("onnxruntime")
    pytest.importorskip("tokenizers")
    b = load_backend("akdeniz27")
    assert b.name.startswith("akdeniz27@")
    found = [_HARD[s.start : s.end] for s in b.detect(_HARD) if s.entity == "PERSON"]
    assert found == ["Kemal Sarıgül", "Hakan Ertürk", "Fadime Koçer"]
    long = (_HARD + "\n") * 80  # about 1900 subwords: four windows of 510 tokens
    spans = [s for s in b.detect(long) if s.entity == "PERSON"]
    assert [long[s.start : s.end] for s in spans] == found * 80
    r = anonymize(long, ner=b)
    assert "Sarıgül" not in r.masked_text and "Koçer" not in r.masked_text


@pytest.mark.skipif(local_model_dir("hushmark-berturk-112m") is None, reason="model yerelde yok")
def test_hushmark_onnx_local_model() -> None:
    pytest.importorskip("onnxruntime")
    pytest.importorskip("tokenizers")
    b = load_backend("hushmark-berturk-112m")
    found = {_HARD[s.start : s.end] for s in b.detect(_HARD) if s.entity == "PERSON"}
    # The model returns "Kemal Sarıgül ile Hakan Ertürk" as one span; normalize_spans splits it.
    assert found == {"Kemal Sarıgül", "Hakan Ertürk", "Fadime Koçer"}
    # Long input: windows stay inside 256 subwords and spans stay ordered and disjoint. The model itself
    # drops entities in long repetitive context (the reference loader does the same; see the report).
    long = (_HARD + "\n") * 40
    spans = sorted(b.detect(long), key=lambda s: s.start)
    assert spans and all(a.end <= c.start for a, c in zip(spans, spans[1:]))
