"""Error rate breaker per source (plan 6.2/8): stops the source automatically and raises an alert."""

from __future__ import annotations

from collections import deque
from typing import Callable, Deque, Dict, Optional


class ErrorRateBreaker:
    def __init__(
        self,
        window: int = 20,
        min_requests: int = 10,
        threshold: float = 0.5,
        on_trip: Optional[Callable[[str, float], None]] = None,
    ):
        self.window = window
        self.min_requests = min_requests
        self.threshold = threshold
        self.on_trip = on_trip
        self._results: Dict[str, Deque[bool]] = {}
        self._open: Dict[str, float] = {}

    def record(self, source: str, ok: bool) -> None:
        results = self._results.setdefault(source, deque(maxlen=self.window))
        results.append(ok)
        if source in self._open or len(results) < self.min_requests:
            return
        rate = self.error_rate(source)
        if rate >= self.threshold:
            self._open[source] = rate
            if self.on_trip:
                self.on_trip(source, rate)

    def error_rate(self, source: str) -> float:
        results = self._results.get(source)
        if not results:
            return 0.0
        return sum(1 for r in results if not r) / len(results)

    def is_open(self, source: str) -> bool:
        return source in self._open

    def reset(self, source: str) -> None:
        self._open.pop(source, None)
        self._results.pop(source, None)

    def snapshot(self) -> Dict[str, dict]:
        return {
            s: {"error_rate": round(self.error_rate(s), 3), "open": self.is_open(s), "samples": len(r)}
            for s, r in self._results.items()
        }
