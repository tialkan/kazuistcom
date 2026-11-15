"""Wiring of registry, fetcher, archive and repository provider; job handlers for the ingestion job types."""

from __future__ import annotations

import os
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Callable, ContextManager, Dict, Iterator, Mapping, Optional

from .fetcher import Fetcher, Transport, UrllibTransport
from .jobs import ClaimedJob, JobType
from .pipeline import PgRepository, Repository
from .sources import SourceRegistry
from .storage import LocalObjectStore, ObjectStore, RawArchive

RepoProvider = Callable[[], ContextManager[Repository]]


@dataclass
class Runtime:
    registry: SourceRegistry
    fetcher: Fetcher
    repo_provider: RepoProvider


def build_runtime(
    env: Optional[Mapping[str, str]] = None,
    transport: Optional[Transport] = None,
    store: Optional[ObjectStore] = None,
    repo_provider: Optional[RepoProvider] = None,
) -> Runtime:
    env = env if env is not None else os.environ
    registry = SourceRegistry.load(env=env)
    archive = RawArchive(store or LocalObjectStore(Path(env.get("KAZUIST_RAW_DIR", "./.raw-store"))))
    from .ssrf import system_resolver

    fetcher = Fetcher(registry, transport or UrllibTransport(), archive, resolver=system_resolver)
    return Runtime(registry, fetcher, repo_provider or _pg_provider(env))


def _pg_provider(env: Mapping[str, str]) -> RepoProvider:
    @contextmanager
    def provider() -> Iterator[Repository]:
        import psycopg

        with psycopg.connect(env["DATABASE_URL"]) as conn:
            with conn.cursor() as cur:
                yield PgRepository(cur)

    return provider


def make_handlers(rt: Runtime) -> Dict[JobType, Callable[[ClaimedJob], Any]]:
    """Idempotent handlers. Payloads carry identifiers only; results carry counts only."""
    from connectors.crossref import CrossrefConnector
    from connectors.eurlex import EurLexConnector
    from connectors.kvkk import KvkkConnector
    from connectors.mevzuat import LawMeta, MevzuatConnector
    from connectors.openalex import OpenAlexConnector
    from connectors.rekabet import RekabetConnector
    from connectors.resmi_gazete import ResmiGazeteConnector, amending_entries

    from . import discovery

    def ingest_fetch(job: ClaimedJob) -> Dict[str, Any]:
        p = job.payload
        source = str(p.get("source", ""))
        with rt.repo_provider() as repo:
            group = discovery.is_discovery_or_court(p)
            if group == "aym":
                return discovery.aym_job(rt.fetcher, repo, p)
            if group == "court":
                return discovery.court_job(rt.fetcher, repo, p)
            if group == "kvkk_list":
                return discovery.kvkk_list_job(rt.fetcher, repo, p)
            if group == "rekabet_list":
                return discovery.rekabet_list_job(rt.fetcher, repo, p)
            if source == "kvkk":
                out = KvkkConnector(rt.fetcher).fetch_decision(str(p["url"]), repo)
                return {"recordId": out.record_id, "created": out.created}
            if source == "rekabet":
                out = RekabetConnector(rt.fetcher).fetch_decision(str(p["url"]), repo, p.get("pdfUrl"))
                return {"recordId": out.record_id, "created": out.created}
            if source == "openalex":
                out = OpenAlexConnector(rt.fetcher).fetch_by_doi(str(p["doi"]), repo)
                return {"recordId": out.record_id, "created": out.created}
            if source == "crossref":
                out = CrossrefConnector(rt.fetcher).fetch_by_doi(str(p["doi"]), repo)
                return {"recordId": out.record_id, "created": out.created}
            if source == "eurlex":
                out = EurLexConnector(rt.fetcher).fetch_act(str(p["celex"]), repo)
                return {"recordId": out.record_id, "created": out.created}
            if source == "mevzuat":
                no = str(p["kanunNo"])
                meta = LawMeta(no, str(p.get("title") or f"{no} sayılı Kanun"), int(p.get("tur", 1)), int(p.get("tertip", 5)))
                snap = date.fromisoformat(str(p.get("snapshotDate") or p.get("rgDate")))
                outs = MevzuatConnector(rt.fetcher).fetch_law(meta, repo, snap)
                return {"records": len(outs), "created": sum(1 for o in outs if o.created)}
        raise ValueError("unknown ingest source")

    def rg_daily(job: ClaimedJob) -> Dict[str, Any]:
        d = date.fromisoformat(str(job.payload.get("date") or rt.fetcher.clock.utcnow().date().isoformat()))
        issue, _ = ResmiGazeteConnector(rt.fetcher).fetch_issue(d)
        queued = 0
        with rt.repo_provider() as repo:
            for entry in amending_entries(issue):
                for no in entry.law_numbers:
                    repo.enqueue(
                        JobType.INGEST_FETCH,
                        {"source": "mevzuat", "kanunNo": no, "rgDate": d.isoformat()},
                        f"mevzuat:{no}:{d.isoformat()}",
                    )
                    queued += 1
        return {"entries": len(issue.entries), "mevzuatQueued": queued}

    return {JobType.INGEST_FETCH: ingest_fetch, JobType.MEVZUAT_RG_DAILY: rg_daily}
