"""Selected EU legal acts through CELLAR (plan 6.1). EUR-Lex pages sit behind a bot challenge, so only the
publications.europa.eu CELLAR resource endpoint is used (robots.txt of op.europa.eu allows /resource/)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Dict, List, Tuple

from core.errors import ParseError
from core.fetcher import Fetcher
from core.pipeline import IngestOutcome, Repository, ingest
from core.records import RecordDraft

from .base import strip_tags

SOURCE = "eurlex"
CELLAR = "https://publications.europa.eu/resource/celex"
LICENSE_BASIS = "AB yeniden kullanım kararı (2011/833/AB)"

# Selected acts only (plan 6.1): CELEX number to short title.
SELECTED_ACTS: Dict[str, str] = {
    "32016R0679": "GDPR (Regulation (EU) 2016/679)",
    "32022R2065": "Digital Services Act (Regulation (EU) 2022/2065)",
    "32022R1925": "Digital Markets Act (Regulation (EU) 2022/1925)",
    "32024R1689": "AI Act (Regulation (EU) 2024/1689)",
}
_CELEX = re.compile(r"^3\d{4}[A-Z]\d{4}$")
_ART = re.compile(r'<div class="eli-subdivision" id="art_(\d+)">(.*?)(?=<div class="eli-subdivision" id="art_|\Z)', re.S)


def cellar_url(celex: str) -> str:
    if not _CELEX.match(celex):
        raise ValueError("invalid CELEX number")
    return f"{CELLAR}/{celex}"


def official_link(celex: str) -> str:
    return f"https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:{celex}"


def parse_articles(markup: str) -> List[Tuple[str, str, str]]:
    """(article number, subject title, text) for each article division of the CELLAR XHTML."""
    articles: List[Tuple[str, str, str]] = []
    for m in _ART.finditer(markup):
        body = m.group(2)
        title_m = re.search(r'class="oj-sti-art">(.*?)</p>', body, re.S)
        paras = [strip_tags(p) for p in re.findall(r'<p class="oj-(?:normal|ti-art)"[^>]*>(.*?)</p>', body, re.S)]
        paras = [p for p in paras if p]
        if not paras:
            continue
        articles.append((m.group(1), strip_tags(title_m.group(1)) if title_m else "", "\n".join(paras)))
    if not articles:
        raise ParseError("no articles found in CELLAR document")
    return articles


def parse_act(celex: str, markup: str, fetched_at: datetime, title: str | None = None) -> RecordDraft:
    articles = parse_articles(markup)
    body = "\n\n".join(
        f"Article {no}" + (f" ({heading})" if heading else "") + "\n" + text.split("\n", 1)[-1]
        for no, heading, text in articles
    )
    return RecordDraft(
        type="ab_hukuku",
        title=title or SELECTED_ACTS.get(celex, celex),
        authority_class="baglayici_norm",
        jurisdiction="AB",
        license_basis=LICENSE_BASIS,
        source_url=official_link(celex),
        source_key=f"eurlex:{celex}",
        fetched_at=fetched_at,
        text=body,
        status="yururlukte",
        extra={"language": "en", "article_count": len(articles)},
    )


class EurLexConnector:
    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    def fetch_act(self, celex: str, repo: Repository) -> IngestOutcome:
        if celex not in SELECTED_ACTS:
            raise ValueError("act is not in the selected list")
        result = self.fetcher.fetch(
            SOURCE,
            cellar_url(celex),
            external_id=f"eurlex:{celex}",
            headers={"Accept": "application/xhtml+xml", "Accept-Language": "eng"},
        )
        try:
            draft = parse_act(celex, result.body.decode("utf-8", errors="replace"), result.fetched_at)
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise
        return ingest(draft, result.raw, repo)
