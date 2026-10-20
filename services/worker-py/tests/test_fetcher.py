from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from helpers import ALL_ON, NO_ROBOTS, build_fetcher, ok
from core.errors import BreakerOpen, HttpError, RobotsDisallowed, SourceDisabled, SsrfError
from core.fetcher import Response
from core.ratelimit import RateLimiter, parse_retry_after
from core.robots import RobotsRules
from core.sources import SourceRegistry
from core.ssrf import validate_url

KVKK_HOSTS = ["www.kvkk.gov.tr"]


# --- SSRF -------------------------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "url",
    [
        "http://www.kvkk.gov.tr/x",
        "https://evil.example.com/x",
        "https://www.kvkk.gov.tr.evil.com/x",
        "https://user:pw@www.kvkk.gov.tr/x",
        "https://www.kvkk.gov.tr@evil.com/x",
        "https://www.kvkk.gov.tr:8443/x",
        "https://127.0.0.1/x",
        "https://[::1]/x",
        "https://169.254.169.254/latest/meta-data",
        "file:///etc/passwd",
        "gopher://www.kvkk.gov.tr/",
        "https:///nohost",
    ],
)
def test_ssrf_rejects(url: str) -> None:
    with pytest.raises(SsrfError):
        validate_url(url, KVKK_HOSTS)


def test_ssrf_accepts_allowlisted_host() -> None:
    assert validate_url("https://WWW.KVKK.gov.tr/Icerik/1", KVKK_HOSTS).endswith("/Icerik/1")


@pytest.mark.parametrize("addr", ["10.0.0.5", "127.0.0.1", "169.254.169.254", "192.168.1.1", "::1", "fd00::1"])
def test_ssrf_rejects_private_resolution(addr: str) -> None:
    with pytest.raises(SsrfError):
        validate_url("https://www.kvkk.gov.tr/x", KVKK_HOSTS, resolver=lambda h: [addr])


def test_ssrf_rejects_mixed_resolution() -> None:
    with pytest.raises(SsrfError):
        validate_url("https://www.kvkk.gov.tr/x", KVKK_HOSTS, resolver=lambda h: ["93.184.216.34", "10.0.0.1"])


def test_fetcher_refuses_offlist_host_without_request(tmp_path: Path, clock) -> None:
    fetcher, transport = build_fetcher({}, tmp_path, clock)
    with pytest.raises(SsrfError):
        fetcher.fetch("kvkk", "https://evil.example.com/x")
    assert transport.calls == []


def test_redirect_to_offlist_host_is_refused(tmp_path: Path, clock) -> None:
    routes = {
        "https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS,
        "https://www.kvkk.gov.tr/a": Response(302, {"location": "https://evil.example.com/steal"}, b"", ""),
    }
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    with pytest.raises(SsrfError):
        fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/a")
    assert all("evil.example.com" not in u for u, _ in transport.calls)


def test_redirect_to_private_ip_literal_is_refused(tmp_path: Path, clock) -> None:
    routes = {
        "https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS,
        "https://www.kvkk.gov.tr/a": Response(302, {"location": "https://169.254.169.254/"}, b"", ""),
    }
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    with pytest.raises(SsrfError):
        fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/a")


# --- kill switch and approval ------------------------------------------------------------------------------
def test_source_default_off(tmp_path: Path, clock) -> None:
    fetcher, transport = build_fetcher({}, tmp_path, clock, env={})
    with pytest.raises(SourceDisabled):
        fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/x")
    assert transport.calls == []


def test_production_needs_tarik_approval() -> None:
    env = dict(ALL_ON, KAZUIST_ENV="production")
    reg = SourceRegistry.load(env=env)
    for name in reg.names():
        assert not reg.is_enabled(name), name  # every source file says tarik_onayi: bekliyor
    assert SourceRegistry.load(env=dict(ALL_ON)).is_enabled("kvkk")


def test_all_sources_documented_and_pending() -> None:
    reg = SourceRegistry.load(env={})
    assert reg.names() == ["crossref", "eurlex", "kvkk", "mevzuat", "openalex", "rekabet", "resmi-gazete"]
    assert all(not reg.get(n).approved for n in reg.names())
    assert all(reg.get(n).license_basis for n in reg.names())


# --- robots -----------------------------------------------------------------------------------------------
def test_robots_disallow_blocks_fetch(tmp_path: Path, clock) -> None:
    robots = ok(b"User-agent: *\nDisallow: /Icerik/\n", "text/plain")
    routes = {"https://www.kvkk.gov.tr/robots.txt": robots, "https://www.kvkk.gov.tr/Icerik/1": ok(b"x")}
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    with pytest.raises(RobotsDisallowed):
        fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/Icerik/1")
    assert [u for u, _ in transport.calls] == ["https://www.kvkk.gov.tr/robots.txt"]


def test_robots_specific_agent_group_and_wildcards() -> None:
    rules = RobotsRules.parse(
        "User-agent: *\nDisallow: /private\nAllow: /private/open$\nDisallow: /*/basket\n\n"
        "User-agent: KazuistBot\nDisallow: /nobot/\n"
    )
    assert not rules.allowed("/nobot/x")
    assert rules.allowed("/private/anything")  # specific KazuistBot group replaces the * group
    star = RobotsRules.parse("User-agent: *\nDisallow: /private\nAllow: /private/open$\nDisallow: /*/basket\n")
    assert not star.allowed("/private/x")
    assert star.allowed("/private/open")
    assert not star.allowed("/en/basket")


