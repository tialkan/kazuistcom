"""KVKK Kurul karar ozetleri connector (plan 6.1): list pages and one page per summary."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from core.errors import ParseError
from core.fetcher import Fetcher
from core.pipeline import IngestOutcome, Repository, ingest
from core.records import RecordDraft

from .base import html_to_text, parse_dmy, strip_tags

SOURCE = "kvkk"
LIST_URL = "https://www.kvkk.gov.tr/Icerik/5406/kurul-karar-ozetleri"
COURT = "Kişisel Verileri Koruma Kurulu"
LICENSE_BASIS = "Resmî yayın; Kurul karar özetleri kurumun kendi sitesinde kamuya açık yayımlanır"

_ITEM = re.compile(
    r'<div class="members__item.*?<h2>(.*?)</h2>.*?href="(https://www\.kvkk\.gov\.tr/Icerik/(\d+)/[^"]*)"', re.S
)
_NEXT_PAGE = re.compile(r'href="(https://www\.kvkk\.gov\.tr/Icerik/5406/kurul-karar-ozetleri\?page=(\d+))"')


@dataclass
class KvkkListEntry:
    title: str
    url: str
    content_id: str
    decision_date: Optional[object]
    karar_no: Optional[str]


def parse_list(markup: str) -> tuple[List[KvkkListEntry], List[str]]:
    entries: List[KvkkListEntry] = []
    for m in _ITEM.finditer(markup):
        title = strip_tags(m.group(1))
        no = re.search(r"(\d{4}/\d+)\s+Sayılı", title, re.I)
        entries.append(
            KvkkListEntry(title, m.group(2), m.group(3), parse_dmy(title), no.group(1) if no else None)
        )
    if not entries:
        raise ParseError("no decision summaries found in list page")
    pages = sorted({m.group(1) for m in _NEXT_PAGE.finditer(markup)}, key=lambda u: int(u.rsplit("=", 1)[1]))
    return entries, pages


def _table_value(markup: str, label: str) -> Optional[str]:
    m = re.search(rf"<strong>\s*{re.escape(label)}\s*</strong>.*?<td[^>]*>\s*:\s*</td>\s*<td[^>]*>(.*?)</td>", markup, re.S)
    return strip_tags(m.group(1)) if m else None


def parse_detail(markup: str, url: str, fetched_at: datetime) -> RecordDraft:
    title_m = re.search(r'<h2 class="news__detail-article-title">(.*?)</h2>', markup, re.S)
    article_m = re.search(r'<div class="news__detail-article[^"]*">(.*)', markup, re.S)
    id_m = re.search(r"/Icerik/(\d+)/", url)
    if not (title_m and article_m and id_m):
        raise ParseError("detail layout not recognised")
    karar_no = _table_value(markup, "Karar No")
    karar_tarihi = _table_value(markup, "Karar Tarihi")
    if not karar_no or not karar_tarihi:
        raise ParseError("decision number or date missing")
    decision_date = parse_dmy(karar_tarihi)
    if decision_date is None:
        raise ParseError("decision date unreadable")
    body = article_m.group(1)
    body = body[: body.find("</div>")] if "</div>" in body else body
    text = html_to_text(body)
    return RecordDraft(
        type="kurul_karari",
        title=strip_tags(title_m.group(1)).strip('"“” '),
        authority_class="idari_karar",
        license_basis=LICENSE_BASIS,
        source_url=url,
        source_key=f"kvkk:{id_m.group(1)}",
        fetched_at=fetched_at,
        text=text,
        court=COURT,
        karar_no=karar_no,
        decision_date=decision_date,
    )


class KvkkConnector:
    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    def list_page(self, page: int = 1) -> List[KvkkListEntry]:
        url = LIST_URL if page == 1 else f"{LIST_URL}?page={page}"
        result = self.fetcher.fetch(SOURCE, url, external_id=f"kvkk:list:{page}")
        try:
            entries, _ = parse_list(result.body.decode("utf-8", errors="replace"))
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise
        return entries

    def fetch_decision(self, entry_url: str, repo: Repository) -> IngestOutcome:
        result = self.fetcher.fetch(SOURCE, entry_url, external_id=entry_url)
        try:
            draft = parse_detail(result.body.decode("utf-8", errors="replace"), entry_url, result.fetched_at)
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise
        return ingest(draft, result.raw, repo)
