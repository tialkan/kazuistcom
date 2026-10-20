"""Rekabet Kurumu Kurul kararlari connector (plan 6.1): summary pages and decision PDFs to text."""

from __future__ import annotations

import io
import re
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional
from urllib.parse import urljoin

from core.errors import ParseError
from core.fetcher import Fetcher
from core.pipeline import IngestOutcome, Repository, ingest
from core.records import RecordDraft

from .base import parse_dmy, strip_tags

SOURCE = "rekabet"
BASE = "https://www.rekabet.gov.tr"
LIST_URL = f"{BASE}/tr/SonkurulKararlari"
COURT = "Rekabet Kurulu"
LICENSE_BASIS = "Resmî yayın; Kurul kararları kurumun kendi sitesinde kamuya açık yayımlanır"
MAX_PDF_PAGES = 1500

_CARD = re.compile(r'<a href="(/tr/SonKurulKarari/([0-9a-f-]{36}))".*?</table>\s*</a>', re.S)


@dataclass
class RekabetListEntry:
    url: str
    guid: str
    karar_no: str
    decision_date: Optional[object]
    karar_turu: str
    title: str
    summary: str


def _label(block: str, label: str) -> str:
    m = re.search(rf"{label}\s*:\s*([^<]+)", block)
    return m.group(1).strip() if m else ""


def parse_list(markup: str) -> List[RekabetListEntry]:
    entries: List[RekabetListEntry] = []
    for m in _CARD.finditer(markup):
        block = m.group(0)
        title_m = re.search(r'class="tablotitle">(.*?)</td>', block, re.S)
        cells = re.findall(r'<td colspan="3">(.*?)</td>', block, re.S)
        karar_no = _label(block, "Karar Sayısı")
        if not karar_no:
            continue
        entries.append(
            RekabetListEntry(
                url=urljoin(BASE, m.group(1)),
                guid=m.group(2),
                karar_no=karar_no,
                decision_date=parse_dmy(_label(block, "Karar Tarihi")),
                karar_turu=_label(block, "Karar Türü"),
                title=strip_tags(title_m.group(1)) if title_m else "",
                summary=strip_tags(cells[0]) if cells else "",
            )
        )
    if not entries:
        raise ParseError("no decisions found in list page")
    return entries


def parse_detail(markup: str, url: str, fetched_at: datetime, pdf_text: Optional[str] = None) -> RecordDraft:
    title_m = re.search(r"<h4>(.*?)</h4>", markup, re.S)
    id_m = re.search(r"/SonKurulKarari/([0-9a-f-]{36})", url)
    karar_no = _label(markup, "Karar Sayısı")
    d = parse_dmy(_label(markup, "Karar Tarihi"))
    if not (title_m and id_m and karar_no and d):
        raise ParseError("detail layout not recognised")
    karar_turu = _label(markup, "Karar Türü")
    summary_m = re.search(r'<td colspan="3">(.*?)</td>', markup, re.S)
    summary = strip_tags(summary_m.group(1)) if summary_m else ""
    title = re.sub(r"\s*\(\d{1,2}\.\d{1,2}\.\d{4}\)\s*$", "", strip_tags(title_m.group(1))).strip()
    return RecordDraft(
        type="kurul_karari",
        title=title,
        authority_class="idari_karar",
        license_basis=LICENSE_BASIS,
        source_url=url,
        source_key=f"rekabet:{id_m.group(1)}",
        fetched_at=fetched_at,
        text=pdf_text or summary,
        court=COURT,
        karar_no=karar_no,
        decision_date=d,
        extra={"karar_turu": karar_turu, "full_text": bool(pdf_text)},
    )


def extract_pdf_text(data: bytes) -> str:
    """Text layer of a decision PDF. Scanned PDFs without a text layer raise ParseError (no OCR here)."""
    from pypdf import PdfReader

    if not data.startswith(b"%PDF"):
        raise ParseError("not a PDF")
    reader = PdfReader(io.BytesIO(data))
    if len(reader.pages) > MAX_PDF_PAGES:
        raise ParseError("PDF has too many pages")
    parts = [(page.extract_text() or "").strip() for page in reader.pages]
    text = "\n\n".join(p for p in parts if p)
    if not text:
        raise ParseError("PDF has no text layer")
    return text


class RekabetConnector:
    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    def list_decisions(self) -> List[RekabetListEntry]:
        result = self.fetcher.fetch(SOURCE, LIST_URL, external_id="rekabet:list")
        try:
            return parse_list(result.body.decode("utf-8", errors="replace"))
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise

    def fetch_decision(self, url: str, repo: Repository, pdf_url: Optional[str] = None) -> IngestOutcome:
        page = self.fetcher.fetch(SOURCE, url, external_id=url)
        pdf_text: Optional[str] = None
        raws = [page.raw]
        if pdf_url:
            pdf = self.fetcher.fetch(SOURCE, pdf_url, external_id=pdf_url)
            raws.append(pdf.raw)
            try:
                pdf_text = extract_pdf_text(pdf.body)
            except ParseError:
                self.fetcher.report_parse_failure(SOURCE)
                raise
        try:
            draft = parse_detail(page.body.decode("utf-8", errors="replace"), url, page.fetched_at, pdf_text)
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise
        outcome = ingest(draft, raws[-1], repo)
        if len(raws) == 2 and raws[0] is not None:
            repo.upsert_record(draft, raws[0])
        return outcome
