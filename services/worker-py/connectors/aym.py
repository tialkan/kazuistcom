"""Anayasa Mahkemesi Kararlar Bilgi Bankasi connector (plan 6.1): bireysel basvuru and norm denetimi decisions.

The bank is a single page application over one JSON endpoint, POST /api/core/public/search (the same call the
page itself makes; endpoint shape cross-checked against yargi-mcp, MIT, no code taken):

  list:    {"kararTipi": "BireyselBasvuru" | "NormDenetimi", "page": n, "size": k}
  one:     {"kararTipi": ..., "id": "<uuid>", "page": 1, "size": 1}   -> data[0].icerik is the decision HTML

Only this JSON endpoint is used. File downloads (PDF, UDF, Word) sit behind the site's own human check and are
never requested. The list carries the applicant's name (basvuruAdi); it is dropped here, never copied into a
record, and survives only inside the raw archive bytes. The decision text itself names parties and lawyers and
therefore goes through anon.run before anything reaches search (plan 6.2/6).
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from core.errors import ParseError
from core.fetcher import Fetcher
from core.pipeline import IngestOutcome, Repository, ingest
from core.records import RecordDraft

from .judicial import case_number, decision_html_to_text, parse_iso_date

SOURCE = "aym"
BB = "BireyselBasvuru"
ND = "NormDenetimi"
HOSTS = {BB: "https://kararlarbilgibankasi.anayasa.gov.tr", ND: "https://normkararlarbilgibankasi.anayasa.gov.tr"}
SEARCH_PATH = "/api/core/public/search"
COURT = "Anayasa Mahkemesi"
LIST_PAGE_SIZE = 100
LICENSE_BASIS = (
    "Resmî karar (Anayasa m.153, 6216 sayılı Kanun m.50); Anayasa Mahkemesi Kararlar Bilgi Bankası'nda "
    "kamuya açık yayımlanır"
)


def search_url(karar_tipi: str) -> str:
    return HOSTS[_tipi(karar_tipi)] + SEARCH_PATH


def _tipi(value: str) -> str:
    if value not in HOSTS:
        raise ValueError("unknown kararTipi")
    return value


def list_body(karar_tipi: str, page: int, size: int = LIST_PAGE_SIZE) -> Dict[str, Any]:
    return {"kararTipi": _tipi(karar_tipi), "page": int(page), "size": int(size)}


def one_body(karar_tipi: str, uuid: str) -> Dict[str, Any]:
    return {"kararTipi": _tipi(karar_tipi), "id": uuid, "page": 1, "size": 1}


def source_key(karar_tipi: str, uuid: str) -> str:
    return f"aym:{'bb' if _tipi(karar_tipi) == BB else 'nd'}:{uuid}"


def decision_url(karar_tipi: str, uuid: str) -> str:
    """The address the bank's own page uses for a decision (base64url of "kbb:<uuid>"); shown to users."""
    token = base64.urlsafe_b64encode(f"kbb:{uuid}".encode()).decode().rstrip("=")
    return f"{HOSTS[_tipi(karar_tipi)]}/kbb/pages/search/{karar_tipi}?id={quote(token)}&type={karar_tipi}"


@dataclass(frozen=True)
class AymItem:
    """A list row. basvuruAdi (applicant name) is deliberately not a field."""

    karar_tipi: str
    id: str
    basvuru_no: Optional[str]
    esas_no: Optional[str]
    karar_no: Optional[str]
    decision_date: Optional[date]
    birim: Optional[str]
    result: Optional[str]

    @property
    def key(self) -> str:
        return source_key(self.karar_tipi, self.id)

    @property
    def is_merits(self) -> bool:
        """Norm decisions all count; of individual applications only the merits (esas) decisions do
        (plan 6.1); inadmissibility decisions ("Kabul Edilemezlik vd.") are skipped."""
        if self.karar_tipi == ND:
            return True
        return (self.result or "").strip().lower().startswith("esas")


@dataclass
class SearchPage:
    total: int
    page: int
    page_size: int
    items: List[AymItem]


def _load(body: bytes) -> Dict[str, Any]:
    try:
        data = json.loads(body)
    except ValueError as exc:
        raise ParseError("response is not JSON") from exc
    if not isinstance(data, dict) or not isinstance(data.get("data"), list):
        raise ParseError("unexpected envelope")
    return data


