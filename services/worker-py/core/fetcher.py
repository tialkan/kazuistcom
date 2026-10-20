"""Shared fetcher: every connector goes through it (plan 6.2).

Order of checks for each request: source switch and approval, breaker, SSRF allow list, robots.txt, rate limit.
Redirects are followed by hand and every hop is validated again. Only the transport touches the network.
"""

from __future__ import annotations

import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Mapping, Optional, Protocol
from urllib.parse import urljoin, urlsplit

from .breaker import ErrorRateBreaker
from .clock import Clock
from .errors import BreakerOpen, FetchError, HttpError
from .ratelimit import RateLimiter, parse_retry_after
from .robots import RobotsPolicy
from .sources import USER_AGENT, SourceRegistry
from .ssrf import Resolver, validate_url
from .storage import RawArchive, RawDocument

MAX_REDIRECTS = 3
MAX_429_RETRIES = 2
MAX_BODY_BYTES = 50 * 1024 * 1024


@dataclass
class Response:
    status: int
    headers: Dict[str, str]
    body: bytes
    url: str


class Transport(Protocol):
    def get(self, url: str, headers: Mapping[str, str], timeout: float) -> Response: ...


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # type: ignore[override]
        return None


class UrllibTransport:
    """Real network transport. Not used by tests."""

    def __init__(self) -> None:
        self._opener = urllib.request.build_opener(_NoRedirect)

    def get(self, url: str, headers: Mapping[str, str], timeout: float) -> Response:
        req = urllib.request.Request(url, headers=dict(headers), method="GET")
        try:
            with self._opener.open(req, timeout=timeout) as resp:
                body = resp.read(MAX_BODY_BYTES + 1)
                if len(body) > MAX_BODY_BYTES:
                    raise FetchError("response too large")
                return Response(resp.status, {k.lower(): v for k, v in resp.headers.items()}, body, url)
        except urllib.error.HTTPError as err:
            return Response(err.code, {k.lower(): v for k, v in err.headers.items()}, err.read(65536), url)


@dataclass
class FetchResult:
    source: str
    url: str
    final_url: str
    status: int
    headers: Dict[str, str]
    body: bytes
    fetched_at: datetime
    raw: Optional[RawDocument] = None

    @property
    def content_type(self) -> Optional[str]:
        return self.headers.get("content-type")


@dataclass
class Fetcher:
    registry: SourceRegistry
    transport: Transport
    archive: Optional[RawArchive] = None
    clock: Clock = field(default_factory=Clock)
    resolver: Optional[Resolver] = None
    timeout: float = 30.0
    limiter: RateLimiter = field(init=False)
    breaker: ErrorRateBreaker = field(init=False)
    robots: RobotsPolicy = field(default_factory=RobotsPolicy)
    alerts: list = field(default_factory=list)
    requests_made: Dict[str, int] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.limiter = RateLimiter(self.clock)
        for name in self.registry.names():
            self.limiter.configure(name, self.registry.get(name).rps)
        self.breaker = ErrorRateBreaker(on_trip=self._on_trip)

    def _on_trip(self, source: str, rate: float) -> None:
        self.registry.trip(source, f"error rate {rate:.2f}")
        self.alerts.append({"source": source, "error_rate": rate})

    def report_parse_failure(self, source: str) -> None:
        """Connectors call this when a document does not match the expected layout."""
        self.breaker.record(source, False)

    # -- internals -----------------------------------------------------------------------------------------
    def _request(self, source: str, url: str, headers: Mapping[str, str]) -> Response:
        """One validated, rate limited hop sequence with manual redirects."""
        cfg = self.registry.get(source)
        current = url
        for _ in range(MAX_REDIRECTS + 1):
            parts = urlsplit(current)
            if parts.scheme == "http" and (parts.hostname or "").lower() in cfg.hosts:
                current = current.replace("http://", "https://", 1)  # upgrade only for allow-listed hosts
            current = validate_url(current, cfg.hosts, self.resolver)
            self.limiter.acquire(source)
            self.requests_made[source] = self.requests_made.get(source, 0) + 1
            resp = self.transport.get(current, headers, self.timeout)
            if resp.status in (301, 302, 303, 307, 308):
                location = resp.headers.get("location")
                if not location:
                    raise HttpError(resp.status, current)
                current = urljoin(current, location)
                continue
            resp.url = current
            return resp
        raise FetchError("too many redirects")

    def _ensure_robots(self, source: str, url: str) -> None:
        cfg = self.registry.get(source)
        host = (urlsplit(url).hostname or "").lower()
        if self.robots.has(host, self.clock.monotonic()):
            return
        robots_url = f"https://{host}/robots.txt"
        try:
            validate_url(robots_url, cfg.hosts, self.resolver)
            resp = self._request(source, robots_url, {"User-Agent": USER_AGENT})
            self.robots.load(host, resp.status, resp.body, self.clock.monotonic())
        except HttpError:
            self.robots.load(host, 599, b"", self.clock.monotonic())
        except FetchError:
            raise
        except Exception:  # noqa: BLE001 - network failure: robots unknown
            self.breaker.record(source, False)
            self.robots.load(host, None, b"", self.clock.monotonic())

    # -- public --------------------------------------------------------------------------------------------
    def fetch(
        self,
        source: str,
        url: str,
        *,
        external_id: Optional[str] = None,
        headers: Optional[Mapping[str, str]] = None,
        store: bool = True,
    ) -> FetchResult:
        self.registry.check_enabled(source)
        if self.breaker.is_open(source):
            raise BreakerOpen("breaker open")
        cfg = self.registry.get(source)
        url = validate_url(url, cfg.hosts, self.resolver)
        self._ensure_robots(source, url)
        self.robots.check((urlsplit(url).hostname or "").lower(), url)

        req_headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "identity", **(headers or {})}
        resp: Optional[Response] = None
        for attempt in range(MAX_429_RETRIES + 1):
            try:
                resp = self._request(source, url, req_headers)
            except FetchError:
                raise
            except Exception:  # noqa: BLE001 - network error class only
                self.breaker.record(source, False)
                raise
            if resp.status == 429:
                wait = parse_retry_after(resp.headers, resp.body)
                self.limiter.penalize(source, wait)
                self.breaker.record(source, False)
                if attempt == MAX_429_RETRIES:
                    raise HttpError(429, url)
                continue
            break
        assert resp is not None
        if resp.status >= 400:
            self.breaker.record(source, resp.status < 500 and resp.status not in (403, 429))
            raise HttpError(resp.status, url)
        self.breaker.record(source, True)
        fetched_at = self.clock.utcnow()
        result = FetchResult(source, url, resp.url, resp.status, resp.headers, resp.body, fetched_at)
        if store and self.archive is not None:
            result.raw = self.archive.save(
                source, external_id or resp.url, resp.url, resp.body, result.content_type, fetched_at
            )
        return result
