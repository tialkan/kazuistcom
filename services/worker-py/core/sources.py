"""Source registry read from docs/kaynaklar/<kaynak>.md YAML front matter.

The same files are the SSRF allow list (plan 5.6/5) and carry the approval state (plan 6.2/1).
A source runs only when its kill switch is on (default off) and, in production, Tarik approved it.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Mapping, Optional

import yaml

from .errors import SourceDisabled

USER_AGENT = "KazuistBot/1.0 (+https://kazuist.com/bot)"
DEFAULT_DOCS_DIR = Path(__file__).resolve().parents[3] / "docs" / "kaynaklar"
_FRONT = re.compile(r"\A---\n(.*?)\n---\n", re.S)


@dataclass(frozen=True)
class SourceConfig:
    name: str
    hosts: List[str]
    rps: float = 0.5
    license_basis: str = ""
    protocol_status: str = "gerekmez"
    approved: bool = False
    robots_hosts: List[str] = field(default_factory=list)

    @property
    def env_switch(self) -> str:
        return "KAZUIST_SOURCE_" + self.name.upper().replace("-", "_")


def load_source_file(path: Path) -> SourceConfig:
    text = path.read_text(encoding="utf-8")
    match = _FRONT.match(text)
    if not match:
        raise ValueError(f"{path.name}: missing YAML front matter")
    meta = yaml.safe_load(match.group(1)) or {}
    hosts = [str(h).lower() for h in meta.get("alan_adlari", [])]
    if not hosts:
        raise ValueError(f"{path.name}: alan_adlari is empty")
    return SourceConfig(
        name=str(meta["kaynak"]),
        hosts=hosts,
        rps=float(meta.get("hiz_rps", 0.5)),
        license_basis=str(meta.get("lisans_dayanagi", "")),
        protocol_status=str(meta.get("protokol_durumu", "gerekmez")),
        approved=str(meta.get("tarik_onayi", "bekliyor")).strip().lower() == "onaylandi",
        robots_hosts=[str(h).lower() for h in meta.get("robots_alan_adlari", hosts)],
    )


class SourceRegistry:
    def __init__(self, sources: List[SourceConfig], env: Optional[Mapping[str, str]] = None):
        self._sources: Dict[str, SourceConfig] = {s.name: s for s in sources}
        self._env = env if env is not None else os.environ
        self._tripped: Dict[str, str] = {}

    @classmethod
    def load(cls, docs_dir: Optional[Path] = None, env: Optional[Mapping[str, str]] = None) -> "SourceRegistry":
        directory = docs_dir or DEFAULT_DOCS_DIR
        files = sorted(p for p in directory.glob("*.md") if p.name != "README.md")
        return cls([load_source_file(p) for p in files], env)

    def names(self) -> List[str]:
        return sorted(self._sources)

    def get(self, name: str) -> SourceConfig:
        try:
            return self._sources[name]
        except KeyError as exc:
            raise SourceDisabled("unknown source") from exc

    def all_hosts(self) -> List[str]:
        return sorted({h for s in self._sources.values() for h in s.hosts})

    def switch_on(self, name: str) -> bool:
        return self._env.get(self.get(name).env_switch, "off").strip().lower() in ("on", "1", "true")

    def check_enabled(self, name: str) -> SourceConfig:
        cfg = self.get(name)
        if name in self._tripped:
            raise SourceDisabled("source stopped by breaker")
        if not self.switch_on(name):
            raise SourceDisabled("source switch is off")
        if self._env.get("KAZUIST_ENV", "development") == "production" and not cfg.approved:
            raise SourceDisabled("source is not approved for production")
        return cfg

    def is_enabled(self, name: str) -> bool:
        try:
            self.check_enabled(name)
            return True
        except SourceDisabled:
            return False

    def trip(self, name: str, reason: str) -> None:
        self._tripped[name] = reason

    def untrip(self, name: str) -> None:
        self._tripped.pop(name, None)

    def status(self) -> List[dict]:
        return [
            {
                "source": n,
                "switch": self.switch_on(n),
                "approved": self._sources[n].approved,
                "tripped": self._tripped.get(n),
                "enabled": self.is_enabled(n),
            }
            for n in self.names()
        ]
