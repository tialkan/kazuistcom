"""Deduplication key (plan 6.2/7): court, chamber, esas, karar, date; text digest when those are missing."""

from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import date
from typing import Optional

_WS = re.compile(r"\s+")
_NUM_NOISE = re.compile(r"[^0-9a-z/\-]")


def _fold(value: str) -> str:
    value = value.replace("İ", "i").replace("I", "ı")
    value = unicodedata.normalize("NFKC", value).lower()
    return _WS.sub(" ", value).strip()


def normalize_case_number(value: Optional[str]) -> str:
    """'E. 2013/19-199', 'e:2013/19-199' and '2013/19 - 199' all become '2013/19-199'."""
    if not value:
        return ""
    value = _fold(value)
    value = re.sub(r"\b(esas|karar|sayili|sayılı|no|e|k)\b[.:]?", " ", value)
    return _NUM_NOISE.sub("", value.replace(" ", ""))


def normalize_text_for_digest(text: str) -> str:
    return _WS.sub(" ", _fold(text))


def dedupe_key(
    court: Optional[str],
    chamber: Optional[str],
    esas_no: Optional[str],
    karar_no: Optional[str],
    decision_date: Optional[date],
    text: Optional[str] = None,
) -> str:
    esas = normalize_case_number(esas_no)
    karar = normalize_case_number(karar_no)
    if court and (esas or karar):
        parts = [_fold(court), _fold(chamber or ""), esas, karar, decision_date.isoformat() if decision_date else ""]
        return "case:" + hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    if text:
        return "txt:" + hashlib.sha256(normalize_text_for_digest(text).encode("utf-8")).hexdigest()
    raise ValueError("neither case identifiers nor text available for a dedupe key")
