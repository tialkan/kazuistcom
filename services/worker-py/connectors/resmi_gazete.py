"""Resmi Gazete daily index (fihrist) connector (plan 6.1).

The index is not a corpus record. It tells which mevzuat to re-fetch: entries in the categories of
amending instruments become mevzuat.rg_daily follow-up work. Page encoding is windows-1254.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from typing import List

from core.errors import ParseError
from core.fetcher import Fetcher, FetchResult

from .base import parse_tr_long_date, strip_tags

SOURCE = "resmi-gazete"
BASE = "https://www.resmigazete.gov.tr"

# Categories (page headings) whose entries can create, change or repeal mevzuat.
MEVZUAT_CATEGORIES = (
    "KANUN",
    "KANUN HÜKMÜNDE KARARNAME",
    "CUMHURBAŞKANLIĞI KARARNAMESİ",
    "CUMHURBAŞKANLIĞI KARARNAMELERİ",
    "KANUNLAR",
    "YÖNETMELİKLER",
    "TEBLİĞLER",
    "ANAYASA MAHKEMESİ KARARLARI",
)
_AMENDING = re.compile(r"değişiklik yapılmasına dair|yürürlükten kaldırılmasına dair|iptal", re.I)
_LAW_NO = re.compile(r"\b(\d{3,4})\s+sayılı", re.I)


@dataclass
class RgEntry:
    section: str
    category: str
    title: str
    href: str
    url: str
    order: int
    law_numbers: List[str] = field(default_factory=list)

    @property
    def affects_mevzuat(self) -> bool:
        return self.category in MEVZUAT_CATEGORIES


@dataclass
class RgIssue:
    issue_date: date
    issue_number: str
    entries: List[RgEntry]


def decode_page(body: bytes) -> str:
    m = re.search(rb"charset=([A-Za-z0-9_-]+)", body[:2048])
    charset = m.group(1).decode("ascii") if m else "utf-8"
    return body.decode("cp1254" if charset.lower() in ("windows-1254", "cp1254") else charset, errors="replace")


def fihrist_url(d: date) -> str:
    return f"{BASE}/eskiler/{d:%Y}/{d:%m}/{d:%Y%m%d}.htm"


def parse_fihrist(body: bytes, page_url: str) -> RgIssue:
    text = decode_page(body)
    head = re.search(
        r"(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4})\s*</span>.*?(\d{4,6})\s+Say", text, re.S
    ) or re.search(r"(\d{1,2}\s+[A-Za-zÇĞİÖŞÜçğıöşü]+\s+\d{4})\s+Tarihli ve\s+(\d{4,6})", strip_tags(text))
    if not head:
        raise ParseError("issue date and number not found")
    issue_date = parse_tr_long_date(head.group(1))
    if issue_date is None:
        raise ParseError("issue date unreadable")
    base = page_url.rsplit("/", 1)[0] + "/"
    entries: List[RgEntry] = []
    section = ""
    category = ""
    order = 0
    for m in re.finditer(r"<b><u>(.*?)</u></b>|<a\s[^>]*href=\"(\d{8}-\d+\.\w+)\"[^>]*>(.*?)</a>", text, re.S):
        if m.group(1) is not None:
            heading = strip_tags(m.group(1))
            if heading.endswith("BÖLÜMÜ"):
                section, category = heading, ""
            elif heading:
                category = heading
            continue
        raw_title = strip_tags(m.group(3))
        if re.match(r"^[–\-]", raw_title):
            title = re.sub(r"^[–\-\s]+", "", raw_title)
        else:  # first item of a category is prefixed with its number instead of dashes
            title = re.sub(r"^\d+\s+", "", raw_title)
        if not title:
            continue
        order += 1
        entries.append(
            RgEntry(section, category, title, m.group(2), base + m.group(2), order, _LAW_NO.findall(title))
        )
    if not entries:
        raise ParseError("no entries found")
    return RgIssue(issue_date, head.group(2), entries)


def amending_entries(issue: RgIssue) -> List[RgEntry]:
    """Entries to hand to the mevzuat connector for re-fetching."""
    return [e for e in issue.entries if e.affects_mevzuat and (e.category != "TEBLİĞLER" or _AMENDING.search(e.title))]


class ResmiGazeteConnector:
    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    def fetch_issue(self, d: date) -> tuple[RgIssue, FetchResult]:
        url = fihrist_url(d)
        result = self.fetcher.fetch(SOURCE, url, external_id=f"rg:{d.isoformat()}")
        return parse_fihrist(result.body, url), result
