"""Doctrine parser, names, work clustering and "age." resolution.

Real quotes (HGK 2012/4-179 of packages/casuist/fixtures) are marked REAL; the others are constructed from the
plan 6.5/2 and SRS 9.4 examples and are not claimed to be quotes of a decision.
"""

from __future__ import annotations

from citations.doctrine import extract_doctrine
from citations.names import compatible, looks_like_name, parse_name, split_authors, strip_titles
from citations.works import WorkRegistry, resolve_document, title_similarity

REAL_HGK = (
    '"Şahsiyet hakkı, şahsın bedeni ve maddi tamamiyetine ... haktır"( Jale Güral Akipek, Türk Medeni Hukuku, C.I, '
    "Başlangıç Hükümleri - Şahsın Hukuku, Ankara 1961, s.108);  veya kişilik hakkı ... bir haktır\" (Zahit İmre, "
    "Medeni Hukuka Giriş, 3.Baskı, İstanbul 1980, s.445); şeklindeki tanımın yanında \"kişilik hakkı ...\" "
    "(Bülent Köprülü, Medeni Hukuk, 2.Baskı, İstanbul 1984, s.263) şeklinde tanımlar da yapılmıştır. "
    "(Turgut Uygur, Açıklamalı–İçtihatlı Borçlar Kanunu Sorumluluk ve Tazminat Hukuku, İkinci Cilt, Ankara 2003, s.2268)"
)


def test_real_hgk_footnotes():  # REAL
    ms = extract_doctrine(REAL_HGK)
    assert [(m.authors[0].surname, m.title, m.place, m.year, m.pages) for m in ms] == [
        ("Akipek", "Türk Medeni Hukuku", "Ankara", 1961, "108"),
        ("İmre", "Medeni Hukuka Giriş", "İstanbul", 1980, "445"),
        ("Köprülü", "Medeni Hukuk", "İstanbul", 1984, "263"),
        ("Uygur", "Açıklamalı–İçtihatlı Borçlar Kanunu Sorumluluk ve Tazminat Hukuku", "Ankara", 2003, "2268"),
    ]
    assert ms[0].volume == "I" and ms[0].extras == ["Başlangıç Hükümleri - Şahsın Hukuku"]
    assert ms[1].edition == "3" and ms[2].edition == "2"
    assert ms[3].volume == "ikinci"
    assert all(m.confidence >= 0.9 for m in ms)


def test_plan_example_oguzman_oz():
    (m,) = extract_doctrine("Oğuzman/Öz, Borçlar Hukuku Genel Hükümler, İstanbul 1995, s. 373 vd.")
    assert [a.surname for a in m.authors] == ["Oğuzman", "Öz"]
    assert (m.title, m.place, m.year, m.pages, m.vd) == ("Borçlar Hukuku Genel Hükümler", "İstanbul", 1995, "373", True)


def test_colon_style_surname_initials_and_titles():
    (m,) = extract_doctrine("Oğuzman, K./Öz, T.: Borçlar Hukuku Genel Hükümler, C.1, İstanbul 1995, s.373")
    assert [(a.surname, a.given) for a in m.authors] == [("Oğuzman", "K."), ("Öz", "T.")]
    assert m.volume == "1"
    (m,) = extract_doctrine("Prof. Dr. Turgut Akıntürk, Eşya Hukuku, 12. Bası, Ankara 2008, s. 15-17.")
    assert (m.authors[0].surname, m.authors[0].given, m.edition, m.pages) == ("Akıntürk", "Turgut", "12", "15-17")


def test_lone_given_name_after_surname_is_flagged_ambiguous():
    (m,) = extract_doctrine("von Tuhr, Andreas, Borçlar Hukuku, C.1, çev. Edege, Ankara 1983, s. 5")
    assert (m.authors[0].surname, m.authors[0].given, m.title) == ("von Tuhr", "Andreas", "Borçlar Hukuku")
    assert "ad_belirsiz" in m.evidence and m.confidence < 0.9  # goes to the editor, not published


def test_article_form():
    (m,) = extract_doctrine("Arslan Öncü, Mehmet, Unutulma Hakkı, Ankara Barosu Dergisi, C. 3, S. 2, 2011, s. 100")
    assert m.form == "article" and m.venue == "Ankara Barosu Dergisi" and m.year == 2011


def test_back_references_and_short_titles_are_unresolved_by_the_parser():
    t = "Oğuzman/Öz, Borçlar Hukuku Genel Hükümler, İstanbul 1995, s. 373. Oğuzman/Öz, age., s. 374; age., s. 380; Reisoğlu, Genel Hükümler, s. 12"
    forms = [m.form for m in extract_doctrine(t)]
    assert forms == ["full", "ibid", "ibid", "short"]


