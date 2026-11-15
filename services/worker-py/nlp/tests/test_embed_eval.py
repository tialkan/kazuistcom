"""eval/embed measurement helpers (metrics, data integrity) and the pinned candidate metadata.

The measurement itself needs the models and runs outside CI (eval/embed/olc.py); what CI can check is that the
metrics are right, that both query sets point at records that exist in the fixture corpus, and that every
candidate is pinned to an upstream revision with a permissive licence."""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import pytest

from nlp.embedder import CANDIDATES

ROOT = Path(__file__).resolve().parents[4]
OLC = ROOT / "eval" / "embed" / "olc.py"


def _load_olc():
    spec = importlib.util.spec_from_file_location("embed_olc", OLC)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


olc = _load_olc()


def test_rank_uses_the_best_passage_of_each_record() -> None:
    q = [1.0, 0.0]
    passages = [[0.2, 0.98], [0.9, 0.43], [0.6, 0.8], [0.95, 0.31]]
    owners = ["a", "a", "b", "c"]
    assert olc.rank_records(q, passages, owners) == ["c", "a", "b"]
    scores = dict(olc.rank_scores(q, passages, owners))
    assert scores["a"] == pytest.approx(0.9)


def test_ties_are_broken_by_key_so_runs_are_repeatable() -> None:
    assert olc.rank_records([1.0], [[0.5], [0.5]], ["y", "x"]) == ["x", "y"]


def test_hit_mrr_and_ndcg() -> None:
    ranked = ["x", "a", "y", "b"]
    assert olc.hit_at(ranked, ["a"], 1) == 0.0
    assert olc.hit_at(ranked, ["a"], 2) == 1.0
    assert olc.mrr_at(ranked, ["b", "a"]) == pytest.approx(0.5)
    assert olc.mrr_at(ranked, ["z"]) == 0.0
    # Two relevant records at ranks 2 and 4 against the ideal ranks 1 and 2.
    want = (1 / math.log2(3) + 1 / math.log2(5)) / (1 + 1 / math.log2(3))
    assert olc.ndcg_at(ranked, ["a", "b"]) == pytest.approx(want)
    assert olc.ndcg_at(["a"], ["a"]) == pytest.approx(1.0)
    assert olc.ndcg_at(ranked, []) == 0.0


def test_percentile_matches_the_rag_script_rule() -> None:
    xs = [float(i) for i in range(1, 21)]
    assert olc.percentile(xs, 0.5) == 10.0
    assert olc.percentile(xs, 0.95) == 19.0
    assert olc.percentile([], 0.95) == 0.0


def test_separation_is_a_pairwise_auc() -> None:
    assert olc.separation([0.9, 0.8], [0.1, 0.2]) == 1.0
    assert olc.separation([0.1], [0.9]) == 0.0
    assert olc.separation([0.5], [0.5]) == 0.5
    assert olc.separation([], [0.5]) is None


def test_paired_bootstrap() -> None:
    mean, lo, hi = olc.paired_bootstrap([1.0] * 20, [0.5] * 20)
    assert (mean, lo, hi) == (0.5, 0.5, 0.5)
    a = [1.0, 0.0] * 30
    mean, lo, hi = olc.paired_bootstrap(a, list(reversed(a)))
    assert mean == 0.0 and lo < 0.0 < hi
    assert olc.paired_bootstrap(a, list(reversed(a))) == (mean, lo, hi)  # seeded, repeatable
    with pytest.raises(ValueError):
        olc.paired_bootstrap([1.0], [])


def test_summary_averages_per_query_scores() -> None:
    rows = [
        {"isabet@1": 1.0, "isabet@5": 1.0, "isabet@10": 1.0, "ndcg@10": 1.0, "mrr@10": 1.0},
        {"isabet@1": 0.0, "isabet@5": 1.0, "isabet@10": 1.0, "ndcg@10": 0.5, "mrr@10": 0.25},
    ]
    s = olc.summarise(rows)
    assert s["sorular"] == 2 and s["isabet@1"] == 0.5 and s["isabet@10"] == 1.0 and s["mrr@10"] == 0.625


def test_both_query_sets_label_records_of_the_fixture_corpus() -> None:
    version, passages, owners = olc.load_corpus()
    assert len(passages["metin"]) == len(passages["baslik+metin"]) == len(owners)
    sets = olc.load_sets(version, set(owners))
    synthetic = sets["sentetik"]["sorular"]
    assert len({q["id"] for q in synthetic}) == len(synthetic) >= 60
    assert all(q["beklenen"] for q in synthetic)
    assert {q["tur"] for q in synthetic} <= {"gunluk", "anlamsal", "kisaltma", "capraz-dil"}


def test_synthetic_queries_do_not_repeat_the_rag_set() -> None:
    rag = json.loads((ROOT / "eval" / "rag" / "set-50.json").read_text(encoding="utf-8"))
    synthetic = json.loads((ROOT / "eval" / "embed" / "set-sentetik.json").read_text(encoding="utf-8"))
    assert not {q["soru"] for q in rag["sorular"]} & {q["soru"] for q in synthetic["sorular"]}


# plan 5.3 and CLAUDE.md: open licences only; AGPL and SSPL need an ADR and none of the candidates use them.
PERMISSIVE = {"mit", "apache-2.0"}


@pytest.mark.parametrize("key", sorted(CANDIDATES))
def test_candidates_are_pinned_with_a_permissive_licence(key: str) -> None:
    c = CANDIDATES[key]
    assert len(c.revision) == 40 and all(ch in "0123456789abcdef" for ch in c.revision)
    assert c.license in PERMISSIVE
