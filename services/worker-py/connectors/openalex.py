"""OpenAlex connector (plan 6.1): bibliographic records, abstract and citation count. CC0 data.

Single work lookups by DOI are free of charge, so this connector only does those. The API key, when present,
goes in the Authorization header from the OPENALEX_API_KEY environment variable and is never logged or stored.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Any, Dict, Mapping, Optional

from core.errors import ParseError
from core.fetcher import Fetcher
from core.pipeline import IngestOutcome, Repository, ingest
from core.records import RecordDraft

SOURCE = "openalex"
API = "https://api.openalex.org"
LICENSE_BASIS = "CC0 (OpenAlex verisi)"
DOI_RE = re.compile(r"^10\.\d{4,9}/[-._;()/:A-Za-z0-9]+$")


def rebuild_abstract(inverted: Optional[Mapping[str, Any]]) -> str:
    if not inverted:
        return ""
    slots: Dict[int, str] = {}
    for word, positions in inverted.items():
        for p in positions:
            slots[int(p)] = word
    return " ".join(slots[i] for i in sorted(slots))


def work_url_for_doi(doi: str) -> str:
    doi = doi.strip().removeprefix("https://doi.org/")
    if not DOI_RE.match(doi):
        raise ValueError("invalid DOI")
    return f"{API}/works/https://doi.org/{doi}"


def parse_work(data: Mapping[str, Any], fetched_at: datetime) -> RecordDraft:
    try:
        oa_id = str(data["id"])
        title = str(data.get("title") or data.get("display_name") or "").strip()
    except KeyError as exc:
        raise ParseError("OpenAlex work without id") from exc
    if not title:
        raise ParseError("OpenAlex work without title")
    short = oa_id.rsplit("/", 1)[-1]
    authors = [
        a["author"]["display_name"]
        for a in data.get("authorships", [])
        if isinstance(a, dict) and a.get("author", {}).get("display_name")
    ]
    venue = ((data.get("primary_location") or {}).get("source") or {}).get("display_name")
    abstract = rebuild_abstract(data.get("abstract_inverted_index"))
    year = data.get("publication_year")
    doi = data.get("doi")
    draft = RecordDraft(
        type="makale",
        title=title,
        authority_class="doktrin",
        jurisdiction="TR" if (data.get("language") == "tr") else "ZZ",
        license_basis=LICENSE_BASIS,
        source_url=oa_id,
        source_key=f"openalex:{short}",
        fetched_at=fetched_at,
        text="\n\n".join(p for p in (title, abstract) if p),
        openalex_cited_by=data.get("cited_by_count") if isinstance(data.get("cited_by_count"), int) else None,
        extra={
            "work": {
                "openalex_id": short,
                "doi": doi.removeprefix("https://doi.org/") if isinstance(doi, str) else None,
                "title": title,
                "authors": authors,
                "year": year if isinstance(year, int) else None,
                "venue": venue,
            }
        },
    )
    return draft


class OpenAlexConnector:
    def __init__(self, fetcher: Fetcher, api_key: Optional[str] = None):
        self.fetcher = fetcher
        self.api_key = api_key if api_key is not None else os.environ.get("OPENALEX_API_KEY")

    def fetch_by_doi(self, doi: str, repo: Repository) -> IngestOutcome:
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        url = work_url_for_doi(doi)
        result = self.fetcher.fetch(SOURCE, url, external_id=f"openalex:doi:{doi}", headers=headers)
        try:
            draft = parse_work(json.loads(result.body), result.fetched_at)
        except (ValueError, ParseError):
            self.fetcher.report_parse_failure(SOURCE)
            raise
        return ingest(draft, result.raw, repo)
