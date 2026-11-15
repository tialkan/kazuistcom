"""Loads policy.yaml (plan Ek E)."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Dict, FrozenSet, List, Optional, Tuple

import yaml

POLICY_PATH = Path(__file__).with_name("policy.yaml")


def court_key(name: str) -> str:
    """Comparison form of a court name: NFKC, Turkish lower case, accents and dots dropped, spaces collapsed.
    "ANAYASA MAHKEMESİ", "Anayasa  Mahkemesi" and "T.C. Anayasa Mahkemesi" -> "anayasa mahkemesi" and
    "tc anayasa mahkemesi"; "AİHM" and "AIHM" -> "aihm"."""
    s = unicodedata.normalize("NFKC", name).replace("İ", "i").replace("I", "ı").lower().replace("ı", "i")
    s = "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s.replace(".", "")).strip()


def source_namespace(source_key: str) -> str:
    """records.source_key namespace: the part before the first ":" ("aym:bb:<id>" -> "aym")."""
    return source_key.split(":", 1)[0].strip().lower() if ":" in source_key else ""


@dataclass(frozen=True)
class OpenSource:
    """One entry of open_sources with what ties a record to it."""

    name: str
    courts: FrozenSet[str]
    source_keys: FrozenSet[str]


@dataclass(frozen=True)
class Policy:
    version: str
    review_threshold: float
    masks: Dict[str, str]
    rules: List[dict] = field(default_factory=list)

    def rule_for(self, entity: str, role: Optional[str] = None) -> Optional[dict]:
        for r in self.rules:
            if entity in r.get("entities", []) and (role is None or not r.get("roles") or role in r["roles"]):
                return r
        return None

    def _source_rule(self) -> Optional[dict]:
        for r in self.rules:
            if r.get("action") == "source_dependent":
                return r
        return None

    def open_sources(self) -> List[str]:
        r = self._source_rule()
        return list(r.get("open_sources", [])) if r else []

    def open_source_table(self) -> Tuple[OpenSource, ...]:
        return _open_source_table(self._source_rule())

    def open_source_for(self, court: Optional[str] = None, source_key: Optional[str] = None) -> Optional[str]:
        """The open source (an entry of open_sources) a record belongs to, by its source_key namespace or its
        court name; None when neither matches. Used for high court members (Ek E: kept only when the official
        source publishes them)."""
        namespace = source_namespace(source_key) if source_key else ""
        ckey = court_key(court) if court else ""
        for src in self.open_source_table():
            if (namespace and namespace in src.source_keys) or (ckey and ckey in src.courts):
                return src.name
        return None

    def mask_for(self, entity: str) -> str:
        return self.masks.get(entity, f"[{entity}]")


def _open_source_table(rule: Optional[dict]) -> Tuple[OpenSource, ...]:
    if not rule:
        return ()
    names = list(rule.get("open_sources", []))
    match = rule.get("open_source_match") or {}
    unknown = set(match) - set(names)
    if unknown:
        raise ValueError(f"open_source_match names not in open_sources: {sorted(unknown)}")
    out = []
    for name in names:
        entry = match.get(name) or {}
        courts = frozenset(court_key(c) for c in [name, *entry.get("courts", [])] if str(c).strip())
        keys = frozenset(str(k).strip().lower() for k in entry.get("source_keys", []) if str(k).strip())
        if any(":" in k for k in keys):
            raise ValueError(f"source_keys of {name} must be bare namespaces")
        out.append(OpenSource(name, courts, keys))
    return tuple(out)


def load_policy(path: Path = POLICY_PATH) -> Policy:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    policy = Policy(
        version=str(data["policy_version"]),
        review_threshold=float(data["review_threshold"]),
        masks=dict(data["masks"]),
        rules=list(data["rules"]),
    )
    policy.open_source_table()  # fails at load on a malformed open_source_match
    return policy


@lru_cache(maxsize=1)
def default_policy() -> Policy:
    return load_policy()
