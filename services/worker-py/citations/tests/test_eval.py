"""Runs the eval/citations measurement on the labelled sets so a pattern change that lowers precision fails CI.
This is a regression guard on 7 real and a few synthetic decisions, not the 15.3/4 gate (100 decisions)."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
OLC = ROOT / "eval" / "citations" / "olc.py"
FIXTURE = ROOT / "packages" / "casuist" / "fixtures" / "kayitlar.json"


def load():
    spec = importlib.util.spec_from_file_location("citations_olc", OLC)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_synthetic_set_is_perfect():
    r = load().run_sentetik()
    assert r["toplam"]["karar"]["kesinlik"] == 1.0 and r["toplam"]["karar"]["duyarlilik"] == 1.0
    assert r["toplam"]["doktrin"]["kesinlik"] == 1.0 and r["toplam"]["doktrin"]["duyarlilik"] == 1.0
    assert r["alan_hatasi"] == 0


@pytest.mark.skipif(not FIXTURE.exists(), reason="casuist fixture missing")
def test_real_seven_decisions_reach_the_threshold():
    fx = json.loads(FIXTURE.read_text(encoding="utf-8"))["kayitlar"]
    r = load().run_ornek7(fx)
    assert r["toplam"]["karar"]["kesinlik"] >= 0.95 and r["toplam"]["doktrin"]["kesinlik"] >= 0.95
    assert r["alan_hatasi"] == 0 and r["alt_mahkeme_uyumsuz"] == []
