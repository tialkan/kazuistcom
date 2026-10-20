"""KVKK m.6 special category data and child strict mode (plan 6.4/5, Ek E).

Lexicon detection is deliberately conservative in what it calls a hit and generous in what it sends to
review: a matched term is masked and, when below the review threshold, queued for an editor.
"""

from __future__ import annotations

import re
from typing import Dict, List

from .spans import Span

LO = "a-zçğıöşüâîû"

# Category -> list of regex terms (Turkish, case insensitive). Suffixes are allowed with \w*.
M6_TERMS: Dict[str, List[str]] = {
    "HEALTH": [
        r"(?:\w+\s+)?kanser\w*", r"HIV\w*", r"AIDS", r"hepatit\s+[BC]\w*", r"depresyon\w*", r"şizofreni\w*",
        r"bipolar\s+bozukluk\w*", r"epilepsi\w*", r"diyabet\w*", r"alzheimer\w*", r"demans\w*",
        r"otizm\w*", r"psikiyatrik\s+tedavi\w*", r"psikoz\w*", r"madde\s+bağımlılığ\w*", r"alkol\s+bağımlılığ\w*",
        r"%\s?\d{1,3}\s+oranında\s+(?:engelli|özürlü)\w*", r"engellilik\s+oranı\s*%?\s?\d{1,3}",
    ],
    "SEXUAL_LIFE": [r"cinsel\s+yönelim\w*", r"eşcinsel\w*", r"biseksüel\w*", r"trans\s?seksüel\w*"],
    "RELIGION": [r"(?:Hristiyan|Müslüman|Yahudi|Alevi|Süryani|Ezidi|ateist)\w*", r"din\s+değiştir\w*"],
    "ETHNICITY": [r"(?:Kürt|Ermeni|Rum|Roman|Çingene|Laz|Çerkez|Arap)\s+(?:kökenli|asıllı)\w*"],
    "POLITICAL": [r"(?:\w+\s+)?partisi\s+üyesi\w*", r"siyasi\s+görüş\w*"],
    "UNION": [r"sendika\s+üyesi\w*", r"sendikaya\s+üye\w*"],
    "CRIMINAL": [r"adli\s+sicil\s+kayd\w*", r"sabıka\s+kayd\w*", r"daha\s+önce\s+(?:\w+\s+){0,3}mahkûm\s+olduğu\w*"],
    "BIOMETRIC": [r"parmak\s+izi\w*", r"DNA\s+(?:profili|örneği)\w*", r"retina\s+tarama\w*", r"yüz\s+tanıma\w*"],
}

M6_SCORE = {"HEALTH": 0.85, "CRIMINAL": 0.7, "BIOMETRIC": 0.75}

_CHILD_CUE = re.compile(r"suça\s+sürüklenen\s+çocuk|mağdur\s+çocuk|\bçocu[kğ]\w*|\bküçük\b|\bSSÇ\b|reşit\s+olmayan",
                        re.IGNORECASE)
_AGE = re.compile(r"\b\d{1,2}\s+yaşında(?:ki)?\b|\b\d{1,2}\s+yaşındaki\b|\(\s?\d{1,2}\s?yaş\w*\s?\)", re.IGNORECASE)
_SCHOOL = re.compile(
    r"(?:[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\s+){1,4}(?:İlkokulu|Ortaokulu|Lisesi|Anadolu\s+Lisesi|Anaokulu|Kreşi|Koleji)"
)


def find_m6(text: str) -> List[Span]:
    out: List[Span] = []
    for cat, terms in M6_TERMS.items():
        rx = re.compile(rf"(?<![{LO}])(?:" + "|".join(terms) + r")", re.IGNORECASE)
        for m in rx.finditer(text):
            out.append(Span(m.start(), m.end(), cat, "lexicon:m6", M6_SCORE.get(cat, 0.78)))
    return out


def has_child(text: str) -> bool:
    return bool(_CHILD_CUE.search(text))


def find_child_details(text: str) -> List[Span]:
    """Only used in child strict mode: ages and school names are generalised."""
    out = [Span(m.start(), m.end(), "CHILD_AGE", "lexicon:child", 0.9) for m in _AGE.finditer(text)]
    out += [Span(m.start(), m.end(), "SCHOOL", "lexicon:child", 0.88) for m in _SCHOOL.finditer(text)]
    return out
