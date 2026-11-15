"""Turkish suffix handling in the rule and role layers. All names below are SYNTHETIC."""

from __future__ import annotations

from typing import List

import pytest

from anonymizer.ner import normalize_spans
from anonymizer.pipeline import anonymize
from anonymizer.policy import default_policy
from anonymizer.roles import SUFFIX_SCORE, find_suffixed_names, propagate
from anonymizer.spans import Span
from anonymizer.suffixes import is_suffix, name_key, person_end, split_apostrophe


@pytest.mark.parametrize("ending", [
    "ın", "in", "un", "ün", "nın", "nin", "nun", "nün", "a", "e", "ya", "ye", "ı", "i", "yı", "yi", "da", "de", "ta",
    "te", "dan", "den", "tan", "ten", "la", "le", "yla", "yle", "ca", "çe", "lar", "ler", "ların", "lara", "lardan",
    "daki", "deki", "nınki", "ındaki", "dır", "dir", "tır", "ydı", "NUN", "IN", "DAN", "YA",
])
def test_inflectional_endings(ending: str) -> None:
    assert is_suffix(ending)


@pytest.mark.parametrize("ending", ["", "Neil", "neil", "oğlu", "lı", "ci", "gil", "xyz", "an", "abcdefghijklm",
                                    "ın1", "ın-"])
def test_not_inflectional_endings(ending: str) -> None:
    assert not is_suffix(ending)


def test_split_apostrophe() -> None:
    assert split_apostrophe("Yılmaz'ın") == ("Yılmaz", "ın")
    assert split_apostrophe("Kaya’ya") == ("Kaya", "ya")
    assert split_apostrophe("Demir`den") == ("Demir", "den")
    assert split_apostrophe("YILMAZ'IN") == ("YILMAZ", "IN")
    assert split_apostrophe("TOPÇUOĞLU'nun") == ("TOPÇUOĞLU", "nun")
    # Foreign names with an apostrophe stay whole; so do odd capitalisations and one letter stems.
    assert split_apostrophe("O'Neil") is None and split_apostrophe("O'NEIL") is None
    assert split_apostrophe("D'Angelo") is None and split_apostrophe("Yılmaz'In") is None
    assert split_apostrophe("A'nın") is None and split_apostrophe("Yılmaz") is None


def test_name_key_ignores_endings_case_and_spacing() -> None:
    keys = {name_key(n) for n in ["Ahmet Yılmaz", "Ahmet Yılmaz'ın", "AHMET YILMAZ'A", "Ahmet  Yılmaz’dan",
                                  "ahmet yılmaz'"]}
    assert keys == {"ahmet yılmaz"}
    assert name_key("John O'Neil") == "john o'neil"
    assert name_key("İSMAİL HAKKI") == "ismail hakkı"


def test_person_end() -> None:
    t = "Ahmet Yılmaz'ın beyanı"
    assert t[: person_end(t, 0, 15)] == "Ahmet Yılmaz"
    assert person_end(t, 0, 12) == 12
    t2 = "tercüman John O'Neil"
    assert person_end(t2, 9, len(t2)) == len(t2)


def _norm(text: str) -> List[str]:
    return [text[s.start : s.end] for s in normalize_spans(text, Span(0, len(text), "PERSON", "ner:x", 0.9))]


def test_ner_spans_lose_the_apostrophe_ending() -> None:
    assert _norm("Ahmet Yılmaz'ın") == ["Ahmet Yılmaz"]
    assert _norm("Av. Hülya Durukan'a") == ["Hülya Durukan"]
    assert _norm("Ayşe Yılmaz İnşaat'ın") == ["Ayşe Yılmaz"]
    assert _norm("John O'Neil") == ["John O'Neil"]
    assert _norm("AHMET YILMAZ'IN") == ["AHMET YILMAZ"]


class SuffixedNer:
    """A model that returns the suffix as part of the name, as BERT models trained on whitespace tokens do."""

    name = "fake"

    def __init__(self, needles, score: float = 0.95):
        self.needles = needles
        self.score = score

    def detect(self, text: str) -> List[Span]:
        out = []
        for needle in self.needles:
            start = 0
            while (i := text.find(needle, start)) >= 0:
                out.append(Span(i, i + len(needle), "PERSON", "ner:fake", self.score))
                start = i + len(needle)
        return out


def test_one_person_one_label_across_endings() -> None:
    text = ("Ahmet Yılmaz'ın talebi reddedildi. Davacı Ahmet Yılmaz dava açmıştır. Ahmet Yılmaz'a tebligat yapıldı. "
            "Yılmaz'dan alınan para iade edilmemiştir.")
    r = anonymize(text, ner=SuffixedNer(["Ahmet Yılmaz'ın", "Ahmet Yılmaz'a"]))
    out = r.masked_text
    assert "Ahmet" not in out and "Yılmaz" not in out
    assert out == ("[Davacı]'ın talebi reddedildi. Davacı [Davacı] dava açmıştır. [Davacı]'a tebligat yapıldı. "
                   "[Davacı]'dan alınan para iade edilmemiştir.")


