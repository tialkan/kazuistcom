"""Decision citation patterns. Quotes are short excerpts of public court decisions (FSEK m.31) as they appear
in the Yargitay decisions of packages/casuist/fixtures, plus the pattern examples of plan 6.5/1."""

from __future__ import annotations

from citations.decisions import extract_decisions


def one(text: str):
    ms = extract_decisions(text)
    assert len(ms) == 1, ms
    return ms[0]


def test_hgk_letter_first_with_date_in_front():
    # 4. HD 2023/12295 cites the HGK decision of the SRS example (E.2014/4-56, K.2015/1679).
    t = "Yargıtay Hukuk Genel Kurulunun 17/6/2015 tarihli ve E.2014/4-56, K.2015/1679 sayılı kararında"
    m = one(t)
    assert (m.court, m.chamber, m.esas, m.karar, m.date) == ("Yargıtay", "Hukuk Genel Kurulu", "2014/4-56", "2015/1679", "2015-06-17")
    assert t[m.start : m.end].startswith("Yargıtay Hukuk Genel Kurulunun")
    assert t[m.num_start : m.num_end] == "E.2014/4-56, K.2015/1679"


def test_esas_karar_words_and_dash_form():
    m = one("Yargıtay 19. Ceza Dairesinin 05/06/2017 tarihli ve 2016/15510 esas, 2017/5325 karar sayılı ilamında")
    assert (m.chamber, m.esas, m.karar, m.date) == ("19. Ceza Dairesi", "2016/15510", "2017/5325", "2017-06-05")
    m = one("Yargıtay Ceza Genel Kurulunun 17.06.2014 tarihli, 2012/1510 Esas - 2014/331 sayılı Kararında")
    assert (m.chamber, m.esas, m.karar, m.date) == ("Ceza Genel Kurulu", "2012/1510", "2014/331", "2014-06-17")


def test_plan_examples():
    m = one("E. 2013/19-199 K. 2013/1418 T. 13.11.2013")
    assert (m.esas, m.karar, m.date, m.court) == ("2013/19-199", "2013/1418", "2013-11-13", None)
    m = one("4. HD 2021/26076 E., 2024/10643 K.")
    assert (m.esas, m.karar) == ("2021/26076", "2024/10643")
    m = one("HGK'nın 13.11.2013 tarih ve 2013/19-199 E., 2013/1418 K. sayılı kararı")
    assert (m.chamber, m.court, m.date) == ("Hukuk Genel Kurulu", "Yargıtay", "2013-11-13")


def test_ibk_kurul_defaults_court_but_bare_chamber_does_not():
    m = one("İçtihadı Birleştirme Büyük Genel Kurulunun 2012/1 E., 2013/2 K. sayılı kararı")
    assert (m.court, m.chamber) == ("Yargıtay", "İçtihadı Birleştirme")
    m = one("7. Hukuk Dairesinin 2020/1 E., 2021/2 K. sayılı kararı")
    assert m.court is None and m.chamber == "7. Hukuk Dairesi"  # could be a regional court: not guessed


def test_aym_individual_application_and_norm_review():
    m = one("Anayasa Mahkemesinin 04.10.2017 tarihli, 2014/18260 başvuru sayılı bireysel başvuru kararında")
    assert (m.kind, m.number, m.date, m.court) == ("aym", "2014/18260", "2017-10-04", "Anayasa Mahkemesi")
    assert one("AYM, B. No: 2014/1234, 12.3.2015").number == "2014/1234"
    m = one("Anayasa Mahkemesinin 12.3.2014 tarihli ve E.2013/19, K.2014/12 sayılı kararı")
    assert (m.kind, m.esas, m.karar) == ("aym", "2013/19", "2014/12")


def test_abad_and_aihm_numbers():
    m = one("ABAD'ın Google Spain kararı (C-131/12) uyarınca")
    assert (m.kind, m.number) == ("abad", "C-131/12")
    assert one("Case T‑72/09 P").number is None or True  # non breaking hyphen is accepted without crashing
    m = one("Avrupa İnsan Hakları Mahkemesi, no. 12345/09, 5.5.2010")
    assert (m.kind, m.number) == ("aihm", "12345/09")
    assert extract_decisions("dosya no. 2014/12") == []  # shape of an AYM number without an AIHM context


def test_lower_court_mentions_are_marked_not_dropped_silently():
    t = "MAHKEMESİ : İstanbul Bölge Adliye Mahkemesi 4. Hukuk Dairesi SAYISI : 2021/3086 E., 2023/2884 K."
    m = one(t)
    assert m.court == "alt" and m.chamber is None
    m = one("İstanbul Anadolu 6. Aile Mahkemesinin 02.04.2014 tarihli ve 2011/637 E., 2014/318 K. sayılı kararı")
    assert m.court == "alt"


def test_court_name_does_not_leak_across_separators():
    ms = extract_decisions("(AİHM); 2004/311-2005/94 E.K. sayılı")
    assert len(ms) == 1 and ms[0].court is None and (ms[0].esas, ms[0].karar) == ("2004/311", "2005/94")


def test_two_citations_keep_their_own_court():
    t = (
        "Yargıtay 2. Hukuk Dairesinin 14.04.2015 tarihli ve 2014/15458 E., 2015/7409 K. sayılı kararı ile; "
        "Yargıtay Hukuk Genel Kurulunun 17/6/2015 tarihli ve E.2014/4-56, K.2015/1679 sayılı kararında"
    )
    a, b = extract_decisions(t)
    assert a.chamber == "2. Hukuk Dairesi" and b.chamber == "Hukuk Genel Kurulu"


def test_no_false_positive_on_case_like_numbers():
    for t in (
        "Tebliğname KYB-2022/138092 sayılı",
        "5237 sayılı Kanun'un 135. maddesi, 818 s. BK. 49",
        "13.11.2013 tarihinde 2013/1418 numaralı dosya",
        "Dosya no 2013/19-199",
    ):
        assert extract_decisions(t) == [], t
