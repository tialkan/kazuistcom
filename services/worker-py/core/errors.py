"""Error types for the shared fetcher. Messages never include document content."""

from __future__ import annotations


class FetchError(Exception):
    """Base class for every fetcher refusal or failure."""


class SourceDisabled(FetchError):
    """Source switch is off, source is unknown, or Tarik approval is missing in production."""


class SsrfError(FetchError):
    """URL is not an https URL on an allow-listed official host, or resolves to a non-public address."""


class RobotsDisallowed(FetchError):
    """robots.txt forbids the path for our user agent, or robots.txt could not be read safely."""


class BreakerOpen(FetchError):
    """Error rate threshold was exceeded; the source is stopped until an operator resets it."""


class HttpError(FetchError):
    def __init__(self, status: int, url: str):
        super().__init__(f"HTTP {status}")
        self.status = status
        self.url = url


class ParseError(Exception):
    """A connector could not parse a fixture or live document in the expected layout."""
