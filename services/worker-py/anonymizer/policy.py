"""Loads policy.yaml (plan Ek E)."""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

import yaml

POLICY_PATH = Path(__file__).with_name("policy.yaml")


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

    def open_sources(self) -> List[str]:
        for r in self.rules:
            if r.get("action") == "source_dependent":
                return list(r.get("open_sources", []))
        return []

    def mask_for(self, entity: str) -> str:
        return self.masks.get(entity, f"[{entity}]")


def load_policy(path: Path = POLICY_PATH) -> Policy:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return Policy(
        version=str(data["policy_version"]),
        review_threshold=float(data["review_threshold"]),
        masks=dict(data["masks"]),
        rules=list(data["rules"]),
    )


@lru_cache(maxsize=1)
def default_policy() -> Policy:
    return load_policy()
