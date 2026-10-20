"""SSRF guard (plan 5.6/5): fetchers only reach https URLs on official hosts listed in docs/kaynaklar/."""

from __future__ import annotations

import ipaddress
import socket
from typing import Callable, Iterable, List, Optional
from urllib.parse import urlsplit

from .errors import SsrfError

Resolver = Callable[[str], List[str]]


def system_resolver(host: str) -> List[str]:
    return sorted({info[4][0] for info in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)})


def validate_url(url: str, allowed_hosts: Iterable[str], resolver: Optional[Resolver] = None) -> str:
    """Return the normalised URL or raise SsrfError. Redirect targets must be validated again."""
    allowed = {h.lower() for h in allowed_hosts}
    parts = urlsplit(url.strip())
    if parts.scheme != "https":
        raise SsrfError("scheme must be https")
    if parts.username or parts.password or "@" in parts.netloc:
        raise SsrfError("credentials in URL are not allowed")
    host = (parts.hostname or "").lower().rstrip(".")
    if not host:
        raise SsrfError("missing host")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise SsrfError("IP literal hosts are not allowed")
    try:
        port = parts.port
    except ValueError as exc:
        raise SsrfError("invalid port") from exc
    if port not in (None, 443):
        raise SsrfError("only port 443 is allowed")
    if host not in allowed:
        raise SsrfError("host is not on the official source list")
    if resolver is not None:
        addresses = resolver(host)
        if not addresses:
            raise SsrfError("host did not resolve")
        for addr in addresses:
            if not ipaddress.ip_address(addr).is_global:
                raise SsrfError("host resolves to a non-public address")
    return parts.geturl()
