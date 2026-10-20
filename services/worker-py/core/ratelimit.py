"""Per source rate limiter. Default 0.5 requests per second (plan 6.2/3); 429 honours Retry-After."""

from __future__ import annotations

import email.utils
import json
from datetime import datetime, timezone
from typing import Dict, Mapping, Optional

from .clock import Clock

DEFAULT_RPS = 0.5
MAX_RETRY_AFTER = 900.0


class RateLimiter:
    def __init__(self, clock: Optional[Clock] = None):
        self.clock = clock or Clock()
        self._next: Dict[str, float] = {}
        self._interval: Dict[str, float] = {}

    def configure(self, source: str, rps: float = DEFAULT_RPS) -> None:
        if rps <= 0:
            raise ValueError("rps must be positive")
        self._interval[source] = 1.0 / rps

    def acquire(self, source: str) -> float:
        """Block until the next request slot; returns the seconds waited."""
        interval = self._interval.get(source, 1.0 / DEFAULT_RPS)
        now = self.clock.monotonic()
        slot = max(now, self._next.get(source, now))
        wait = slot - now
        if wait > 0:
            self.clock.sleep(wait)
        self._next[source] = slot + interval
        return wait

    def penalize(self, source: str, seconds: float) -> None:
        """After a 429: no request to this source before now + seconds."""
        seconds = min(max(seconds, 0.0), MAX_RETRY_AFTER)
        until = self.clock.monotonic() + seconds
        self._next[source] = max(self._next.get(source, 0.0), until)


def parse_retry_after(headers: Mapping[str, str], body: bytes = b"", now: Optional[datetime] = None) -> float:
    """Seconds to wait from a Retry-After header (seconds or HTTP date) or a JSON body field retry_after."""
    lowered = {k.lower(): v for k, v in headers.items()}
    value = lowered.get("retry-after")
    if value:
        value = value.strip()
        if value.isdigit():
            return float(value)
        try:
            parsed = email.utils.parsedate_to_datetime(value)
        except (TypeError, ValueError):
            parsed = None
        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            current = now or datetime.now(timezone.utc)
            return max(0.0, (parsed - current).total_seconds())
    if body:
        try:
            data = json.loads(body[:4096])
            if isinstance(data, dict) and isinstance(data.get("retry_after"), (int, float)):
                return float(data["retry_after"])
        except (ValueError, UnicodeDecodeError):
            pass
    return 30.0
