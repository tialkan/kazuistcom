from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Mapping, Optional, Tuple

from core.clock import FakeClock
from core.fetcher import Fetcher, Response
from core.sources import SourceRegistry
from core.storage import LocalObjectStore, RawArchive

FIX = Path(__file__).resolve().parent / "fixtures"
ALL_ON = {
    f"KAZUIST_SOURCE_{n}": "on"
    for n in ("MEVZUAT", "RESMI_GAZETE", "KVKK", "REKABET", "OPENALEX", "CROSSREF", "EURLEX")
}


def fixture_bytes(rel: str) -> bytes:
    return (FIX / rel).read_bytes()


class FakeTransport:
    """Offline transport: maps URL to a response or a list of responses served in order."""

    def __init__(self, routes: Optional[Dict[str, object]] = None):
        self.routes: Dict[str, object] = routes or {}
        self.calls: List[Tuple[str, Dict[str, str]]] = []

    def get(self, url: str, headers: Mapping[str, str], timeout: float) -> Response:
        self.calls.append((url, dict(headers)))
        route = self.routes.get(url)
        if route is None:
            return Response(404, {}, b"not found", url)
        if isinstance(route, list):
            item = route.pop(0) if len(route) > 1 else route[0]
        else:
            item = route
        return item  # type: ignore[return-value]


def ok(body: bytes, ctype: str = "text/html") -> Response:
    return Response(200, {"content-type": ctype}, body, "")


def make_pdf(lines: List[str]) -> bytes:
    """Minimal single page PDF with a text layer (ASCII only), generated in the test."""
    stream = "BT /F1 12 Tf 50 750 Td " + " T* ".join(f"({ln}) Tj" for ln in lines) + " ET"
    stream = "BT /F1 12 Tf 14 TL 50 750 Td " + " T* ".join(f"({ln}) Tj" for ln in lines) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        "/Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


def public_resolver(host: str) -> List[str]:
    return ["93.184.216.34"]


def build_fetcher(routes: Dict[str, object], tmp_path: Path, clock: FakeClock, env: Optional[dict] = None):
    registry = SourceRegistry.load(env=env if env is not None else dict(ALL_ON))
    transport = FakeTransport(routes)
    fetcher = Fetcher(
        registry, transport, RawArchive(LocalObjectStore(tmp_path / "raw")), clock=clock, resolver=public_resolver
    )
    return fetcher, transport


NO_ROBOTS = Response(404, {}, b"", "")
