"""Pipeline: scores, publish rule, queue rows, scope, and the real Yargitay decisions of the casuist fixture."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional, Sequence

import pytest

from citations.pipeline import RecordMeta, extract_record
from citations.scoring import PUBLISH_MIN, QUEUE_MIN, Target, in_network_scope
from citations.store import MemoryCitationStore, NotServable

ROOT = Path(__file__).resolve().parents[4]
CASUIST_FIXTURE = ROOT / "packages" / "casuist" / "fixtures" / "kayitlar.json"


class Idx:
    def __init__(self, *targets: Target):
        self.t = targets

    def find(self, kind: str, esas: Optional[str], karar: Optional[str], number: Optional[str]) -> Sequence[Target]:
        return [t for t in self.t if (number and t.esas == number) or (esas and t.esas == esas and t.karar == karar)]


HGK = Target("t-hgk", "Yargıtay", "Hukuk Genel Kurulu", "2015-06-17", "2014/4-56", "2015/1679")
TEXT = "Yargıtay Hukuk Genel Kurulunun 17/6/2015 tarihli ve E.2014/4-56, K.2015/1679 sayılı kararında"
ME = RecordMeta("r1", "2023/12295", "2025/14577", "Yargıtay", "4. Hukuk Dairesi")


def test_resolved_full_citation_is_published():
    ex = extract_record(TEXT, ME, Idx(HGK))
    (e,) = ex.decisions
    assert (e.status, e.to_record_id) == ("yayinla", "t-hgk") and e.confidence >= PUBLISH_MIN
    assert ex.queue == [] and ex.publishable_edges == 1


def test_target_not_in_corpus_is_stored_but_not_served():
    (e,) = extract_record(TEXT, ME, Idx()).decisions
    assert e.status == "hedef_yok" and e.to_record_id is None


def test_conflicting_chamber_or_date_goes_to_the_queue_not_to_the_graph():
    wrong = Target("t-x", "Yargıtay", "Ceza Genel Kurulu", "2015-06-17", "2014/4-56", "2015/1679")
    (e,) = extract_record(TEXT, ME, Idx(wrong)).decisions
    assert e.status == "kuyruk" and e.to_record_id is None and "hedef_alanlari_celisiyor" in e.reasons
    wrong_date = Target("t-y", "Yargıtay", "Hukuk Genel Kurulu", "2014-01-01", "2014/4-56", "2015/1679")
    (e,) = extract_record(TEXT, ME, Idx(wrong_date)).decisions
    assert e.status == "kuyruk" and e.to_record_id is None


def test_two_candidates_are_ambiguous():
    other = Target("t-2", "Yargıtay", "Hukuk Genel Kurulu", "2015-06-17", "2014/4-56", "2015/1679")
    (e,) = extract_record(TEXT, ME, Idx(HGK, other)).decisions
    assert e.status == "kuyruk" and e.to_record_id is None and "hedef_birden_cok_aday" in e.reasons


def test_missing_court_is_queued_even_when_the_target_matches():
    t = "bkz. E. 2014/4-56 K. 2015/1679"
    (e,) = extract_record(t, ME, Idx(HGK)).decisions
    assert e.status == "kuyruk" and QUEUE_MIN <= e.confidence < PUBLISH_MIN
    rows = extract_record(t, ME, Idx(HGK)).queue
    assert rows[0]["payload"]["recordId"] == "r1" and rows[0]["payload"]["kind"] == "karar"
    assert "bkz." in rows[0]["payload"]["context"]  # a slice of the masked text for the editor


def test_own_numbers_and_lower_courts_are_not_edges():
    own = "Bu karar (E. 2023/12295, K. 2025/14577) ve İstanbul 19. Asliye Hukuk Mahkemesi SAYISI : 2020/417 E., 2021/566 K."
    ex = extract_record(own, ME, Idx())
    assert ex.decisions == [] and ex.out_of_scope == 1


def test_repeated_mentions_make_one_edge_with_all_spans():
    ex = extract_record(TEXT + " ... " + TEXT, ME, Idx(HGK))
    assert len(ex.decisions) == 1 and len(ex.decisions[0].spans) == 2


def test_doctrine_edge_publish_and_queue():
    pub = "(Zahit İmre, Medeni Hukuka Giriş, 3.Baskı, İstanbul 1980, s.445)"
    ex = extract_record(pub, ME, Idx())
    (d,) = ex.doctrine
    assert d.status == "yayinla" and d.pages == ["445"] and d.work["authors"] == ["İmre, Zahit"]
    amb = "(von Tuhr, Andreas, Borçlar Hukuku, C.1, çev. Edege, Ankara 1983, s. 5)"
    ex = extract_record(amb, ME, Idx())
    assert ex.doctrine[0].status == "kuyruk" and ex.queue[0]["payload"]["kind"] == "doktrin"


def test_scope_1_0():
    assert in_network_scope("Yargıtay", "Hukuk Genel Kurulu")
    assert in_network_scope("Yargıtay", "İçtihadı Birleştirme Büyük Genel Kurulu")
    assert in_network_scope("Anayasa Mahkemesi", None)
    assert not in_network_scope("Yargıtay", "4. Hukuk Dairesi")
    assert not in_network_scope("Yargıtay", "Ceza Genel Kurulu")  # 1.1


def test_memory_store_fails_closed_without_masked_text():
    store = MemoryCitationStore({"a": (RecordMeta("a"), None)})
    with pytest.raises(NotServable):
        store.load("a")


@pytest.mark.skipif(not CASUIST_FIXTURE.exists(), reason="packages/casuist/fixtures not merged yet")
def test_real_yargitay_fixture_has_the_expected_decision_edges():
    recs = json.loads(CASUIST_FIXTURE.read_text(encoding="utf-8"))["kayitlar"]
    yarg = [r for r in recs if r.get("court") and "Yargıtay" in r["court"]]
    by_title = {r["title"]: r for r in yarg}
    r = by_title["Yargıtay 4. Hukuk Dairesi E. 2023/12295 K. 2025/14577"]
    ex = extract_record(r["text"], RecordMeta(r["id"], r["esasNo"], r["kararNo"], r["court"], r["chamber"]), Idx(HGK))
    assert [(e.esas, e.karar, e.chamber, e.status) for e in ex.decisions] == [("2014/4-56", "2015/1679", "Hukuk Genel Kurulu", "yayinla")]
    r = by_title["Yargıtay Hukuk Genel Kurulu E. 2012/4-179 K. 2012/412"]
    ex = extract_record(r["text"], RecordMeta(r["id"], r["esasNo"], r["kararNo"], r["court"], r["chamber"]), Idx())
    assert sorted(d.work["authors"][0] for d in ex.doctrine) == ["Akipek, Jale Güral", "Köprülü, Bülent", "Uygur, Turgut", "İmre, Zahit"]
    assert all(d.status == "yayinla" for d in ex.doctrine)
