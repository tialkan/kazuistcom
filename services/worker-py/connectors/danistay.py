"""Danistay Karar Arama connector (plan 6.1): IBK now, IDDK and VDDK in 1.1.

karararama.danistay.gov.tr runs the same software as the Yargitay site (the same ministry service), with its
own field names:

  list:  POST /aramadetaylist  {"data": {daire, kararYil, siralama, siralamaDirection, pageSize, pageNumber}}
  one:   GET  /getDokuman?id=<id>&arananKelime=  -> a page whose hidden paragraph holds the escaped decision

Same rules as the Yargitay connector: a CAPTCHA answer stops the source and nothing is worked around; honest
user agent only. Decisions on this site are published already anonymised ("..." for names); they are still
scanned by anon.run (plan 6.4/8).
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from core.errors import ParseError
from core.fetcher import Fetcher
from core.pipeline import IngestOutcome, Repository, ingest
from core.records import RecordDraft

from .judicial import case_number, decision_html_to_text, parse_dotted_date, slug

SOURCE = "danistay"
BASE = "https://karararama.danistay.gov.tr"
COURT = "Danıştay"
PAGE_SIZE = 10
LICENSE_BASIS = "Resmî karar; Danıştay Karar Arama sitesinde kamuya açık yayımlanır (toplu çekme için protokol başvurusu gerekli)"

# Values of the site's own select. IBK is listed first as plan 6.1 asks; on 2026-11-15 the site returned no
# result for either IBK option ("İçtihatları Birleştirme Kurulu", "Büyük Gen.Kur."), so the unit stays configured
# and simply yields nothing until the site lists such decisions.
UNITS = (
    "İçtihatları Birleştirme Kurulu",
    "İdare Dava Daireleri Kurulu",
    "Vergi Dava Daireleri Kurulu",
)
FIRST_YEAR = 2010

_CHAMBER_NAMES = {
    "İdare Dava Daireleri Kurulu": "İdari Dava Daireleri Kurulu",
    "Büyük Gen.Kur.": "İçtihatları Birleştirme Kurulu",
}
_HIDDEN = re.compile(r'<p[^>]*id="hiddencontent"[^>]*>(.*?)</p>', re.S)


def list_body(unit: str, year: Optional[int], page: int) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "daire": unit,
        "siralama": "1",
        "siralamaDirection": "desc",
        "pageSize": PAGE_SIZE,
        "pageNumber": int(page),
    }
    if year:
        body["kararYil"] = str(year)
    return {"data": body}


def document_url(doc_id: str) -> str:
    return f"{BASE}/getDokuman?id={doc_id}&arananKelime="


def chamber_name(unit: str) -> str:
    return _CHAMBER_NAMES.get(unit, unit)


def source_key(unit: str, esas_no: str, karar_no: str) -> str:
    return f"danistay:{slug(chamber_name(unit))}:{esas_no.replace('/', '-')}:{karar_no.replace('/', '-')}"


def authority_for(chamber: str) -> str:
    c = chamber.lower()
    if "birleştirme" in c:
        return "baglayici_karar"
    if c.endswith("daireleri kurulu"):
        return "yuksek_emsal"
    return "emsal"


@dataclass(frozen=True)
class DanistayItem:
    id: str
    unit: str
    esas_no: Optional[str]
    karar_no: Optional[str]
    decision_date: Optional[date]

    @property
    def key(self) -> Optional[str]:
        """The record's source_key, known from the list row before the document is fetched."""
        if not (self.unit and self.esas_no and self.karar_no):
            return None
        return source_key(self.unit, self.esas_no, self.karar_no)


@dataclass
class SearchPage:
    total: int
    items: List[DanistayItem]


def parse_search(body: bytes) -> SearchPage:
    try:
        data = json.loads(body)
    except ValueError as exc:
        raise ParseError("response is not JSON") from exc
    meta = data.get("metadata") or {} if isinstance(data, dict) else {}
    inner = data.get("data") if isinstance(data, dict) else None
    if meta.get("FMTY") == "ERROR" or not isinstance(inner, dict):
        raise ParseError("service answered with an error")
    rows, total = inner.get("data"), inner.get("recordsTotal")
    if not isinstance(rows, list) or not isinstance(total, int):
        raise ParseError("list shape not recognised")
    items = []
    for r in rows:
        if not isinstance(r, dict) or not str(r.get("id") or "").isdigit():
            raise ParseError("row without numeric id")
        items.append(
            DanistayItem(
                id=str(r["id"]),
                unit=str(r.get("daireKurul") or r.get("daire") or ""),
                esas_no=case_number(r.get("esasNo")),
                karar_no=case_number(r.get("kararNo")),
                decision_date=parse_dotted_date(r.get("kararTarihi")),
            )
        )
    return SearchPage(total, items)


def parse_document(
    body: bytes, item: DanistayItem, fetched_at: datetime, protocol_status: str = "gerekmez"
) -> RecordDraft:
    page = body.decode("utf-8", errors="replace")
    m = _HIDDEN.search(page)
    if not m:
        raise ParseError("decision paragraph not found")
    text = decision_html_to_text(html.unescape(m.group(1)))
    if not (item.unit and item.esas_no and item.karar_no and item.decision_date):
        raise ParseError("unit, esas, karar or date missing")
    chamber = chamber_name(item.unit)
    d = item.decision_date
    return RecordDraft(
        type="karar",
        title=f"{COURT} {chamber}, E. {item.esas_no}, K. {item.karar_no} ({d.strftime('%d.%m.%Y')})",
        authority_class=authority_for(chamber),
        license_basis=LICENSE_BASIS,
        source_url=document_url(item.id),
        source_key=source_key(item.unit, item.esas_no, item.karar_no),
        fetched_at=fetched_at,
        text=text,
        court=COURT,
        chamber=chamber,
        esas_no=item.esas_no,
        karar_no=item.karar_no,
        decision_date=d,
        protocol_status=protocol_status,
    )


class DanistayConnector:
    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    @property
    def _protocol(self) -> str:
        return self.fetcher.registry.get(SOURCE).record_protocol_status

    def list_page(self, unit: str, year: Optional[int], page: int) -> SearchPage:
        result = self.fetcher.fetch(
            SOURCE,
            f"{BASE}/aramadetaylist",
            external_id=f"danistay:list:{unit}:{year or 'all'}:{page}",
            json_body=list_body(unit, year, page),
            store=False,
        )
        try:
            return parse_search(result.body)
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise

    def fetch_decision(self, item: DanistayItem, repo: Repository) -> IngestOutcome:
        result = self.fetcher.fetch(SOURCE, document_url(item.id), external_id=f"danistay:{item.id}")
        try:
            draft = parse_document(result.body, item, result.fetched_at, self._protocol)
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise
        return ingest(draft, result.raw, repo)
