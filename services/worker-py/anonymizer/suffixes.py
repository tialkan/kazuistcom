"""Turkish inflectional endings after person names (plan 6.4/3).

Turkish writes the inflection of a proper noun after an apostrophe: "Ahmet Yılmaz'ın", "Kaya'ya", "Demir'den",
"YILMAZ'IN". The name ends at the apostrophe, so one person written with different endings keeps one key and
therefore one label in the document. Court texts sometimes drop the apostrophe (OCR, all capitals, careless
typing) and glue the ending to the surname ("Yılmazdan"); propagation accepts such an ending only after a full
name that is already known in the document.

Only inflectional endings are recognised: plural, possessive and case endings, "-ki" and the copula. Derivational
endings such as "-lı", "-ci", "-gil" or "-oğlu" form other names and are never stripped. Vowel harmony is not
enforced because OCR and capitalisation errors break it. These are properties of Turkish spelling and
morphology, not of any test set.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple

# Straight and typographic apostrophes, the modifier letter apostrophe, grave and acute accents (OCR output).
APOSTROPHES = "'’‘ʼ`´"
_APOS = re.escape(APOSTROPHES)

_V2 = "[ae]"
_V4 = "[ıiuü]"
# One case or possessive ending: genitive (n)In, accusative and possessive (s/y)I, dative (y)A, locative and
# ablative DA(n), instrumental (y)lA, equative CA.
_CASE = rf"(?:n?{_V4}n|[sy]?{_V4}|y?{_V2}|[dt]{_V2}n?|y?l{_V2}|[cç]{_V2})"
_COPULA = rf"(?:[dt]{_V4}r|y?[dt]{_V4}|y?m{_V4}ş)"
# Plural, at most two case endings ("ların", "ındaki"), relative "-ki", copula. Matches the empty string too.
SUFFIX = rf"(?:l{_V2}r)?(?:{_CASE}){{0,2}}(?:ki(?:n|ler)?)?(?:{_COPULA})?"
_SUFFIX_RE = re.compile(SUFFIX)
MAX_SUFFIX = 12


def tr_fold(s: str) -> str:
    """Turkish lower case that keeps string length (İ -> i, I -> ı), so offsets in the folded text match."""
    return s.replace("İ", "i").replace("I", "ı").lower()


def is_suffix(ending: str) -> bool:
    """True when `ending` (without the apostrophe) is a chain of Turkish inflectional endings."""
    if not ending or len(ending) > MAX_SUFFIX or not ending.isalpha():
        return False
    return _SUFFIX_RE.fullmatch(tr_fold(ending)) is not None


def split_apostrophe(word: str) -> Optional[Tuple[str, str]]:
    """Split "Yılmaz'ın" into ("Yılmaz", "ın"). Returns None when the word has no apostrophe ending.

    The stem needs two letters and the ending must be all lower case, or all upper case after an all upper case
    stem, so foreign names such as "O'Neil" or "D'Angelo" stay whole."""
    for i, ch in enumerate(word):
        if ch not in APOSTROPHES:
            continue
        stem, ending = word[:i], word[i + 1 :]
        if len(stem) < 2 or not stem[-1].isalpha() or not is_suffix(ending):
            return None
        if ending.islower() or (ending.isupper() and stem.isupper()):
            return stem, ending
        return None
    return None


def strip_word(word: str) -> str:
    """The word without an apostrophe ending or a dangling apostrophe."""
    parts = split_apostrophe(word)
    if parts:
        return parts[0]
    return word.rstrip(APOSTROPHES) or word


def name_key(name: str) -> str:
    """Canonical key of a person name: words without apostrophe endings, Turkish folded, single spaces.
    "Ahmet Yılmaz'ın", "AHMET YILMAZ'A" and "Ahmet  Yılmaz" share the key "ahmet yılmaz"."""
    return tr_fold(" ".join(strip_word(w) for w in name.split()))


def person_end(text: str, start: int, end: int) -> int:
    """End offset of a PERSON span without the apostrophe ending of its last word: for "Ahmet Yılmaz'ın" the
    span ends before the apostrophe. The ending is not part of the name, so cutting it never unmasks one."""
    seg = text[start:end]
    m = re.search(r"(\S+)$", seg)
    if not m:
        return end
    parts = split_apostrophe(m.group(1))
    if not parts:
        return end
    return start + m.start(1) + len(parts[0])


def apostrophe_ending_at(text: str, pos: int) -> int:
    """Length of an apostrophe ending that starts at `pos` ("'ın" -> 3), 0 when there is none."""
    if pos >= len(text) or text[pos] not in APOSTROPHES:
        return 0
    m = re.match(r"[^\W\d_]+", text[pos + 1 :])
    if not m or not is_suffix(m.group()):
        return 0
    return 1 + m.end()
