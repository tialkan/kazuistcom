#!/usr/bin/env python3
"""Checks that infra/docker-compose.prod.yml passes every KAZUIST_* variable the services read at run time.

Usage (CI, after `docker compose ... config --format json > compose.json`):
    python3 infra/scripts/compose-env-check.py compose.json

The rendered JSON is used so that the check sees what Docker sees. Locally a YAML file works as well when PyYAML is
installed. Sources of truth:
  - worker-py: env.get("KAZUIST_..."), environ.get(...), env[...] in services/worker-py (tests excluded), plus one
    kill switch per docs/kaynaklar/<kaynak>.md (core/sources.py env_switch: KAZUIST_SOURCE_<NAME>).
  - web and worker-node: env.KAZUIST_... and env['KAZUIST_...'] in apps/<app>/src and packages/*/src (tests excluded).
Only variable names are printed, never values.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Read by code but deliberately not passed in production, with the reason.
NOT_PASSED = {
    "KAZUIST_ARAMA_KAYNAGI": "test fixture source, never on a server",
    "KAZUIST_FIKSTUR_URETIMDE": "test fixture override, never on a server",
    "KAZUIST_IT_DATABASE_URL": "integration tests only",
    "KAZUIST_IT_VALKEY_URL": "integration tests only",
    "KAZUIST_LIVE_SMOKE": "live smoke test only",
    "KAZUIST_SOURCES_DIR": "fixed in the worker-py image",
    "KAZUIST_HEALTH_HOST": "image default 127.0.0.1, the healthcheck relies on it",
    "KAZUIST_HEALTH_PORT": "image default 8000, the healthcheck relies on it",
    "KAZUIST_ANTHROPIC_KEY_FILE": "ANTHROPIC_API_KEY is passed instead",
}

PY_READ = re.compile(r"\b(?:env|_env|env_map|environ)(?:\.get\(|\[)\s*[\"'](KAZUIST_[A-Z0-9_]+)[\"']")
TS_READ = re.compile(r"\benv(?:\.|\[\s*['\"])(KAZUIST_[A-Z0-9_]+)")
SOURCE_NAME = re.compile(r"^kaynak:\s*(\S+)\s*$", re.M)


def is_test(path: Path) -> bool:
    parts = set(path.parts)
    return bool(parts & {"tests", "test", "node_modules", ".venv", "_kanit"}) or ".test." in path.name


def worker_py_reads() -> set[str]:
    found: set[str] = set()
    for p in (ROOT / "services" / "worker-py").rglob("*.py"):
        if not is_test(p.relative_to(ROOT)):
            found.update(PY_READ.findall(p.read_text(encoding="utf-8")))
    for p in sorted((ROOT / "docs" / "kaynaklar").glob("*.md")):
        if p.name == "README.md":
            continue
        m = SOURCE_NAME.search(p.read_text(encoding="utf-8"))
        if m:
            found.add("KAZUIST_SOURCE_" + m.group(1).upper().replace("-", "_"))
    return found


def ts_reads(app: str) -> set[str]:
    found: set[str] = set()
    roots = [ROOT / "apps" / app / "src", *sorted((ROOT / "packages").glob("*/src"))]
    for root in roots:
        for p in root.rglob("*"):
            if p.suffix in {".ts", ".tsx", ".mts"} and not is_test(p.relative_to(ROOT)):
                found.update(TS_READ.findall(p.read_text(encoding="utf-8")))
    return found


def load(path: str) -> dict:
    text = Path(path).read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        import yaml  # local use on the raw file

        return yaml.safe_load(text)


def passed(compose: dict, service: str) -> set[str]:
    env = compose["services"][service].get("environment") or {}
    if isinstance(env, list):
        return {e.split("=", 1)[0] for e in env}
    return set(env)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    compose = load(argv[1])
    problems = 0
    for service, reads in (
        ("worker-py", worker_py_reads()),
        ("web", ts_reads("web")),
        ("worker-node", ts_reads("worker-node")),
    ):
        missing = sorted(reads - passed(compose, service) - set(NOT_PASSED))
        for name in missing:
            print(f"{service}: {name} is read by the code but not passed")
        problems += len(missing)
        print(f"{service}: {len(reads)} KAZUIST_* names read, {len(missing)} missing")
    # Kill switches must match the source files exactly: a stale switch for a removed source is an error too.
    want = {n for n in worker_py_reads() if n.startswith("KAZUIST_SOURCE_")}
    have = {n for n in passed(compose, "worker-py") if n.startswith("KAZUIST_SOURCE_")}
    for name in sorted(have - want):
        print(f"worker-py: {name} has no docs/kaynaklar file")
        problems += 1
    print(f"worker-py: {len(want)} source switches")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
