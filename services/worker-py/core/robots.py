"""robots.txt check (plan 6.2/2). If robots.txt forbids the path, no automatic fetch happens.

Reading rules (RFC 9309): 2xx robots.txt is parsed; 4xx, or a non robots body (an HTML error or home page
served in its place), means no restrictions; 5xx and network failures mean unknown, which we treat as denied.
Matching follows RFC 9309: the most specific (longest) rule wins, Allow wins ties, '*' and '$' are wildcards.
Python's urllib.robotparser does not support wildcards, so a small parser lives here.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlsplit

from .errors import RobotsDisallowed
from .sources import USER_AGENT

PRODUCT_TOKEN = "kazuistbot"
_CACHE_SECONDS = 3600.0

Rule = Tuple[bool, "re.Pattern[str]", int]  # allow, pattern, specificity


def looks_like_robots(body: bytes) -> bool:
    head = body[:2048].decode("utf-8", errors="replace").lower()
    if "<html" in head or "<!doctype" in head:
        return False
    return any(k in head for k in ("user-agent", "disallow", "allow", "sitemap"))


def _compile(path: str) -> "re.Pattern[str]":
    anchored = path.endswith("$")
    core = path[:-1] if anchored else path
    pattern = ".*".join(re.escape(part) for part in core.split("*"))
    return re.compile("^" + pattern + ("$" if anchored else ""))


class RobotsRules:
    def __init__(self, rules: List[Rule]):
        self.rules = rules

    @classmethod
    def parse(cls, text: str) -> "RobotsRules":
        groups: List[Tuple[List[str], List[Rule]]] = []
        agents: List[str] = []
        rules: List[Rule] = []
        in_rules = False
        for raw in text.splitlines():
            line = raw.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            field, value = (s.strip() for s in line.split(":", 1))
            field = field.lower()
            if field == "user-agent":
                if in_rules:
                    groups.append((agents, rules))
                    agents, rules, in_rules = [], [], False
                agents.append(value.lower())
            elif field in ("allow", "disallow"):
                in_rules = True
                if value:  # empty Disallow means allow everything: no rule needed
                    rules.append((field == "allow", _compile(value), len(value)))
        if agents:
            groups.append((agents, rules))
        specific = [g for g in groups if any(PRODUCT_TOKEN in a for a in g[0])]
        chosen = specific or [g for g in groups if "*" in g[0]]
        merged: List[Rule] = [r for _, rs in chosen for r in rs]
        return cls(merged)

    def allowed(self, path_and_query: str) -> bool:
        best: Optional[Rule] = None
        for rule in self.rules:
            if rule[1].match(path_and_query):
                if best is None or rule[2] > best[2] or (rule[2] == best[2] and rule[0]):
                    best = rule
        return True if best is None else best[0]


class RobotsPolicy:
    def __init__(self) -> None:
        self._rules: Dict[str, Tuple[float, Optional[RobotsRules]]] = {}

    def load(self, host: str, status: Optional[int], body: bytes, now: float) -> None:
        """status None means a network failure."""
        rules: Optional[RobotsRules]
        if status is None or status >= 500:
            rules = None  # unknown: deny
        elif 200 <= status < 300 and looks_like_robots(body):
            rules = RobotsRules.parse(body.decode("utf-8", errors="replace"))
        else:
            rules = RobotsRules([])  # absent or not a robots file: allow all
        self._rules[host] = (now, rules)

    def has(self, host: str, now: float) -> bool:
        entry = self._rules.get(host)
        return entry is not None and now - entry[0] < _CACHE_SECONDS

    def check(self, host: str, url: str) -> None:
        entry = self._rules.get(host)
        if entry is None or entry[1] is None:
            raise RobotsDisallowed("robots.txt unavailable, fetch refused")
        parts = urlsplit(url)
        target = parts.path or "/"
        if parts.query:
            target += "?" + parts.query
        if not entry[1].allowed(target):
            raise RobotsDisallowed("robots.txt disallows this path")


__all__ = ["RobotsPolicy", "RobotsRules", "looks_like_robots", "USER_AGENT"]