def _item(raw: Dict[str, Any], karar_tipi: str) -> AymItem:
    uuid = raw.get("id")
    if not isinstance(uuid, str) or not uuid:
        raise ParseError("row without id")
    return AymItem(
        karar_tipi=karar_tipi,
        id=uuid,
        basvuru_no=case_number(raw.get("basvuruNo")),
        esas_no=case_number(raw.get("esasNo")),
        karar_no=case_number(raw.get("kararNo")),
        decision_date=parse_iso_date(raw.get("kararTarihi")),
        birim=raw.get("kararVerenBirimLabel") or None,
        result=raw.get("kararTuruBasvuruSonucuLabel") or raw.get("kararTuruDosyaSonucuLabel") or None,
    )


def parse_search(body: bytes, karar_tipi: str) -> SearchPage:
    data = _load(body)
    rows = [_item(r, karar_tipi) for r in data["data"] if isinstance(r, dict)]
    total = data.get("total")
    if not isinstance(total, int):
        raise ParseError("total missing")
    return SearchPage(total, int(data.get("page") or 1), int(data.get("page_size") or len(rows)), rows)


def parse_decision(
    body: bytes, karar_tipi: str, fetched_at: datetime, protocol_status: str = "gerekmez"
) -> RecordDraft:
    data = _load(body)
    if not data["data"] or not isinstance(data["data"][0], dict):
        raise ParseError("decision not found")
    raw = data["data"][0]
    item = _item(raw, karar_tipi)
    icerik = raw.get("icerik")
    if not isinstance(icerik, str) or not icerik.strip():
        raise ParseError("decision text missing")
    text = decision_html_to_text(icerik)
    when = f" ({item.decision_date.strftime('%d.%m.%Y')})" if item.decision_date else ""
    if karar_tipi == BB:
        if not item.basvuru_no or not item.decision_date:
            raise ParseError("application number or date missing")
        title = f"{COURT}, {item.birim or 'Bölüm'}, B. No: {item.basvuru_no}{when}"
        esas, karar, chamber, authority, kind = item.basvuru_no, None, item.birim, "yuksek_emsal", "bireysel_basvuru"
        key = source_key(BB, item.id)
    else:
        if not item.esas_no or not item.karar_no or not item.decision_date:
            raise ParseError("esas, karar or date missing")
        title = f"{COURT}, E. {item.esas_no}, K. {item.karar_no}{when}"
        esas, karar, chamber, authority, kind = item.esas_no, item.karar_no, None, "baglayici_karar", "norm_denetimi"
        key = source_key(ND, item.id)
    return RecordDraft(
        type="karar",
        title=title,
        authority_class=authority,
        license_basis=LICENSE_BASIS,
        source_url=decision_url(karar_tipi, item.id),
        source_key=key,
        fetched_at=fetched_at,
        text=text,
        court=COURT,
        chamber=chamber,
        esas_no=esas,
        karar_no=karar,
        decision_date=item.decision_date,
        protocol_status=protocol_status,
        extra={"aym_kind": kind, "result": item.result},
    )


class AymConnector:
    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    @property
    def _protocol(self) -> str:
        return self.fetcher.registry.get(SOURCE).record_protocol_status

    def list_page(self, karar_tipi: str, page: int, size: int = LIST_PAGE_SIZE) -> SearchPage:
        result = self.fetcher.fetch(
            SOURCE,
            search_url(karar_tipi),
            external_id=f"aym:list:{karar_tipi}:{size}:{page}",
            json_body=list_body(karar_tipi, page, size),
            store=False,  # a result list is not a document of record (and it carries applicant names)
        )
        try:
            return parse_search(result.body, karar_tipi)
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise

    def fetch_decision(self, karar_tipi: str, uuid: str, repo: Repository) -> IngestOutcome:
        result = self.fetcher.fetch(
            SOURCE,
            search_url(karar_tipi),
            external_id=f"aym:{karar_tipi}:{uuid}",
            json_body=one_body(karar_tipi, uuid),
        )
        try:
            draft = parse_decision(result.body, karar_tipi, result.fetched_at, self._protocol)
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise
        return ingest(draft, result.raw, repo)
