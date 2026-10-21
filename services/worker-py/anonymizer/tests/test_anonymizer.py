"""Anonymizer tests. All text below is SYNTHETIC; numbers are generated to pass check digits only."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

from anonymizer import ENGINE_VERSION
from anonymizer.checksums import (iban_complete, iban_valid, luhn_complete, luhn_valid, tckn_complete, tckn_valid,
                                  vkn_complete, vkn_valid)
from anonymizer.job import InvalidPayload, RecordNotFound, make_anon_run_handler
from anonymizer.ner import CANDIDATES, NullBackend, load_backend
from anonymizer.pipeline import anonymize
from anonymizer.policy import default_policy
from anonymizer.roles import Labeler
from anonymizer.spans import Span, resolve_overlaps
from anonymizer.store import MemoryAnonStore, SqlAnonStore
from anonymizer.structural import detect_structural
from core.jobs import ClaimedJob, JobConsumer, JobType

ROOT = Path(__file__).resolve().parents[4]
EVAL = ROOT / "eval" / "anon"

TCKN = tckn_complete("123456780")
VKN = vkn_complete("123456789")
IBAN = iban_complete("TR", "0006200010000000000001")
CARD = luhn_complete("411111111111111")


def test_checksums() -> None:
    assert tckn_valid("10000000146")
    assert not tckn_valid("10000000147")
    assert not tckn_valid("01234567890")
    assert tckn_valid(TCKN)
    assert vkn_valid(VKN) and not vkn_valid(VKN[:9] + str((int(VKN[9]) + 1) % 10))
    assert iban_valid(IBAN) and len(IBAN) == 26
    assert not iban_valid(IBAN[:-1] + ("0" if IBAN[-1] != "0" else "1"))
    assert luhn_valid("4111 1111 1111 1111") and luhn_valid(CARD)
    assert not luhn_valid("4111111111111112")


def _ents(text: str) -> set:
    return {s.entity for s in detect_structural(text)}


def test_structural_recognizers() -> None:
    assert _ents(f"T.C. kimlik no {TCKN} olan") == {"TCKN"}
    assert _ents(f"vergi kimlik no {VKN}") == {"VKN"}
    assert _ents(f"hesap {IBAN[:4]} {IBAN[4:8]} {IBAN[8:12]} {IBAN[12:16]} {IBAN[16:20]} {IBAN[20:24]} {IBAN[24:]}") == {"IBAN"}
    assert _ents(f"kart {CARD}") == {"CARD"}
    assert _ents("telefon 0532 111 22 33 ve +90 312 444 55 66") == {"PHONE"}
    assert _ents("e-posta deneme.kisi@ornekposta.test") == {"EMAIL"}
    assert _ents("34 ABC 1234 plakalı araç") == {"PLATE"}
    assert _ents("1203 ada 45 parsel sayılı taşınmaz") == {"PARCEL"}
    assert _ents("Lale Mahallesi, Defne Sokak No: 12/3 adresinde") == {"ADDRESS"}
    assert "DOB" in _ents("doğum tarihi: 12.03.1988")
    assert "DOB" in _ents("12 Mart 1988 doğumlu")
    assert _ents("pasaport no: U12345678") == {"PASSPORT"}


def test_structural_negatives() -> None:
    # Court citations, case numbers and plain event dates stay open (Ek E).
    text = "Yargıtay 19 HD 2021/1234 E., 2024/567 K. sayılı ilamı ve 12.03.2020 tarihli sözleşme"
    assert detect_structural(text) == []
    assert _ents("sayı 12345678901") == set()  # invalid check digit and no id context


def test_unverified_id_goes_to_review() -> None:
    r = anonymize("Davacının T.C. kimlik no 12345678901 olarak yazılmıştır.")
    assert "[Kimlik No]" in r.masked_text
    assert r.review and r.review[0].entity == "TCKN" and not r.publishable


def test_roles_and_consistency() -> None:
    text = ("DAVACI : Selin Akbulut\nDAVALI : Okan Tezcan\nDavacı vekili Av. Derya Ilgaz dilekçesinde davalı "
            "Okan Tezcan'ın borcu ödemediğini belirtmiştir. Tanık Kerem Uluçay ve tanık Nur Evrenli dinlendi. "
            "Bilirkişi Ufuk Gökdemir rapor verdi. Tanık Uluçay beyanı esas alındı.")
    r = anonymize(text)
    out = r.masked_text
    assert "Selin" not in out and "Tezcan" not in out and "Ilgaz" not in out and "Uluçay" not in out
    assert out.count("[Davalı]") == 2
    assert "[Vekil]" in out and "[Bilirkişi]" in out
    assert "[Tanık 1]" in out and "[Tanık 2]" in out
    assert out.index("[Tanık 1]") < out.index("[Tanık 2]")
    # Surname only mention keeps the same label.
    assert out.endswith("Tanık [Tanık 1] beyanı esas alındı.")


def test_sanik_numbering_and_child_strict() -> None:
    text = ("Sanık Emre Kocabey ve sanık Barış Şahinalp hakkında. Mağdur çocuk Aslı Durukan 9 yaşında olup "
            "Menekşe İlkokulu öğrencisidir. Mağdurun epilepsi tanısı vardır.")
    r = anonymize(text)
    assert "[Sanık 1]" in r.masked_text and "[Sanık 2]" in r.masked_text
    assert "[Çocuk A]" in r.masked_text and "[Yaş Bilgisi]" in r.masked_text and "[Okul]" in r.masked_text
    assert "[Sağlık Bilgisi]" in r.masked_text
    assert r.child_strict
    row = r.review_queue_row("rec-1")
    assert row is None or row["priority"] >= 50


def test_labeler_letters() -> None:
    spans = [Span(0, 3, "PERSON", "context", 0.9, role="cocuk", key="a"),
             Span(5, 8, "PERSON", "context", 0.9, role="cocuk", key="b"),
             Span(10, 13, "PERSON", "context", 0.9, role="cocuk", key="a")]
    assert Labeler().assign(spans) == {"a": "[Çocuk A]", "b": "[Çocuk B]"}


def test_high_court_member_follows_source() -> None:
    text = "Başkan Hülya Altınpınar ve üye Cem Öztekinler karara katıldı."
    assert "Hülya" not in anonymize(text).masked_text
    assert "Hülya" in anonymize(text, court="AYM").masked_text


def test_sole_proprietor() -> None:
    r = anonymize("DAVALI : Burak Tezcan İnşaat, vergi kimlik no " + VKN)
    assert "[Şahıs İşletmesi] İnşaat" in r.masked_text


def test_resolve_overlaps_prefers_checksum() -> None:
    a = Span(0, 11, "TCKN", "checksum:tckn", 0.99)
    b = Span(0, 11, "PHONE", "structural:phone", 0.95)
    assert resolve_overlaps([b, a]) == [a]


def test_policy_matches_ek_e() -> None:
    p = default_policy()
    masks = " ".join(r["maske"] for r in p.rules)
    for m in ["[Davacı]", "[Davalı]", "[Sanık 1]", "[Mağdur]", "[Tanık 2]", "[Bilirkişi]", "[Vekil]", "[Çocuk A]",
              "[Hâkim]", "[Savcı]", "[Kimlik No]", "[Adres]", "[Telefon]", "[E-posta]", "[IBAN]", "[Kart]",
              "[Plaka]", "[Ada/Parsel]", "[Doğum Tarihi]", "[Sağlık Bilgisi]", "[Şahıs İşletmesi]"]:
        assert m in masks
    assert len(p.rules) == 13
    assert p.open_sources() == ["AYM", "AİHM", "ABAD"]


def test_version_string() -> None:
    r = anonymize("metin")
    assert r.anonymization_version == f"{ENGINE_VERSION}+{default_policy().version}+ner.none"


def test_review_payload_has_no_text() -> None:
    secret = "Gizliad Soyadsız"
    r = anonymize(f"Davacının T.C. kimlik no 12345678901, davacı {secret}.")
    row = r.review_queue_row("rec-9")
    assert row is not None and row["queue"] == "anonymization" and row["subject_id"] == "rec-9"
    dumped = json.dumps(row, ensure_ascii=False)
    assert "Gizliad" not in dumped and "12345678901" not in dumped


def test_anon_run_handler_memory_store() -> None:
    store = MemoryAnonStore({"r1": ("Davacı Selin Akbulut, kimlik no 12345678901.", "Ankara 3. Asliye Hukuk")})
    handle = make_anon_run_handler(lambda: store)
    out = handle(ClaimedJob("j1", JobType.ANON_RUN, {"recordId": "r1"}, 1, 5))
    assert out["review"] == 1 and out["publishable"] is False
    assert "Selin" not in json.dumps(out)
    assert len(store.review_rows) == 1
    handle(ClaimedJob("j2", JobType.ANON_RUN, {"recordId": "r1"}, 1, 5))
    assert len(store.review_rows) == 1  # idempotent
    with pytest.raises(RecordNotFound):
        handle(ClaimedJob("j3", JobType.ANON_RUN, {"recordId": "nope"}, 1, 5))
    with pytest.raises(InvalidPayload):
        handle(ClaimedJob("j4", JobType.ANON_RUN, {}, 1, 5))


class FakeCursor:
    def __init__(self) -> None:
        self.calls: list = []
        self._rows: list = []

    def execute(self, query, params=None):
        self.calls.append((query.split()[0], params))
        self._rows = [("Davacı Selin Akbulut, telefon 0532 111 22 33.", None)] if query.startswith("SELECT") else []

    def fetchall(self):
        return self._rows


def test_sql_store_through_job_consumer() -> None:
    class ConsumerCursor(FakeCursor):
        def fetchall(self):
            if self.calls and self.calls[-1][0] == "WITH":
                return [("j1", "anon.run", {"recordId": "r1"}, 1, 5)]
            return super().fetchall()

    cur = ConsumerCursor()
    consumer = JobConsumer("w", {JobType.ANON_RUN: make_anon_run_handler(lambda: SqlAnonStore(cur))})
    assert consumer.run_once(cur, JobType.ANON_RUN) == 1
    verbs = [c[0] for c in cur.calls]
    # two spans, then the embed.chunks job (publishable: masked_text is written)
    assert verbs[0] == "WITH" and "SELECT" in verbs and "DELETE" in verbs and verbs.count("INSERT") == 3
    record_update = next(p for v, p in cur.calls if v == "UPDATE" and p and "masked" in p)
    assert record_update["anonymized"] is True and "Selin" not in record_update["masked"]
    assert record_update["masked"] == "Davacı [Davacı], telefon [Telefon]."
    at = next(i for i, (_, p) in enumerate(cur.calls) if p and "dedupe_key" in p)
    embed = cur.calls[at]
    assert cur.calls[at - 1][1] is record_update  # queued right after masked_text is written
    assert embed[0] == "INSERT" and embed[1]["dedupe_key"] == "embed:r1"
    assert json.loads(embed[1]["payload"]) == {"recordId": "r1"}
    final = cur.calls[-1]
    assert final[0] == "UPDATE" and "Selin" not in json.dumps(final[1], default=str)


def test_masked_text_is_null_and_no_embed_while_review_is_open() -> None:
    class Cur(FakeCursor):
        def execute(self, query, params=None):
            self.calls.append((query.split()[0], params))
            self._rows = [("Davacı Selin Akbulut, kimlik no 12345678901.", None)] if query.startswith("SELECT") else []

    cur = Cur()
    out = make_anon_run_handler(lambda: SqlAnonStore(cur))(ClaimedJob("j", JobType.ANON_RUN, {"recordId": "r2"}, 1, 5))
    assert out["publishable"] is False
    record_update = next(p for v, p in cur.calls if v == "UPDATE" and p and "masked" in p)
    assert record_update["masked"] is None and record_update["anonymized"] is False
    assert not any(p and "dedupe_key" in p for _, p in cur.calls)  # embed.chunks is not queued

    mem = MemoryAnonStore({"a": ("Davacı Selin Akbulut, kimlik no 12345678901.", None),
                           "b": ("Davacı Selin Akbulut, telefon 0532 111 22 33.", None)})
    handle = make_anon_run_handler(lambda: mem)
    handle(ClaimedJob("j1", JobType.ANON_RUN, {"recordId": "a"}, 1, 5))
    handle(ClaimedJob("j2", JobType.ANON_RUN, {"recordId": "b"}, 1, 5))
    handle(ClaimedJob("j3", JobType.ANON_RUN, {"recordId": "b"}, 1, 5))
    assert mem.masked_text == {"a": None, "b": "Davacı [Davacı], telefon [Telefon]."}
    assert mem.embed_jobs == ["b"]


def test_masked_text_matches_saved_spans() -> None:
    """records.masked_text must equal the original text with the saved anonymization_spans applied."""
    for path in sorted((EVAL / "sentetik").glob("*.json"))[:10]:
        text = json.loads(path.read_text(encoding="utf-8"))["text"]
        r = anonymize(text)
        rebuilt, cursor = [], 0
        for s in r.spans:
            assert s.start >= cursor
            rebuilt += [text[cursor : s.start], s.mask]
            cursor = s.end
        assert "".join(rebuilt) + text[cursor:] == r.masked_text


def test_ner_candidates_and_missing_model(tmp_path) -> None:
    assert set(CANDIDATES) == {"hushmark-berturk-112m", "akdeniz27", "savasy", "gliner-multi-v2.1"}
    assert CANDIDATES["gliner-multi-v2.1"].license == "apache-2.0"
    with pytest.raises(FileNotFoundError):
        load_backend("akdeniz27", root=tmp_path)
    assert NullBackend().detect("x") == []


def test_ner_backend_spans_get_roles() -> None:
    class Fake:
        name = "fake"

        def detect(self, text):
            i = text.index("Mert")
            return [Span(i, i + len("Mert Yamaner"), "PERSON", "ner:fake", 0.97)]

    r = anonymize("Olay günü tanık olarak dinlenen Mert Yamaner beyanında, Yamaner olayı gördü.", ner=Fake())
    assert "Mert" not in r.masked_text and "[Tanık 1]" in r.masked_text
    assert r.anonymization_version.endswith("+ner.fake")


def test_presidio_bridge_optional() -> None:
    pytest.importorskip("presidio_analyzer")
    from anonymizer.presidio_bridge import as_presidio_recognizer

    res = as_presidio_recognizer().analyze(f"kimlik no {TCKN}", ["TR_TCKN"])
    assert res and res[0].entity_type == "TR_TCKN"


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, EVAL / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def test_measure_and_kappa() -> None:
    m = _load("measure")
    docs = [{"id": "d", "text": "Ali Can geldi", "annotations_a": [{"start": 0, "end": 7, "entity": "PERSON"}],
             "annotations_b": [{"start": 0, "end": 3, "entity": "PERSON"}]}]
    res = m.score_documents(docs, lambda t: [{"start": 0, "end": 7, "entity": "PERSON"},
                                             {"start": 8, "end": 13, "entity": "PHONE"}])
    assert res["per_entity"]["PERSON"]["recall"] == 1.0
    assert res["per_entity"]["PHONE"]["precision"] == 0.0
    assert m.cohen_kappa(list("aabb"), list("aabb")) == 1.0
    assert abs(m.cohen_kappa(list("aabb"), list("abab"))) < 1e-9
    assert m.kappa_for(docs)["double_annotated"] == 1


def test_synthetic_set_is_valid_and_reproducible() -> None:
    g = _load("generate")
    docs = g.generate()
    assert len(docs) == 50
    on_disk = sorted((EVAL / "sentetik").glob("*.json"))
    assert len(on_disk) == 50
    assert json.loads(on_disk[0].read_text(encoding="utf-8")) == docs[0]
    for d in docs:
        assert d["synthetic"] is True
        for a in d["annotations_a"]:
            frag = d["text"][a["start"] : a["end"]]
            if a["entity"] == "TCKN":
                assert tckn_valid(frag)
            if a["entity"] == "IBAN":
                assert iban_valid(frag)
