"""Discovery jobs: list pages that turn into per-document ingest.fetch jobs (plan 6.1 "Tazelik" column).

The job queue is the resume point. A list job fetches one result page, queues one document job for every
decision the corpus does not hold yet (dedupe key = the record's source_key, so a queued or running document is
never queued twice) and, while the source has more pages, the next list job. Killing the worker loses nothing;
a retry of a list job re-queues only what is still unknown.

Payload shapes (job contract v1.6, ADR-0038, packages/contracts/src/jobs.ts IngestFetchPayload; core/jobs.py checks
the same shapes before a handler runs, and the handlers below check the fields again):

  aym list      {"source":"aym","kararTipi":"BireyselBasvuru"|"NormDenetimi","page":n}
  aym document  {"source":"aym","kararTipi":...,"id":"<uuid>"}
  court list    {"source":"yargitay"|"danistay","unit":"...","year":2024,"page":n}
  court doc     {"source":...,"id":"<digits>","unit":"...","esas":"2024/1","karar":"2024/2","date":"YYYY-MM-DD"}
  kvkk list     {"source":"kvkk","page":n};  rekabet list {"source":"rekabet","page":1}

Payloads carry identifiers only: case numbers, dates and unit names, never a party name or any decision text.
Results carry counts only.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, List, Mapping, Optional

from connectors import aym, danistay, yargitay
from connectors.kvkk import KvkkConnector
from connectors.rekabet import RekabetConnector

from .fetcher import Fetcher
from .jobs import JobType
from .pipeline import Repository

MAX_PAGE = 10_000
_UUID = re.compile(r"^[0-9a-fA-F-]{36}$")
# The contract's case number (core/jobs.py _CASE_NO, connectors/judicial.py case_number): four ASCII digits, a slash,
# the number part and an optional trailing "/<digits>" ("2024/817", "2019/1-123", "2024/2914/2"). Python \d would
# also match other Unicode digits, so [0-9] is spelled out.
_CASE_NO = re.compile(r"^[0-9]{4}/[0-9A-Za-z()\-]+(?:/[0-9]+)?\Z")
_CASE_NO_MAX = 50
_DOC_ID = re.compile(r"^[0-9]{1,20}\Z")


class BadJob(ValueError):
    """The payload does not have a shape this module knows (the consumer already checks the contract)."""


def _queue(repo: Repository, payload: Dict[str, Any], key: Optional[str]) -> None:
    repo.enqueue(JobType.INGEST_FETCH, payload, key)


def _case_no(value: str) -> bool:
    return len(value) <= _CASE_NO_MAX and bool(_CASE_NO.match(value))


def _page(payload: Mapping[str, Any]) -> int:
    page = payload.get("page")
    if isinstance(page, bool) or not isinstance(page, int) or not 1 <= page <= MAX_PAGE:
        raise BadJob("page")
    return page


# --- AYM --------------------------------------------------------------------------------------------------
def aym_job(fetcher: Fetcher, repo: Repository, payload: Mapping[str, Any]) -> Dict[str, Any]:
    tipi = str(payload.get("kararTipi", ""))
    if tipi not in (aym.BB, aym.ND):
        raise BadJob("kararTipi")
    conn = aym.AymConnector(fetcher)
    if "id" in payload:
        uuid = str(payload["id"])
        if not _UUID.match(uuid):
            raise BadJob("id")
        out = conn.fetch_decision(tipi, uuid, repo)
        return {"recordId": out.record_id, "created": out.created}
    page = _page(payload)
    result = conn.list_page(tipi, page)
    merits = [i for i in result.items if i.is_merits]
    known = repo.known_source_keys([i.key for i in merits])
    queued = 0
    for item in merits:
        if item.key not in known:
            _queue(repo, {"source": "aym", "kararTipi": tipi, "id": item.id}, item.key)
            queued += 1
    more = page * aym.LIST_PAGE_SIZE < result.total and bool(result.items) and page < MAX_PAGE
    if more:
        _queue(repo, {"source": "aym", "kararTipi": tipi, "page": page + 1}, f"aym:list:{tipi}:{page + 1}")
    return {"listed": len(result.items), "merits": len(merits), "queued": queued, "next": more}


# --- Yargitay and Danistay --------------------------------------------------------------------------------
_COURTS = {
    "yargitay": (yargitay, yargitay.YargitayConnector, yargitay.YargitayItem, yargitay.PAGE_SIZE),
    "danistay": (danistay, danistay.DanistayConnector, danistay.DanistayItem, danistay.PAGE_SIZE),
}


def court_job(fetcher: Fetcher, repo: Repository, payload: Mapping[str, Any]) -> Dict[str, Any]:
    source = str(payload.get("source", ""))
    module, connector_cls, item_cls, page_size = _COURTS[source]
    conn = connector_cls(fetcher)
    unit = str(payload.get("unit", ""))
    if not unit or len(unit) > 100:
        raise BadJob("unit")
    if "id" in payload:
        doc_id, esas, karar = str(payload["id"]), str(payload.get("esas", "")), str(payload.get("karar", ""))
        if not _DOC_ID.match(doc_id) or not _case_no(esas) or not _case_no(karar):
            raise BadJob("id")
        try:
            decided = date.fromisoformat(str(payload.get("date", "")))
        except ValueError as exc:
            raise BadJob("date") from exc
        out = conn.fetch_decision(item_cls(doc_id, unit, esas, karar, decided), repo)
        return {"recordId": out.record_id, "created": out.created}
    year, page = payload.get("year"), _page(payload)
    if isinstance(year, bool) or not isinstance(year, int) or not 1900 <= year <= 2100:
        raise BadJob("year")
    result = conn.list_page(unit, year, page)
    keyed = [i for i in result.items if i.key and i.decision_date]
    known = repo.known_source_keys([i.key for i in keyed if i.key])
    queued = 0
    for item in keyed:
        if item.key in known:
            continue
        _queue(
            repo,
            {
                "source": source,
                "id": item.id,
                "unit": unit,
                "esas": item.esas_no,
                "karar": item.karar_no,
                "date": item.decision_date.isoformat() if item.decision_date else "",
            },
            item.key,
        )
        queued += 1
    more = page * page_size < result.total and bool(result.items) and page < MAX_PAGE
    if more:
        _queue(
            repo,
            {"source": source, "unit": unit, "year": year, "page": page + 1},
            f"{source}:list:{unit}:{year}:{page + 1}",
        )
    return {"listed": len(result.items), "skipped": len(result.items) - len(keyed), "queued": queued, "next": more}


# --- KVKK and Rekabet -------------------------------------------------------------------------------------
def kvkk_list_job(fetcher: Fetcher, repo: Repository, payload: Mapping[str, Any]) -> Dict[str, Any]:
    page = _page(payload)
    entries, has_next = KvkkConnector(fetcher).list_page_full(page)
    keys = {f"kvkk:{e.content_id}": e for e in entries}
    known = repo.known_source_keys(list(keys))
    queued = 0
    for key, entry in keys.items():
        if key not in known:
            _queue(repo, {"source": "kvkk", "url": entry.url}, key)
            queued += 1
    if has_next and page < MAX_PAGE:
        _queue(repo, {"source": "kvkk", "page": page + 1}, f"kvkk:list:{page + 1}")
    return {"listed": len(entries), "queued": queued, "next": has_next}


def rekabet_list_job(fetcher: Fetcher, repo: Repository, payload: Mapping[str, Any]) -> Dict[str, Any]:
    _page(payload)  # the Rekabet list is a single page (the connector reads the latest decisions)
    entries: List[Any] = RekabetConnector(fetcher).list_decisions()
    keys = {f"rekabet:{e.guid}": e for e in entries}
    known = repo.known_source_keys(list(keys))
    queued = 0
    for key, entry in keys.items():
        if key not in known:
            _queue(repo, {"source": "rekabet", "url": entry.url}, key)
            queued += 1
    return {"listed": len(entries), "queued": queued, "next": False}


def is_discovery_or_court(payload: Mapping[str, Any]) -> Optional[str]:
    """Name of the handler group for the new payload shapes, None for the shapes runtime.py already handles."""
    source = payload.get("source")
    if source == "aym":
        return "aym"
    if source in _COURTS:
        return "court"
    if source in ("kvkk", "rekabet") and "page" in payload:
        return f"{source}_list"
    return None