def test_cued_names_with_endings_in_the_rule_layer() -> None:
    text = ("Tanık Mert Demir'in beyanına göre davalı Ayşe Kaya’ya ödeme yapılmıştır. Kaya’nın itirazı "
            "yerinde değildir. Sanık ERDAL KÖSEOĞLU'NUN savunması alındı, KÖSEOĞLU'NA ceza verildi.")
    out = anonymize(text).masked_text
    for name in ("Mert", "Demir", "Ayşe", "Kaya", "ERDAL", "KÖSEOĞLU"):
        assert name not in out
    assert "[Tanık 1]'in" in out and "[Davalı]’ya" in out and "[Davalı]’nın" in out
    assert "[Sanık 1]'NUN" in out and "[Sanık 1]'NA" in out


def test_full_name_with_a_glued_ending_is_masked_whole() -> None:
    text = "Davacı Ahmet Yılmaz dava açmıştır. Dilekçede AHMET YILMAZIN imzası vardır. Ali Canan dinlendi."
    out = anonymize(text).masked_text
    assert "YILMAZIN" not in out and "Dilekçede [Davacı] imzası" in out
    # "an" is not an inflectional ending: another person's name is not taken for this one.
    t = "Ali Can geldi. Ali Canan gitti."
    seeds = [Span(0, 7, "PERSON", "context:cue", 0.92, key="ali can")]
    assert [(s.start, s.end) for s in propagate(t, seeds)] == [(0, 7), (4, 7)]


def test_suffixed_names_without_a_cue_go_to_review() -> None:
    text = ("Dosya kapsamına göre Tarkan Özdağ'a ait araç izinsiz kullanılmıştır. Ancak Volkan Erdoğdu'nun ifadesi "
            "çelişkilidir. Erdoğdu'dan alınan para iade edilmemiştir.")
    found = {text[s.start : s.end]: s for s in find_suffixed_names(text)}
    assert set(found) == {"Tarkan Özdağ", "Volkan Erdoğdu"}
    assert all(s.score == SUFFIX_SCORE < default_policy().review_threshold for s in found.values())
    r = anonymize(text, require_ner=False)
    assert "Özdağ" not in r.masked_text and "Erdoğdu" not in r.masked_text and "Volkan" not in r.masked_text
    assert "Ancak [Kişi 2]'nun" in r.masked_text and "[Kişi 2]'dan" in r.masked_text
    assert r.review and not r.publishable  # propagation does not lift a weak seed over the threshold


def test_a_confirming_model_span_clears_the_review() -> None:
    text = "Dosya kapsamına göre Tarkan Özdağ'a ait araç izinsiz kullanılmıştır."
    r = anonymize(text, ner=SuffixedNer(["Tarkan Özdağ'a"]), require_ner=False)
    assert "Özdağ" not in r.masked_text and not r.review and r.publishable


def test_low_confidence_model_span_stays_in_review() -> None:
    text = "Olay günü Kemal Sarıgül olay yerindeydi."
    r = anonymize(text, ner=SuffixedNer(["Kemal Sarıgül"], score=0.6), require_ner=False)
    assert "Sarıgül" not in r.masked_text
    assert [m.detector for m in r.review] == ["ner:fake"]


@pytest.mark.parametrize("text", [
    "Yargıtay Hukuk Genel Kurulu'nun kararı", "İstanbul Bölge Adliye Mahkemesi'nin ilamı", "Ankara Barosu'na yazı",
    "Türk Medeni Kanunu'nun 166. maddesi", "Avrupa İnsan Hakları Sözleşmesi'nin 6. maddesi",
    "Birleşmiş Milletler'in raporu", "Resmi Gazete'de yayımlanan", "Kurban Bayramı'nda", "Yeni Zelanda'da",
    "Kuzey Irak'ta", "Ziraat Bankası'na", "Türk Hava Yolları'nın", "Sosyal Güvenlik Kurumu'nun",
    "Milli Eğitim Bakanlığı'nın", "Kadıköy Belediyesi'nin", "Borçlar Hukuku'nda", "Atatürk Bulvarı'nda",
    "Ankara'da", "Yargıtay'ın", "HMK'nın", "2020'de", "15 Mart'ta", "tercüman John O'Neil geldi",
    "Davalı Şirket Yetkilisi'nin beyanı", "Ayşe Kaya-Demir'in",
])
def test_places_institutions_and_single_words_are_not_names(text: str) -> None:
    assert find_suffixed_names(text) == []


def test_forms_of_address_and_sentence_openers_stay_outside_the_name() -> None:
    for text in ("Sayın Ahmet Yılmaz'ın talebi", "Ancak Ahmet Yılmaz'ın talebi", "Uzmanı Ahmet Yılmaz'ın raporu"):
        assert [(text[s.start : s.end], s.key) for s in find_suffixed_names(text)] == [
            ("Ahmet Yılmaz", "ahmet yılmaz")]
