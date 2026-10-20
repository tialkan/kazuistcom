"""Crossref connector (plan 6.1): DOI metadata from the official REST API. No personal contact data in URLs."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Mapping

from core.errors import ParseError
from core.fetcher import Fetcher
from core.pipeline import IngestOutcome, Repository, ingest
from core.records import RecordDraft

from .base import strip_tags
from .openalex import DOI_RE

SOURCE = "crossref"
API = "https://api.crossref.org"
LICENSE_BASIS = "Crossref üstveri (olgusal künye; Crossref kullanım şartları)"


def work_url(doi: str) -> str:
    doi = doi.strip().removeprefix("https://doi.org/")
    if not DOI_RE.match(doi):
        raise ValueError("invalid DOI")
    return f"{API}/works/{doi}"


def parse_work(payload: Mapping[str, Any], fetched_at: datetime) -> RecordDraft:
    msg = payload.get("message")
    if payload.get("status") != "ok" or not isinstance(msg, dict) or not msg.get("DOI"):
        raise ParseError("not a Crossref work response")
    titles = msg.get("title") or []
    if not titles:
        raise ParseError("Crossref work without title")
    title = strip_tags(str(titles[0]))
    authors = [
        " ".join(p for p in (a.get("given"), a.get("family")) if p) or a.get("name", "")
        for a in msg.get("author", [])
        if isinstance(a, dict)
    ]
    parts = ((msg.get("issued") or {}).get("date-parts") or [[None]])[0]
    year = parts[0] if parts and isinstance(parts[0], int) else None
    venue = (msg.get("container-title") or [None])[0]
    doi = str(msg["DOI"]).lower()
    kind = "kitap" if str(msg.get("type", "")).startswith("book") else "makale"
    abstract = strip_tags(str(msg.get("abstract", "")))
    return RecordDraft(
        type=kind,
        title=title,
        authority_class="doktrin",
        jurisdiction="INT",
        license_basis=LICENSE_BASIS,
        source_url=f"https://doi.org/{doi}",
        source_key=f"crossref:{doi}",
        fetched_at=fetched_at,
        text="\n\n".join(p for p in (title, abstract) if p),
        extra={
            "work": {
                "openalex_id": None,
                "doi": doi,
                "title": title,
                "authors": [a for a in authors if a],
                "year": year,
                "venue": venue,
            },
            "is_referenced_by": msg.get("is-referenced-by-count"),
        },
    )


class CrossrefConnector:
    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    def fetch_by_doi(self, doi: str, repo: Repository) -> IngestOutcome:
        url = work_url(doi)
        result = self.fetcher.fetch(
            SOURCE, url, external_id=f"crossref:{doi.lower()}", headers={"Accept": "application/json"}
        )
        try:
            draft = parse_work(json.loads(result.body), result.fetched_at)
        except (ValueError, ParseError):
            self.fetcher.report_parse_failure(SOURCE)
            raise
        return ingest(draft, result.raw, repo)
