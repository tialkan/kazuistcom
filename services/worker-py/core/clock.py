"""Injectable clock so rate limit and retry tests run without real waiting."""

from __future__ import annotations

import time
from datetime import datetime, timezone


class Clock:
    def monotonic(self) -> float:
        return time.monotonic()

    def sleep(self, seconds: float) -> None:
        if seconds > 0:
            time.sleep(seconds)

    def utcnow(self) -> datetime:
        return datetime.now(timezone.utc)


class FakeClock(Clock):
    """Deterministic clock: sleep advances time and is recorded."""

    def __init__(self, start: float = 1000.0):
        self._t = start
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self._t

    def sleep(self, seconds: float) -> None:
        if seconds > 0:
            self.sleeps.append(seconds)
            self._t += seconds

    def utcnow(self) -> datetime:
        return datetime(2026, 10, 19, 3, 0, 0, tzinfo=timezone.utc)