def test_no_false_positives_on_statute_and_decision_pages():
    for t in (
        "6098 s. TBK m. 58 uyarınca",
        "5237 s. TCK'nın 135. maddesi, s. 12 sıra sayılı",
        "Yargıtay Hukuk Genel Kurulunun kararı, s. 5",
        "Bkz. Yargıtay, İçtihat, İstanbul 1990, s. 5",
    ):
        assert extract_doctrine(t) == [], t


def test_names():
    assert strip_titles("Prof. Dr. Yrd. Doç. Dr. Av. Ahmet Kılıç") == "Ahmet Kılıç"
    n = parse_name("Jale Güral Akipek")
    assert (n.surname, n.given, n.key) == ("Akipek", "Jale Güral", "akipek")
    assert parse_name("İMRE, Zahit").key == "imre"
    assert [a.key for a in split_authors("Oğuzman/Öz")] == ["oguzman", "oz"]
    assert [a.key for a in split_authors("Kemal Oğuzman ve Turgut Öz")] == ["oguzman", "oz"]
    assert compatible(parse_name("Jale Güral Akipek"), parse_name("Akipek, J."))
    assert not compatible(parse_name("Ali Öz"), parse_name("Veli Öz"))
    assert compatible(parse_name("Mehmet Arslan Öncü"), parse_name("Arslan Öncü, Mehmet")) is True
    assert not looks_like_name("Yargıtay Hukuk Genel Kurulu") and not looks_like_name("kanunun 135")


def test_editions_collapse_into_one_work_and_volumes_do_not_split():
    reg = WorkRegistry()
    a = extract_doctrine("Reisoğlu, Borçlar Hukuku Genel Hükümler, 21. Bası, İstanbul 2008, s. 12")[0]
    b = extract_doctrine("Reisoğlu, Borçlar Hukuku Genel Hukümler, 24. Bası, İstanbul 2011, s. 40")[0]  # typo in title
    c = extract_doctrine("Reisoğlu, Borçlar Hukuku Özel Hükümler, 5. Bası, Ankara 2010, s. 7")[0]
    wa, wb, wc = reg.add(a), reg.add(b), reg.add(c)
    assert wa.key == wb.key != wc.key
    assert sorted(e["year"] for e in wa.editions) == [2008, 2011]
    assert title_similarity("Borçlar Hukuku Genel Hükümler", "Borçlar Hukuku Özel Hükümler") < 0.85


def test_age_resolution_within_document():
    text = (
        "Oğuzman/Öz, Borçlar Hukuku Genel Hükümler, İstanbul 1995, s. 373 vd.\n"
        "Reisoğlu, Borçlar Hukuku Genel Hükümler, İstanbul 2008, s. 12\n"
        "Oğuzman/Öz, age., s. 380\n"
        "age., s. 14\n"
        "Reisoğlu, Genel Hükümler, s. 20\n"
    )
    res = resolve_document(extract_doctrine(text), WorkRegistry())
    assert [r.via for r in res] == ["tam", "tam", "age", "age", "kisa_baslik"]
    assert res[2].work.authors[0].key == "oguzman" and res[2].confidence >= 0.9
    assert res[3].work.authors[0].key == "oguzman" and res[3].confidence >= 0.9  # author-less, directly after
    assert res[4].work.authors[0].key == "reisoglu" and res[4].confidence >= 0.9


def test_ambiguous_and_unresolved_back_references_stay_below_publish_line():
    two = (
        "Oğuzman, Medeni Hukuk, İstanbul 1995, s. 5\nOğuzman, Eşya Hukuku, İstanbul 1996, s. 6\n"
        "Oğuzman, age., s. 7"
    )
    res = resolve_document(extract_doctrine(two), WorkRegistry())
    assert res[2].work.title == "Eşya Hukuku" and res[2].confidence < 0.9  # most recent, flagged
    res = resolve_document(extract_doctrine("age., s. 7"), WorkRegistry())
    assert res[0].work is None and res[0].confidence < 0.5
    res = resolve_document(extract_doctrine("Köprülü, Medeni Hukuk, s. 7"), WorkRegistry())
    assert res[0].work is None and res[0].confidence < 0.5


def test_authorless_age_is_far_when_a_decision_citation_stands_between():
    text = "Oğuzman, Medeni Hukuk, İstanbul 1995, s. 5. Yargıtay 4. Hukuk Dairesinin 2020/1 E., 2021/2 K. sayılı kararı. age., s. 7"
    mentions = extract_doctrine(text)
    from citations.decisions import extract_decisions

    res = resolve_document(mentions, WorkRegistry(), [d.num_start for d in extract_decisions(text)])
    assert res[1].confidence < 0.9
