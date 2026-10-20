"""Structural recognizers (plan 6.4/1): identifiers with check digits and pattern based entities."""

from __future__ import annotations

import re
from typing import Callable, List, Optional

from .checksums import iban_valid, luhn_valid, tckn_valid, vkn_valid
from .spans import Span

TR_UPPER = "A-ZÇĞİÖŞÜÂÎÛ"
TR_LOWER = "a-zçğıöşüâîû"
WORD = rf"[{TR_UPPER}][{TR_LOWER}{TR_UPPER}]+"

_TCKN = re.compile(r"(?<![\d/.-])[1-9]\d{10}(?![\d/-])")
_TCKN_CONTEXT = re.compile(r"(T\.?\s?C\.?|TC|kimlik|TCKN)", re.IGNORECASE)
_VKN = re.compile(r"(?<![\d/.-])\d{10}(?![\d/-])")
_VKN_CONTEXT = re.compile(r"(vergi|VKN|V\.K\.N)", re.IGNORECASE)
_IBAN = re.compile(r"\bTR\s?\d{2}(?:\s?[0-9A-Z]{4}){5}\s?[0-9A-Z]{2}\b")
_CARD = re.compile(r"(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])")
_PHONE = re.compile(
    r"(?<![\d\w])(?:\+90[\s.-]?|0090[\s.-]?|0[\s.-]?)?\(?[2-5]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?![\d])"
)
_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
# Il kodu 01..81, 1-3 letters (no Q W X, Turkish specific letters not used), 2-4 digits. Court abbreviations
# such as "19 HD 2021/..." are excluded by the trailing (?!/) and the stop list.
_PLATE = re.compile(r"(?<![\d.])(0[1-9]|[1-7]\d|8[01])\s?([A-PR-VYZ]{1,3})\s?(\d{2,4})(?![\d/])")
_PLATE_STOP = {"HD", "CD", "HGK", "CGK", "E", "K", "T", "S", "MD", "VD", "İD", "ID", "BAM", "AYM"}
_PASSPORT = re.compile(r"(pasaport\s*(?:no|numarası)?\s*[:.]?\s*)([A-Z]\d{7,8}|[A-Z]{1,2}\d{6,8})", re.IGNORECASE)

_DATE = r"(?:\d{1,2}[./]\d{1,2}[./](?:19|20)\d{2}|\d{1,2}\s+(?:Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+(?:19|20)\d{2})"
_DOB_BEFORE = re.compile(rf"(doğum\s+tarihi\s*[:]?\s*|D\.\s?T\.\s*[:]?\s*|doğ\.\s?t\.\s*[:]?\s*)({_DATE})", re.IGNORECASE)
_DOB_AFTER = re.compile(rf"({_DATE})(\s+(?:doğumlu|tarihinde\s+doğan|doğ\.))", re.IGNORECASE)

_PARCEL = re.compile(
    r"\b\d{1,5}\s+ada\s*(?:,|ve)?\s*\d{1,5}\s+(?:sayılı\s+)?parsel\b"
    r"|\bada\s*(?:no|numarası)?\s*[:.]?\s*\d{1,5}\s*,?\s*parsel\s*(?:no|numarası)?\s*[:.]?\s*\d{1,5}\b"
    r"|\b\d{1,5}\s+parsel\b",
    re.IGNORECASE,
)

_STREET = r"(?:Sokak|Sokağı|Sok\.|Sk\.|Caddesi|Cadde|Cad\.|Cd\.|Bulvarı|Bulvar|Blv\.)"
_NEIGH = r"(?:Mahallesi|Mah\.|Mh\.)"
_NAMEPART = rf"(?:{WORD}|\d{{1,4}}\.?)"
_ADDRESS = re.compile(
    rf"(?:{_NAMEPART}\s+){{1,4}}{_NEIGH}"
    rf"(?:,?\s+(?:{_NAMEPART}\s+){{1,4}}{_STREET})?"
    rf"(?:,?\s+(?:No|Numara)\s*[:.]?\s*\d+[A-Z]?(?:/\d+)?)?"
    rf"(?:,?\s+(?:Daire|D\.|Kat)\s*[:.]?\s*\d+)?"
    rf"|(?:{_NAMEPART}\s+){{1,4}}{_STREET},?\s+(?:No|Numara)\s*[:.]?\s*\d+[A-Z]?(?:/\d+)?"
    rf"(?:,?\s+(?:Daire|D\.|Kat)\s*[:.]?\s*\d+)?"
)


