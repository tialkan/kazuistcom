"""Mevzuat Bilgi Sistemi connector (plan 6.1, 6.6): article parsing and version snapshots.

Each article becomes one record (source_key mevzuat:<kanunNo>:m<no>) with a record_versions chain. A change
closes the previous version with validTo = new validFrom - 1 day and opens a new one. The retrospective chain
from Resmi Gazete amending laws is not built here (plan 6.6: editor approval); this connector keeps the
forward chain from the snapshot date.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional

from core.errors import ParseError
from core.fetcher import Fetcher
from core.pipeline import IngestOutcome, Repository, ingest
from core.records import RecordDraft, VersionDraft

from .base import html_to_text, parse_dmy

SOURCE = "mevzuat"
BASE = "https://www.mevzuat.gov.tr"
LICENSE_BASIS = "Resmî metin (FSEK m.31); Mevzuat Bilgi Sistemi"

_ARTICLE = re.compile(
    r"^(?P<kind>EK\s+MADDE|GEÇİCİ\s+MADDE|GEÇICI\s+MADDE|MADDE)\s+(?P<no>\d+(?:/[A-ZÇĞİÖŞÜ])?)\s*[-–]\s*(?P<body>.*)$",
    re.I,
)
_ANNOTATION = re.compile(
    r"\((?P<verb>Değişik|Ek|İptal|Mülga|Yeniden düzenleme|Ek fıkra|Değişik fıkra|Ek cümle)[^:)]*:\s*"
    r"(?P<date>\d{1,2}/\d{1,2}/\d{4})\s*-\s*(?P<law>\d{3,4})",
    re.I,
)


def _kind_code(raw: str) -> str:
    head = raw.strip()[:2].lower()  # 'ek' / 'ge' / 'ma'; avoids Turkish dotted I case mapping issues
    return "ek" if head == "ek" else ("gecici" if head == "ge" else "m")


@dataclass(frozen=True)
class LawMeta:
    kanun_no: str
    title: str
    tur: int = 1
    tertip: int = 5
    authority_class: str = "baglayici_norm"


@dataclass
class Article:
    kind: str  # m, ek, gecici
    no: str
    heading: Optional[str]
    text: str
    amended_by: Optional[str] = None
    amended_date: Optional[date] = None
    repealed: bool = False

    @property
    def key(self) -> str:
        return f"{self.kind}{self.no.lower().replace('/', '-')}"

    @property
    def label(self) -> str:
        return {"m": "Madde", "ek": "Ek Madde", "gecici": "Geçici Madde"}[self.kind] + " " + self.no


def law_url(meta: LawMeta) -> str:
    """The address users get (sourceUrl). Its HTML is a shell; the text is not in it."""
    return f"{BASE}/mevzuat?MevzuatNo={meta.kanun_no}&MevzuatTur={meta.tur}&MevzuatTertip={meta.tertip}"


def text_url(meta: LawMeta) -> str:
    """The address the page itself loads the law text from (an iframe document), checked 2026-11-15 through a
    reading tool that answered with the law text: bold "MADDE n-" labels, bold headings, (Degisik: d/m/yyyy-NNNN/n md.)
    notes and footnote markers. Fetching law_url() instead returns the shell without any article."""
    return (
        f"{BASE}/anasayfa/MevzuatFihristDetayIframe?MevzuatTur={meta.tur}"
        f"&MevzuatNo={meta.kanun_no}&MevzuatTertip={meta.tertip}"
    )


def _looks_like_heading(line: str) -> bool:
    if re.search(r"\b(BÖLÜM|KISIM|BOLUM)\b", line, re.I) and len(line) < 40:
        return False
    return 0 < len(line) <= 90 and not line.endswith((".", ";", ":")) and not _ARTICLE.match(line)


def parse_articles(text: str) -> List[Article]:
    """Split the plain text of a law into articles. Text before the first article (title, preamble) is dropped."""
    lines = [ln.strip() for ln in text.splitlines()]
    articles: List[Article] = []
    current: Optional[Article] = None
    body: List[str] = []
    pending_heading: Optional[str] = None

    def close() -> None:
        nonlocal current, body
        if current is not None:
            current.text = "\n".join(b for b in body if b).strip()
            ann = list(_ANNOTATION.finditer(current.text))
            if ann:
                last = max(ann, key=lambda a: parse_dmy(a.group("date")) or date.min)
                current.amended_date = parse_dmy(last.group("date"))
                current.amended_by = f"{last.group('law')} sayılı Kanun ({last.group('date')})"
            if re.match(r"^MADDE\s+\S+\s*[-–]\s*\((?:Mülga|İptal)", current.text, re.I) or re.search(
                r"\((?:Mülga|İptal)[^)]*\)\s*$", current.text, re.I
            ):
                current.repealed = True
            articles.append(current)
        current, body = None, []

    for ln in lines:
        if not ln:
            continue
        m = _ARTICLE.match(ln)
        if m:
            close()
            kind = _kind_code(m.group("kind"))
            current = Article(kind, m.group("no"), pending_heading, "")
            body = [ln]
            pending_heading = None
            continue
        if current is None:
            pending_heading = ln if _looks_like_heading(ln) else None
            continue
        # A short unpunctuated line directly before the next article is that article's heading.
        if _looks_like_heading(ln):
            pending_heading = ln
            body.append(ln)
        else:
            pending_heading = None
            body.append(ln)
    close()
    # Heading lines were appended to the previous article body; move them out.
    for prev, nxt in zip(articles, articles[1:]):
        if nxt.heading and prev.text.endswith(nxt.heading):
            prev.text = prev.text[: -len(nxt.heading)].rstrip()
    if not articles:
        raise ParseError("no articles found")
    return articles


def build_law_record(meta: LawMeta, source_url: str, fetched_at: datetime) -> RecordDraft:
    """Kunye level record for the law itself (all titles are kept at kunye level)."""
    return RecordDraft(
        type="mevzuat",
        title=f"{meta.title} ({meta.kanun_no} sayılı)",
        authority_class=meta.authority_class,
        license_basis=LICENSE_BASIS,
        source_url=source_url,
        source_key=f"mevzuat:{meta.kanun_no}",
        fetched_at=fetched_at,
        text=meta.title,
        status="yururlukte",
    )


def build_article_records(
    meta: LawMeta, articles: List[Article], source_url: str, fetched_at: datetime, snapshot_date: date
) -> List[RecordDraft]:
    drafts: List[RecordDraft] = []
    for a in articles:
        status = "yururlukten_kalkti" if a.repealed else ("degisti" if a.amended_by else "yururlukte")
        title = f"{meta.title} {a.label}" + (f" ({a.heading})" if a.heading else "")
        drafts.append(
            RecordDraft(
                type="mevzuat",
                title=title,
                authority_class=meta.authority_class,
                license_basis=LICENSE_BASIS,
                source_url=source_url,
                source_key=f"mevzuat:{meta.kanun_no}:{a.key}",
                fetched_at=fetched_at,
                text=a.text,
                status=status,
                valid_from=snapshot_date,
                amended_by=a.amended_by,
                norm_refs=[{"kanunNo": meta.kanun_no, "madde": a.no}],
                versions=[VersionDraft(snapshot_date, None, a.text, a.amended_by)],
            )
        )
    return drafts


class MevzuatConnector:
    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    def fetch_law(self, meta: LawMeta, repo: Repository, snapshot_date: date) -> List[IngestOutcome]:
        url = law_url(meta)
        result = self.fetcher.fetch(SOURCE, text_url(meta), external_id=f"mevzuat:{meta.kanun_no}")
        try:
            articles = parse_articles(html_to_text(result.body.decode("utf-8", errors="replace")))
        except ParseError:
            self.fetcher.report_parse_failure(SOURCE)
            raise
        outcomes = [ingest(build_law_record(meta, url, result.fetched_at), result.raw, repo)]
        for draft in build_article_records(meta, articles, url, result.fetched_at, snapshot_date):
            outcomes.append(ingest(draft, result.raw, repo))
        return outcomes
