"""Context based person detection, role labelling and in-document consistency (plan 6.4/3).

The rule layer finds names that follow a role cue ("davacı Ayşe Kaya", "Tanık: Mert Demir"), then
propagates every found name to its other mentions in the same document. The same person always gets the
same label within a document; numbering follows order of first appearance.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

from .spans import Span

UP = "A-ZÇĞİÖŞÜÂÎÛ"
LO = "a-zçğıöşüâîû"
NAME_WORD = rf"(?:[{UP}][{LO}]+|[{UP}]{{2,}})"
TITLE = r"(?:(?:Av\.|Avukat|Dr\.|Doç\.|Prof\.|Uzm\.|Op\.|Sn\.)\s*)*"

# Order matters: longer cues first. Each tuple: (regex, role)
CUES: List[Tuple[str, str]] = [
    (r"suça\s+sürüklenen\s+çocuk|mağdur\s+çocuk|müşterek\s+çocu[kğ]\w*|SSÇ|küçük|çocu[kğ]\w*", "cocuk"),
    (r"davac[ıi]\w*\s+vekil\w*|daval[ıi]\w*\s+vekil\w*|katılan\s+vekil\w*|vekil\w*|müdafi\w*|Av\.|Avukat", "vekil"),
    (r"davac[ıi]\w*", "davaci"),
    (r"daval[ıi]\w*", "davali"),
    (r"sanı[kğ]\w*", "sanik"),
    (r"mağdur\w*", "magdur"),
    (r"katılan\w*", "katilan"),
    (r"müşteki\w*", "musteki"),
    (r"tanı[kğ]\w*", "tanik"),
    (r"bilirkişi\w*", "bilirkisi"),
    (r"arabulucu\w*", "arabulucu"),
    (r"Cumhuriyet\s+Savcıs\w*|savcı\w*", "savci"),
    (r"hâkim\w*|hakim\w*|başkan\w*|üye\w*", "hakim"),
]

# Capitalised words that are never person names in court texts.
STOP = {
    w.replace("İ", "i").replace("I", "ı").lower()
    for w in (
        "Mahkemesi Mahkeme Daire Dairesi Hukuk Ceza Asliye Ağır Sulh İcra Aile İş Tüketici Bölge Adliye Yargıtay "
        "Danıştay Anayasa Kurul Kurulu Genel Başsavcılığı Cumhuriyet Başsavcılığı Savcılığı Vekili Vekil "
        "Davacı Davalı Sanık Tanık Bilirkişi Mağdur Katılan Müşteki Arabulucu Hâkim Hakim Başkan Üye Kâtip "
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
    "cocuk": "Çocuk",
    None: "Kişi",
}


def tr_fold(s: str) -> str:
    return s.replace("İ", "i").replace("I", "ı").lower()


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
        core = re.split(r"['\u2019]", token)[0].rstrip(".,;:)")
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
    out: List[Span] = []
    for m in _CUE_RE.finditer(text):
        # The case insensitive flag must not make lowercase words count as names.
        trimmed = _trim_name(text, m.start("name"), m.end("name"))
        if trimmed is None:
            continue
        s, e = trimmed
        name = text[s:e]
        if not all(w[0].isupper() for w in name.split()):
            continue
        out.append(Span(s, e, "PERSON", "context:cue", 0.92, role=_role_of(m), key=tr_fold(name)))
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
    """Find other mentions of every seed person: full name (case insensitive, Turkish folding) and surname
    alone. Surname only mentions get a lower score and go to review when below the threshold."""
    folded = tr_fold(text)
    out: List[Span] = []
    seen_keys: Dict[str, Span] = {}
    for s in seeds:
        if s.entity != "PERSON" or not s.key:
            continue
        seen_keys.setdefault(s.key, s)
    for key, seed in seen_keys.items():
        for m in re.finditer(rf"(?<![{LO}])" + re.escape(key) + rf"(?![{LO}])", folded):
            out.append(seed.with_(start=m.start(), end=m.end(), detector="context:propagated", score=0.9))
        parts = key.split()
        surname = parts[-1]
        if len(surname) >= 3 and surname not in STOP:
            for m in re.finditer(rf"(?<![{LO}])" + re.escape(surname) + rf"(?![{LO}])", folded):
                original = text[m.start() : m.end()]
                if original[:1].isupper():
                    out.append(seed.with_(start=m.start(), end=m.end(), detector="context:surname", score=0.72))
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