def _context(text: str, start: int, pattern: re.Pattern, window: int = 40) -> bool:
    return bool(pattern.search(text[max(0, start - window) : start]))


def find_tckn(text: str) -> List[Span]:
    out = []
    for m in _TCKN.finditer(text):
        if tckn_valid(m.group()):
            out.append(Span(m.start(), m.end(), "TCKN", "checksum:tckn", 0.99))
        elif _context(text, m.start(), _TCKN_CONTEXT):
            # Labelled as an id but check digit fails: mask anyway, send to review.
            out.append(Span(m.start(), m.end(), "TCKN", "structural:tckn-unverified", 0.6))
    return out


def find_vkn(text: str) -> List[Span]:
    out = []
    for m in _VKN.finditer(text):
        if not _context(text, m.start(), _VKN_CONTEXT):
            continue
        ok = vkn_valid(m.group())
        out.append(Span(m.start(), m.end(), "VKN", "checksum:vkn" if ok else "structural:vkn-unverified",
                        0.97 if ok else 0.6))
    return out


def find_iban(text: str) -> List[Span]:
    out = []
    for m in _IBAN.finditer(text):
        ok = iban_valid(m.group())
        out.append(Span(m.start(), m.end(), "IBAN", "checksum:iban" if ok else "structural:iban-unverified",
                        0.99 if ok else 0.65))
    return out


def find_card(text: str) -> List[Span]:
    out = []
    for m in _CARD.finditer(text):
        raw = m.group()
        digits = re.sub(r"\D", "", raw)
        if 13 <= len(digits) <= 19 and luhn_valid(digits) and digits[0] in "3456":
            out.append(Span(m.start(), m.end(), "CARD", "checksum:luhn", 0.97))
    return out


def find_phone(text: str) -> List[Span]:
    out = []
    for m in _PHONE.finditer(text):
        digits = re.sub(r"\D", "", m.group())
        if len(digits) < 10:
            continue
        local = digits[-10:]
        if local[0] not in "2345":
            continue
        out.append(Span(m.start(), m.end(), "PHONE", "structural:phone", 0.95))
    return out


def find_email(text: str) -> List[Span]:
    return [Span(m.start(), m.end(), "EMAIL", "structural:email", 0.99) for m in _EMAIL.finditer(text)]


def find_plate(text: str) -> List[Span]:
    out = []
    for m in _PLATE.finditer(text):
        if m.group(2) in _PLATE_STOP:
            continue
        before = text[max(0, m.start() - 30) : m.start()].lower()
        score = 0.93 if "plaka" in before or "araç" in before or "aracı" in before else 0.82
        out.append(Span(m.start(), m.end(), "PLATE", "structural:plate", score))
    return out


def find_passport(text: str) -> List[Span]:
    return [Span(m.start(2), m.end(2), "PASSPORT", "structural:passport", 0.9) for m in _PASSPORT.finditer(text)]


def find_dob(text: str) -> List[Span]:
    out = [Span(m.start(2), m.end(2), "DOB", "structural:dob", 0.95) for m in _DOB_BEFORE.finditer(text)]
    out += [Span(m.start(1), m.end(1), "DOB", "structural:dob", 0.93) for m in _DOB_AFTER.finditer(text)]
    return out


def find_parcel(text: str) -> List[Span]:
    return [Span(m.start(), m.end(), "PARCEL", "structural:parcel", 0.95) for m in _PARCEL.finditer(text)]


def find_address(text: str) -> List[Span]:
    out = []
    for m in _ADDRESS.finditer(text):
        s, e = m.start(), m.end()
        # Drop a leading sentence word ("Davacı Gül Mahallesi ...") only when it is a known cue.
        out.append(Span(s, e, "ADDRESS", "structural:address", 0.88 if "No" in m.group() else 0.8))
    return out


RECOGNIZERS: List[Callable[[str], List[Span]]] = [
    find_tckn,
    find_vkn,
    find_iban,
    find_card,
    find_phone,
    find_email,
    find_plate,
    find_passport,
    find_dob,
    find_parcel,
    find_address,
]


def detect_structural(text: str, only: Optional[set] = None) -> List[Span]:
    spans: List[Span] = []
    for fn in RECOGNIZERS:
        spans.extend(fn(text))
    if only is not None:
        spans = [s for s in spans if s.entity in only]
    return spans