def test_robots_googlebot_only_group_does_not_block_us() -> None:
    rules = RobotsRules.parse("User-agent: Googlebot\nNoindex:/a.pdf\nDisallow: /\n")
    assert rules.allowed("/anything")


def test_robots_html_body_means_no_restrictions(tmp_path: Path, clock) -> None:
    routes = {
        "https://www.kvkk.gov.tr/robots.txt": ok(b"<!doctype html><html><body>Disallow</body></html>"),
        "https://www.kvkk.gov.tr/x": ok(b"data"),
    }
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    assert fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/x").body == b"data"


def test_robots_server_error_denies(tmp_path: Path, clock) -> None:
    routes = {"https://www.kvkk.gov.tr/robots.txt": Response(503, {}, b"", ""), "https://www.kvkk.gov.tr/x": ok(b"d")}
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    with pytest.raises(RobotsDisallowed):
        fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/x")
    assert len(transport.calls) == 1


# --- rate limit ---------------------------------------------------------------------------------------------
def test_default_rate_is_half_request_per_second(clock) -> None:
    limiter = RateLimiter(clock)
    limiter.configure("s", 0.5)
    waits = [limiter.acquire("s") for _ in range(4)]
    assert waits == [0.0, 2.0, 2.0, 2.0]
    assert clock.sleeps == [2.0, 2.0, 2.0]


def test_rate_limit_is_per_source(clock) -> None:
    limiter = RateLimiter(clock)
    limiter.configure("a", 0.5)
    limiter.configure("b", 0.5)
    assert limiter.acquire("a") == 0.0
    assert limiter.acquire("b") == 0.0


def test_fetcher_spaces_requests_two_seconds(tmp_path: Path, clock) -> None:
    routes = {"https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS, "https://www.kvkk.gov.tr/a": ok(b"a"),
              "https://www.kvkk.gov.tr/b": ok(b"b")}
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/a")
    fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/b")
    assert clock.sleeps == [2.0, 2.0]  # robots, then a, then b: three requests, two waits


def test_retry_after_header_forms() -> None:
    assert parse_retry_after({"Retry-After": "7"}) == 7.0
    assert parse_retry_after({}, b'{"retry_after": 12}') == 12.0
    assert parse_retry_after({}, b"") == 30.0


def test_429_waits_retry_after_then_succeeds(tmp_path: Path, clock) -> None:
    routes = {
        "https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS,
        "https://www.kvkk.gov.tr/a": [Response(429, {"retry-after": "11"}, b"", ""), ok(b"fine")],
    }
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    result = fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/a")
    assert result.body == b"fine"
    assert max(clock.sleeps) >= 11.0
    assert sum(1 for u, _ in transport.calls if u.endswith("/a")) == 2


def test_429_gives_up_after_retries(tmp_path: Path, clock) -> None:
    routes = {
        "https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS,
        "https://www.kvkk.gov.tr/a": Response(429, {"retry-after": "1"}, b"", ""),
    }
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    with pytest.raises(HttpError) as exc:
        fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/a")
    assert exc.value.status == 429


# --- archive and breaker -----------------------------------------------------------------------------------
def test_raw_document_stored_with_sha256_and_metadata(tmp_path: Path, clock) -> None:
    body = b"<html>raw</html>"
    routes = {"https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS, "https://www.kvkk.gov.tr/a": ok(body)}
    fetcher, transport = build_fetcher(routes, tmp_path, clock)
    result = fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/a", external_id="kvkk:a")
    digest = hashlib.sha256(body).hexdigest()
    assert result.raw is not None
    assert result.raw.sha256 == digest
    assert result.raw.object_key == f"raw/kvkk/{digest[:2]}/{digest}"
    assert result.raw.url == "https://www.kvkk.gov.tr/a"
    assert result.raw.fetched_at == result.fetched_at
    assert (tmp_path / "raw" / result.raw.object_key).read_bytes() == body
    ua = transport.calls[-1][1]["User-Agent"]
    assert ua == "KazuistBot/1.0 (+https://kazuist.com/bot)"


def test_breaker_stops_source_and_alerts(tmp_path: Path, clock) -> None:
    routes = {"https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS}
    for i in range(12):
        routes[f"https://www.kvkk.gov.tr/e{i}"] = Response(500, {}, b"", "")
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    for i in range(12):
        try:
            fetcher.fetch("kvkk", f"https://www.kvkk.gov.tr/e{i}")
        except (HttpError, SourceDisabled, BreakerOpen):
            pass
    assert fetcher.breaker.is_open("kvkk")
    assert fetcher.alerts and fetcher.alerts[0]["source"] == "kvkk"
    with pytest.raises(SourceDisabled):
        fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/e0")
    assert not fetcher.registry.is_enabled("kvkk")


def test_breaker_stays_closed_on_healthy_traffic(tmp_path: Path, clock) -> None:
    routes = {"https://www.kvkk.gov.tr/robots.txt": NO_ROBOTS}
    for i in range(15):
        routes[f"https://www.kvkk.gov.tr/ok{i}"] = ok(b"x")
    routes["https://www.kvkk.gov.tr/bad"] = Response(500, {}, b"", "")
    fetcher, _ = build_fetcher(routes, tmp_path, clock)
    for i in range(15):
        fetcher.fetch("kvkk", f"https://www.kvkk.gov.tr/ok{i}", store=False)
    with pytest.raises(HttpError):
        fetcher.fetch("kvkk", "https://www.kvkk.gov.tr/bad")
    assert not fetcher.breaker.is_open("kvkk")
