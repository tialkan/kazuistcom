"""Yargitay Karar Arama connector (plan 6.1): core units HGK, CGK and the Buyuk Genel Kurulu (IBK).

karararama.yargitay.gov.tr is the court's own public search. The calls are the ones its page makes
(cross-checked against yargi-mcp, MIT, no code taken):

  list:  POST /aramadetaylist  {"data": {birimYrgKurulDaire, kararYil, pageSize, pageNumber, ...}}
  one:   GET  /getDokuman?id=<id>  -> {"data": "<html of the decision>", "metadata": {...}}

The search page can ask for a reCAPTCHA ("DisplayCaptcha" in the answer). That is a human check: the fetcher
stops the source (core/challenge.py) and nothing is retried or worked around. Request headers stay honest: the
KazuistBot user agent only, no browser disguise and no spoofed origin.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from core.errors import ParseError
from core.fetcher import Fetcher
from core.pipeline import IngestOutcome, Repository, ingest
from core.records import RecordDraft

from .judicial import case_number, decision_html_to_text, parse_dotted_date, slug

SOURCE = "yargitay"
BASE = "https://karararama.yargitay.gov.tr"
COURT = "Yargıtay"
PAGE_SIZE = 10  # the page's own page size; the service answers more only on request we do not make
LICENSE_BASIS = "Resmî karar; Yargıtay Karar Arama sitesinde kamuya açık yayımlanır (toplu çekme için protokol başvurusu gerekli)"

# Core units (plan 6.1): HGK and the IBK body now, CGK in 1.1. Names are the values of the site's own select.
UNITS = ("Büyük Genel Kurulu", "Hukuk Genel Kurulu", "Ceza Genel Kurulu")
FIRST_YEAR = 2010

_CHAMBER_NAMES = {"Büyük Genel Kurulu": "İçtihadı Birleştirme Büyük Genel Kurulu"}


def list_body(unit: str, year: Optional[int], page: int) -> Dict[str, Any]:
    return {
        "data": {
            "arananKelime": "",
            "birimYrgKurulDaire": unit,
            "esasYil": "",
            "esasIlkSiraNo": "",
            "esasSonSiraNo": "",
            "kararYil": str(year) if year else "",
            "kararIlkSiraNo": "",
            "kararSonSiraNo": "",
            "baslangicTarihi": "",
            "bitisTarihi": "",
            "pageSize": PAGE_SIZE,
            "pageNumber": int(page),
        }
    }


def document_url(doc_id: str) -> str:
    return f"{BASE}/getDokuman?id={doc_id}"


def chamber_name(unit: str) -> str:
    return _CHAMBER_NAMES.get(unit, unit)


def source_key(unit: str, esas_no: str, karar_no: str) -> str:
    return f"yargitay:{slug(chamber_name(unit))}:{esas_no.replace('/', '-')}:{karar_no.replace('/', '-')}"


def authority_for(chamber: str) -> str:
    """Plan Ek F: IBK binding; HGK and CGK high precedent; chambers precedent."""
    c = chamber.lower()
    if "birleştirme" in c:
        return "baglayici_karar"
    if c.endswith("genel kurulu"):
        return "yuksek_emsal"
    return "emsal"


@dataclass(frozen=True)
class YargitayItem:
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
    items: List[YargitayItem]


def _envelope(body: bytes) -> Dict[str, Any]:
    try:
        data = json.loads(body)
    except ValueError as exc:
        raise ParseError("response is not JSON") from exc
    if not isinstance(data, dict):
        raise ParseError("unexpected envelope")
    meta = data.get("metadata") or {}
    if meta.get("FMTY") == "ERROR" or data.get("data") is None:
        raise ParseError("service answered with an error")
    return data


def parse_search(body: bytes) -> SearchPage:
    inner = _envelope(body)["data"]
    rows = inner.get("data") if isinstance(inner, dict) else None
    total = inner.get("recordsTotal") if isinstance(inner, dict) else None
    if not isinstance(rows, list) or not isinstance(total, int):
        raise ParseError("list shape not recognised")
    items = []
    for r in rows:
        if not isinstance(r, dict) or not str(r.get("id") or "").isdigit():
            raise ParseError("row without numeric id")
        items.append(
            YargitayItem(
                id=str(r["id"]),
                unit=str(r.get("daire") or ""),
                esas_no=case_number(r.get("esasNo")),
                karar_no=case_number(r.get("kararNo")),
                decision_date=parse_dotted_date(r.get("kararTarihi")),
            )
        )
    return SearchPage(total, items)


def parse_document(
    body: bytes, item: YargitayItem, fetched_at: datetime, protocol_status: str = "gerekmez"
) -> RecordDraft:
    markup = _envelope(body)["data"]
    if not isinstance(markup, str):
        raise ParseError("document is not text")
    text = decision_html_to_text(markup)
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


class YargitayConnector:
    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    @property
    def _protocol(self) -> str:
        return self.fetcher.registry.get(SOURCE).record_protocol_status

    def list_page(self, unit: str, year: Optional[int], page: int) -> SearchPage:
        result = self.fetcher.fetch(
            SOURCE,
            f"{BASE}/aramadetaylist",
            external_id=f"yargitay:list:{unit}:{year or 'all'}:{page}",
            json_body=list_body(unit, year, page),
            store=False,  # a result list is not a document of record
        )
        try:
            return parse_search(result.body)
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise

    def fetch_decision(self, item: YargitayItem, repo: Repository) -> IngestOutcome:
        result = self.fetcher.fetch(SOURCE, document_url(item.id), external_id=f"yargitay:{item.id}")
        try:
            draft = parse_document(result.body, item, result.fetched_at, self._protocol)
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise
        return ingest(draft, result.raw, repo)
