"""Context based person detection, role labelling and in-document consistency (plan 6.4/3).

The rule layer finds names that follow a role cue ("davacı Ayşe Kaya", "Tanık: Mert Demir") and names of two to
four words written with an apostrophe ending ("Ahmet Yılmaz'ın", see suffixes.py), then propagates every found
name to its other mentions in the same document. The same person always gets the same label within a document;
numbering follows order of first appearance. Keys ignore apostrophe endings, so "Ahmet Yılmaz'a" and
"Ahmet Yılmaz'dan" are one person.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

from .spans import Span
from .suffixes import APOSTROPHES, SUFFIX, apostrophe_ending_at, name_key, split_apostrophe, tr_fold

UP = "A-ZÇĞİÖŞÜÂÎÛ"
LO = "a-zçğıöşüâîû"
NAME_WORD = rf"(?:[{UP}][{LO}]+|[{UP}]{{2,}})"
TITLE = r"(?:(?:Av\.|Avukat|Dr\.|Doç\.|Prof\.|Uzm\.|Op\.|Sn\.)\s*)*"
_APOS_CLASS = f"[{re.escape(APOSTROPHES)}]"

# Order matters: longer cues first. Each tuple: (regex, role)
CUES: List[Tuple[str, str]] = [
    (r"suça\s+sürüklenen\s+çocuk|mağdur\s+çocuk|müşterek\s+çocu[kğ]\w*|SSÇ|küçük|çocu[kğ]\w*", "cocuk"),
    (r"davac[ıi]\w*\s+vekil\w*|daval[ıi]\w*\s+vekil\w*|katılan\s+vekil\w*|vekil\w*|müdafi\w*|Av\.|Avukat", "vekil"),
    (r"davac[ıi]\w*", "davaci"),
    (r"daval[ıi]\w*", "davali"),
    # Label form only ("Başvurucu : Ad SOYAD"): in running text the word is followed by institutions ("takiben
    # başvurucunun Adalet Bakanlığına başvuru tarihinden").
    (r"başvurucu(?:lar)?(?=[ \t]*:)", "basvurucu"),
    (r"sanı[kğ]\w*", "sanik"),
    (r"mağdur\w*", "magdur"),
    (r"katılan\w*", "katilan"),
    (r"müşteki\w*", "musteki"),
    (r"tanı[kğ]\w*", "tanik"),
    (r"bilirkişi\w*", "bilirkisi"),
    (r"arabulucu\w*", "arabulucu"),
    (r"Cumhuriyet\s+Savcıs\w*|savcı\w*", "savci"),
    (r"raportör\w*", "raportor"),
    (r"hâkim\w*|hakim\w*|başkan\w*|üye\w*", "hakim"),
]

# Capitalised words that are never person names in court texts.
STOP = {
    w.replace("İ", "i").replace("I", "ı").lower()
    for w in (
        "Mahkemesi Mahkeme Daire Dairesi Hukuk Ceza Asliye Ağır Sulh İcra Aile İş Tüketici Bölge Adliye Yargıtay "
        "Danıştay Anayasa Kurul Kurulu Genel Başsavcılığı Cumhuriyet Başsavcılığı Savcılığı Vekili Vekil "
        "Davacı Davalı Sanık Tanık Bilirkişi Mağdur Katılan Müşteki Arabulucu Hâkim Hakim Başkan Üye Kâtip "
        "Başkanvekili Başkanvekilleri Üyeler Üyesi Raportör Başvurucu Başvurucular "
        "Esas Karar Tarih Sayı Dosya Dava Davanın Konusu Hüküm Gereği Gerekçe Kanun Kanunu Madde Türk TMK TBK TCK "
        "HMK CMK İYUK T.C. TC Şirketi Limited Anonim Ltd Şti A.Ş. Bankası Belediyesi Bakanlığı Müdürlüğü "
        "Mahallesi Sokak Caddesi Bulvarı İl İlçe Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim "
        "Kasım Aralık Ve İle Bu Da De Olarak Tarafından Hakkında Kabulüne Reddine Mahkememizce Mahkememiz "
        "Okulu İlkokulu Ortaokulu Lisesi Üniversitesi Hastanesi Rapor Raporu Adli Tıp Kurumu Noter Noterliği İnşaat Ticaret Gıda Nakliyat Tekstil Otomotiv Turizm Mobilya Elektrik Market Yapı Emlak"
    ).split()
}

ROLE_LABELS = {
    "davaci": "Davacı",
    "davali": "Davalı",
    "basvurucu": "Başvurucu",
    "sanik": "Sanık",
    "magdur": "Mağdur",
    "katilan": "Katılan",
    "musteki": "Müşteki",
    "tanik": "Tanık",
    "bilirkisi": "Bilirkişi",
    "arabulucu": "Arabulucu",
    "vekil": "Vekil",
    "hakim": "Hâkim",
    "savci": "Savcı",
    "raportor": "Raportör",
    "cocuk": "Çocuk",
    None: "Kişi",
}


def _cue_regex() -> re.Pattern:
    alts = "|".join(f"(?P<c{i}>{rx})" for i, (rx, _) in enumerate(CUES))
    name = rf"(?P<name>{NAME_WORD}(?:[ \t]+{NAME_WORD}){{1,3}})"
    return re.compile(rf"(?<![{LO}{UP}])(?i:{alts})(?:\s+\(\w+\))?[ \t]*(?:[:,-][ \t]*)?(?i:{TITLE}){name}")


_CUE_RE = _cue_regex()
_NAME_ONLY = re.compile(NAME_WORD)


def _role_of(m: re.Match) -> str:
    for i, (_, role) in enumerate(CUES):
        if m.group(f"c{i}") is not None:
            return role
    return "kisi"


def _trim_name(text: str, start: int, end: int) -> Optional[Tuple[int, int]]:
    """Cut the candidate at the first stop word; require at least two name words."""
    words = list(re.finditer(r"\S+", text[start:end]))
    keep = []
    end_at = None
    for w in words:
        token = w.group()
        core = re.split(_APOS_CLASS, token)[0].rstrip(".,;:)")
        if tr_fold(core) in STOP or not re.fullmatch(NAME_WORD, core):
            break
        keep.append(w)
        end_at = start + w.start() + len(core)
        if core != token:
            break
    if len(keep) < 2 or end_at is None:
        return None
    return start + keep[0].start(), end_at


def find_cued_persons(text: str) -> List[Span]:
    """Names right after a role cue. The search resumes where the kept name ends, not where the greedy match
    ended, so a cue swallowed by the previous candidate still counts ("Üye Ali KAYA Üye Can ER Üye ...": the
    first match runs into "Üye Can", is trimmed at "Üye" and the next search starts there)."""
    out: List[Span] = []
    pos = 0
    while True:
        m = _CUE_RE.search(text, pos)
        if m is None:
            break
        # The case insensitive flag must not make lowercase words count as names.
        trimmed = _trim_name(text, m.start("name"), m.end("name"))
        if trimmed is None:
            pos = m.start("name")
            continue
        s, e = trimmed
        pos = e
        name = text[s:e]
        if not all(w[0].isupper() for w in name.split()):
            continue
        out.append(Span(s, e, "PERSON", "context:cue", 0.92, role=_role_of(m), key=name_key(name)))
    return out


# Panel lists of a high court decision (plan Ek E, "Yüksek mahkeme üyesi"): the header and signature lines
# in which the court names its own members, "Başkan : Ad SOYAD", "Üyeler : Ad SOYAD" followed by one name per
# line, "Başkan Ad SOYAD Başkanvekili Ad SOYAD" and a label alone on a line with the name on the next one.
# Only such lines count; a member word inside a sentence ("Belediye Başkanı Ad Soyad", "meclis üyeleri Ad
# Soyad") does not, so for an open source (policy open_source_match) only the panel the source itself lists
# stays readable.
_PANEL_LABEL = (r"(?:Başkanvekilleri|Başkanvekili|Başkan|Üyeler|Üye"
                r"|BAŞKANVEKİLLERİ|BAŞKANVEKİLİ|BAŞKAN|ÜYELER|ÜYE)")
_PANEL_PLURAL = {"başkanvekilleri", "üyeler"}
_PANEL_WORD = rf"(?!{_PANEL_LABEL}(?![{LO}{UP}]))(?:{NAME_WORD}|[{UP}]\.)"
_PANEL_NAME = rf"{_PANEL_WORD}(?:[ \t]+{_PANEL_WORD}){{1,3}}"
_PANEL_ITEM = re.compile(
    rf"(?P<label>{_PANEL_LABEL})[ \t]*(?::[ \t]*)?(?P<name>{_PANEL_NAME})(?![{LO}{UP}.])")
_PANEL_LINE = re.compile(rf"[ \t]*(?:{_PANEL_ITEM.pattern}[ \t]*)+")
_PANEL_LABEL_ONLY = re.compile(rf"[ \t]*(?P<label>{_PANEL_LABEL})[ \t]*:?[ \t]*")
_PANEL_NAME_ONLY = re.compile(rf"[ \t]*(?P<name>{_PANEL_NAME})[ \t]*")
_TITLE_WORD = re.compile(rf"[{UP}][{LO}]+")


def _panel_name_ok(name: str) -> bool:
    words = [w for w in name.split() if not re.fullmatch(rf"[{UP}]\.", w)]
    return bool(words) and all(tr_fold(w) not in _NOT_IN_NAME for w in words)


def find_panel_members(text: str) -> List[Span]:
    """Members named on the panel lines of a decision, role "hakim", detector "context:panel". A name alone
    on a line counts only right after a plural label ("Üyeler : ...") or a label alone on its line, needs one
    word in title case (so "İKİNCİ BÖLÜM" is not a name) and ends the list at the first line of another
    shape."""
    out: List[Span] = []

    def add(s: int, e: int) -> None:
        out.append(Span(s, e, "PERSON", "context:panel", 0.92, role="hakim", key=name_key(text[s:e])))

    pending = ""  # "" no list open, "one" a label alone on the previous line, "many" a plural list
    offset = 0
    for line in text.splitlines(keepends=True):
        body = line.rstrip("\r\n")
        label_only = _PANEL_LABEL_ONLY.fullmatch(body)
        name_only = _PANEL_NAME_ONLY.fullmatch(body) if pending else None
        if name_only and not (_panel_name_ok(name_only.group("name"))
                              and _TITLE_WORD.search(name_only.group("name"))):
            name_only = None
        if _PANEL_LINE.fullmatch(body):
            items = list(_PANEL_ITEM.finditer(body))
            pending = ""
            if all(_panel_name_ok(m.group("name")) for m in items):
                for m in items:
                    add(offset + m.start("name"), offset + m.end("name"))
                pending = "many" if tr_fold(items[-1].group("label")) in _PANEL_PLURAL else ""
        elif label_only:
            pending = "many" if tr_fold(label_only.group("label")) in _PANEL_PLURAL else "one"
        elif name_only:
            add(offset + name_only.start("name"), offset + name_only.end("name"))
            pending = pending if pending == "many" else ""
        else:
            pending = ""
        offset += len(line)
    return out


# Words that head the name of a place, institution, document, event or field of law, or a function noun, and so
# never end a person name ("Kızılay Meydanı'nda", "Avrupa Birliği'nin", "Kurban Bayramı'nda", "Borçlar
# Hukuku'nda", "Şirket Yetkilisi'nin"). STOP already covers courts, offices, streets and months.
NOT_NAME = {
    tr_fold(w)
    for w in (
        "Meydanı Köprüsü Bölgesi Birliği Sözleşmesi Antlaşması Andlaşması Holding Yolları Cumhuriyeti Devletleri "
        "Krallığı Krallık Bakanı Başkanı Başkanlığı Valiliği Valisi Kaymakamlığı Kaymakamı Konseyi Komisyonu "
        "Komitesi Ajansı Vakfı Derneği Odası Barosu Sendikası Partisi Merkezi Fakültesi Enstitüsü Köyü Beldesi "
        "İlçesi İli Bayramı Heyeti Meclisi Kuvvetleri Milletler Gazetesi Gazete Havalimanı Limanı Otoyolu Yolu "
        "Parkı Camii Kilisesi Sarayı Kalesi Gölü Dağı Nehri Adası Körfezi Boğazı Ovası Tüzüğü Yönetmeliği "
        "Genelgesi Kararnamesi Anayasası Protokolü Grubu Kulübü Komutanlığı Karakolu Cezaevi İdaresi Teşkilatı "
        "Şubesi Servisi Platformu Federasyonu Konfederasyonu Kooperatifi Sitesi Apartmanı Hanı Çarşısı Pazarı "
        "Sigorta Telekom Divanı Fonu Savaşı Hukuku Usulü Hazine Hazinesi Mevkii Sokağı Yakası Şirket Müdürü "
        "Yetkilisi Temsilcisi Sahibi Mirasçıları Kurucusu Ortağı Çalışanı Personeli Memuru Görevlisi Sorumlusu "
        "Uzmanı Amiri Şefi Komiseri"
    ).split()
}
# Closed class words that open a sentence and are capitalised there ("Ancak Ahmet Yılmaz'ın ..."), forms of
# address ("Sayın") and words that open place and institution names ("Yeni Zelanda'da", "Kuzey Irak'ta").
# Dropped from the left of a candidate.
NOT_FIRST = {
    tr_fold(w)
    for w in (
        "Sayın Bay Bayan "
        "Ancak Fakat Ama Lakin Oysa Oysaki Çünkü Zira Nitekim Dolayısıyla Ayrıca Yine Hatta Üstelik Şayet Eğer "
        "Madem Sonuç Somut Olayda Öte Diğer Bütün Tüm Her Hiç Bazı Daha Önce Sonra Şu O Bunun Buna Bunlar Onun "
        "Ona Kaldı Hal Halde Yeni Eski Kuzey Güney Doğu Batı Orta Büyük Küçük Yukarı Aşağı Yüksek Ulusal "
        "Uluslararası Milli Millî Resmi Resmî Avrupa Amerika Birleşik Türkiye"
    ).split()
}
_NOT_IN_NAME = STOP | NOT_NAME
# Below review_threshold in policy.yaml: without a role cue a capitalised name with an apostrophe ending may still
# be a place or a company, so an editor confirms it unless a stronger span (NER, cue) covers the same characters.
SUFFIX_SCORE = 0.75
_APOS_WORD = re.compile(rf"(?<![{LO}{UP}\w]){NAME_WORD}(?={_APOS_CLASS})")


def _word_before(text: str, pos: int) -> Optional[Tuple[int, int]]:
    """Offsets of the capitalised word that ends right before the spaces or tabs at `pos`; None at a line
    break, after punctuation or for a lower case word."""
    i = pos
    while i > 0 and text[i - 1] in " \t":
        i -= 1
    if i == pos:
        return None
    j = i
    while j > 0 and text[j - 1].isalpha():
        j -= 1
    if j == i or (j > 0 and (text[j - 1].isalnum() or text[j - 1] in "._-" + APOSTROPHES)):
        return None
    return (j, i) if re.fullmatch(NAME_WORD, text[j:i]) else None


def find_suffixed_names(text: str) -> List[Span]:
    """Names of two to four capitalised words whose last word carries an apostrophe ending, with no role cue
    ("Dosya kapsamına göre Tarkan Özdağ'a ait araç"). Turkish puts the apostrophe only after proper nouns; the
    word lists above remove places, institutions and sentence openers, and single words ("Ankara'da",
    "Yargıtay'ın") are never taken. The span stops before the apostrophe; its score sends it to review."""
    out: List[Span] = []
    for m in _APOS_WORD.finditer(text):
        ending = apostrophe_ending_at(text, m.end())
        if not ending or split_apostrophe(text[m.start() : m.end() + ending]) is None:
            continue
        if tr_fold(m.group()) in _NOT_IN_NAME:
            continue
        words = [(m.start(), m.end())]
        while len(words) < 4:
            prev = _word_before(text, words[0][0])
            if prev is None or tr_fold(text[prev[0] : prev[1]]) in _NOT_IN_NAME:
                break
            words.insert(0, prev)
        while words and tr_fold(text[words[0][0] : words[0][1]]) in NOT_FIRST:
            words.pop(0)
        if len(words) < 2:
            continue
        s, e = words[0][0], words[-1][1]
        span = Span(s, e, "PERSON", "context:suffix", SUFFIX_SCORE, key=name_key(text[s:e]))
        out.append(span.with_(role=infer_role(text, span)))
    return out


def infer_role(text: str, span: Span, window: int = 50) -> Optional[str]:
    before = text[max(0, span.start - window) : span.start]
    best: Optional[Tuple[int, str]] = None
    for rx, role in CUES:
        for m in re.finditer(rf"(?<![{LO}{UP}])(?:{rx})", before, re.IGNORECASE):
            if best is None or m.end() > best[0]:
                best = (m.end(), role)
    return best[1] if best else None


def propagate(text: str, seeds: Iterable[Span]) -> List[Span]:
    """Find other mentions of every seed person: full name (case insensitive, Turkish folding, any run of spaces
    between the words) and surname alone. An apostrophe ending stays outside the mention ("Yılmaz'dan" masks
    "Yılmaz"). A full name may also carry an ending without the apostrophe ("AHMET YILMAZIN", OCR); then the
    whole word is masked. Surname only mentions get a lower score and go to review when below the threshold.

    A mention is never more certain than the best seed of its person: a seed below the review threshold (an NER
    span with a low score, a suffix candidate) keeps its mentions, including the one at its own position, below
    the threshold too, so propagation cannot lift it out of the editor queue."""
    folded = tr_fold(text)
    out: List[Span] = []
    best: Dict[str, Span] = {}
    roles: Dict[str, str] = {}
    for s in seeds:
        if s.entity != "PERSON" or not s.key:
            continue
        k = name_key(s.key)
        if k not in best or s.score > best[k].score:
            best[k] = s
        if s.role and k not in roles:
            roles[k] = s.role
    for key, seed in best.items():
        parts = key.split()
        if not parts:
            continue
        seed = seed.with_(key=key, role=seed.role or roles.get(key))
        body = r"\s+".join(re.escape(p) for p in parts)
        glued = f"(?P<glued>{SUFFIX})" if len(parts) > 1 else ""
        for m in re.finditer(rf"(?<![{LO}])(?:{body}){glued}(?![{LO}])", folded):
            score = min(seed.score, 0.85 if glued and m.group("glued") else 0.9)
            out.append(seed.with_(start=m.start(), end=m.end(), detector="context:propagated", score=score))
        surname = parts[-1]
        if len(surname) >= 3 and surname not in STOP:
            for m in re.finditer(rf"(?<![{LO}])" + re.escape(surname) + rf"(?![{LO}])", folded):
                original = text[m.start() : m.end()]
                if original[:1].isupper():
                    out.append(seed.with_(start=m.start(), end=m.end(), detector="context:surname",
                                          score=min(seed.score, 0.72)))
    return out


@dataclass
class Labeler:
    """Assigns one label per person key, stable within a document."""

    numbered_always: Tuple[str, ...] = ("sanik", "tanik", "kisi")
    letters: Tuple[str, ...] = ("cocuk",)

    def assign(self, spans: List[Span]) -> Dict[str, str]:
        persons = [s for s in sorted(spans, key=lambda s: s.start) if s.entity == "PERSON"]
        role_of_key: Dict[str, str] = {}
        order: List[str] = []
        for s in persons:
            k = s.key or f"@{s.start}"
            if k not in role_of_key:
                role_of_key[k] = s.role or "kisi"
                order.append(k)
            elif role_of_key[k] == "kisi" and s.role:
                role_of_key[k] = s.role
        by_role: Dict[str, List[str]] = {}
        for k in order:
            by_role.setdefault(role_of_key[k], []).append(k)
        labels: Dict[str, str] = {}
        for role, keys in by_role.items():
            base = ROLE_LABELS.get(role, ROLE_LABELS[None])
            for i, k in enumerate(keys):
                if role in self.letters:
                    labels[k] = f"[{base} {chr(ord('A') + i)}]"
                elif role in self.numbered_always or len(keys) > 1:
                    labels[k] = f"[{base} {i + 1}]"
                else:
                    labels[k] = f"[{base}]"
        return labels
