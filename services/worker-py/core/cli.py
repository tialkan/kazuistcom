"""Operator commands: python -m core.cli sources | probe <source>.

probe runs a SMALL, polite live check of one source through the real fetcher (switch, SSRF list, robots.txt,
rate limit, challenge stop all apply): a few list rows, one document parsed into a record. Nothing is written
to the database; the raw archive goes to a temporary directory. It is how the sample sizes and error rates in
docs/kaynaklar/ are recorded. It never runs for a source whose file says robots.txt forbids, and a CAPTCHA
answer ends it at once with the source stopped.

The probe switches the one source on for this process only; Tarik approval is a production rule and is not
touched here.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from contextlib import suppress
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional

from .clock import Clock
from .errors import FetchError, ParseError
from .fetcher import Fetcher, Transport, UrllibTransport
from .pipeline import InMemoryRepository
from .sources import SourceRegistry
from .ssrf import Resolver, system_resolver
from .storage import LocalObjectStore, RawArchive


def _probe_aym(f: Fetcher, repo: InMemoryRepository) -> Dict[str, Any]:
    from connectors import aym

    conn = aym.AymConnector(f)
    out: Dict[str, Any] = {}
    for tipi in (aym.BB, aym.ND):
        page = conn.list_page(tipi, 1, size=5)
        out[tipi] = {"total": page.total, "rows": len(page.items), "merits": sum(i.is_merits for i in page.items)}
        pick = next((i for i in page.items if i.is_merits), None)
        if pick:
            conn.fetch_decision(tipi, pick.id, repo)
    return out


def _probe_court(module: Any, connector: Any, unit: str) -> Callable[[Fetcher, InMemoryRepository], Dict[str, Any]]:
    def run(f: Fetcher, repo: InMemoryRepository) -> Dict[str, Any]:
        conn = connector(f)
        year = date.today().year - 1
        page = conn.list_page(unit, year, 1)
        out = {"unit": unit, "year": year, "total": page.total, "rows": len(page.items)}
        first = next((i for i in page.items if i.key and i.decision_date), None)
        if first:
            conn.fetch_decision(first, repo)
        return out

    return run


def _probe_kvkk(f: Fetcher, repo: InMemoryRepository) -> Dict[str, Any]:
    from connectors.kvkk import KvkkConnector

    conn = KvkkConnector(f)
    entries, has_next = conn.list_page_full(1)
    conn.fetch_decision(entries[0].url, repo)
    return {"rows": len(entries), "next": has_next}


def _probe_rekabet(f: Fetcher, repo: InMemoryRepository) -> Dict[str, Any]:
    from connectors.rekabet import RekabetConnector

    conn = RekabetConnector(f)
    entries = conn.list_decisions()
    conn.fetch_decision(entries[0].url, repo)
    return {"rows": len(entries)}


def _probe_rg(f: Fetcher, repo: InMemoryRepository) -> Dict[str, Any]:
    from connectors.resmi_gazete import ResmiGazeteConnector, amending_entries

    day = datetime.now(timezone.utc).date() - timedelta(days=1)
    issue, _ = ResmiGazeteConnector(f).fetch_issue(day)
    return {"date": day.isoformat(), "issue": issue.issue_number, "entries": len(issue.entries),
            "amending": len(amending_entries(issue))}  # fmt: skip


def _probe_mevzuat(f: Fetcher, repo: InMemoryRepository) -> Dict[str, Any]:
    from connectors.mevzuat import LawMeta, MevzuatConnector

    outs = MevzuatConnector(f).fetch_law(LawMeta("6698", "6698 sayılı Kişisel Verilerin Korunması Kanunu"), repo,
                                         datetime.now(timezone.utc).date())  # fmt: skip
    return {"law": "6698", "records": len(outs)}


def _probes() -> Dict[str, Callable[[Fetcher, InMemoryRepository], Dict[str, Any]]]:
    from connectors import danistay, yargitay

    return {
        "aym": _probe_aym,
        "yargitay": _probe_court(yargitay, yargitay.YargitayConnector, "Hukuk Genel Kurulu"),
        "danistay": _probe_court(danistay, danistay.DanistayConnector, "İdare Dava Daireleri Kurulu"),
        "kvkk": _probe_kvkk,
        "rekabet": _probe_rekabet,
        "resmi-gazete": _probe_rg,
        "mevzuat": _probe_mevzuat,
    }


def probe(source: str, env: Optional[Mapping[str, str]] = None, transport: Optional[Transport] = None,
          raw_dir: Optional[Path] = None, clock: Optional[Clock] = None,
          resolver: Optional[Resolver] = None) -> Dict[str, Any]:  # fmt: skip
    """Run the probe for one source and return a report (counts, request numbers, error rate, outcome)."""
    probes = _probes()
    if source not in probes:
        return {"source": source, "outcome": "unknown source"}
    base = dict(env if env is not None else os.environ)
    base.pop("KAZUIST_ENV", None)  # a probe is a development run
    registry = SourceRegistry.load(env=base)
    base[registry.get(source).env_switch] = "on"
    registry = SourceRegistry.load(env=base)
    store = raw_dir or Path(tempfile.mkdtemp(prefix="kazuist-probe-"))
    fetcher = Fetcher(registry, transport or UrllibTransport(), RawArchive(LocalObjectStore(store)),
                      clock=clock or Clock(), resolver=resolver or system_resolver, timeout=25.0)  # fmt: skip
    repo = InMemoryRepository()
    report: Dict[str, Any] = {"source": source, "at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    outcome = "ok"
    try:
        report["sample"] = probes[source](fetcher, repo)
    except (FetchError, ParseError) as exc:
        outcome = f"{type(exc).__name__}: {exc}"
    except OSError as exc:  # timeouts and connection failures of the real network
        outcome = f"{type(exc).__name__}"
    report["outcome"] = outcome
    report["requests"] = fetcher.requests_made.get(source, 0)
    report["errorRate"] = round(fetcher.breaker.error_rate(source), 3)
    report["records"] = len(repo.records)
    report["rawDocuments"] = len(repo.raws)
    report["anonQueued"] = sum(1 for j in repo.jobs if j["type"] == "anon.run")
    report["alerts"] = list(fetcher.alerts)
    with suppress(Exception):
        report["stopped"] = not fetcher.registry.is_enabled(source)
    return report


def main(argv: Optional[List[str]] = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if args[:1] == ["sources"]:
        print(json.dumps(SourceRegistry.load().status(), ensure_ascii=False, indent=1))
        return 0
    if len(args) == 2 and args[0] == "probe":
        print(json.dumps(probe(args[1]), ensure_ascii=False, indent=1))
        return 0
    print("usage: python -m core.cli sources | probe <source>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
