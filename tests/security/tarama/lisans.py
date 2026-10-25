"""License gate (plan 15.1, CLAUDE.md): no AGPL or SSPL without an ADR.

Usage (from the repository root):
  pnpm licenses list --json > <dir>/pnpm-lisans.json
  python3 -I tests/security/tarama/lisans.py node <dir>/pnpm-lisans.json
  services/worker-py/.venv/bin/python -I tests/security/tarama/lisans.py python
Prints a summary per license and exits 1 when a forbidden or unknown-but-suspicious license is found.
"""

import json
import re
import sys
from collections import Counter

FORBIDDEN = re.compile(r"\b(AGPL|SSPL|Server Side Public License|Affero)\b", re.I)
WEAK_COPYLEFT = re.compile(r"\b(LGPL|MPL|EPL|CDDL|GPL)\b", re.I)


def node(path: str) -> list[tuple[str, str]]:
    data = json.load(open(path, encoding="utf-8"))
    out = []
    for lic, pkgs in data.items():
        for p in pkgs:
            for v in p.get("versions", [""]):
                out.append((f"{p['name']}@{v}", lic))
    return out


def python() -> list[tuple[str, str]]:
    from importlib import metadata

    out = []
    for d in metadata.distributions():
        m = d.metadata
        lic = m.get("License-Expression") or ""
        if not lic:
            classifiers = [
                c.split("::")[-1].strip()
                for c in (m.get_all("Classifier") or [])
                if c.startswith("License ::")
            ]
            lic = "; ".join(classifiers)
        if not lic:
            first = (m.get("License") or "").strip().splitlines()
            lic = first[0] if first else "UNKNOWN"
        out.append((f"{m['Name']}@{d.version}", lic[:80]))
    return out


def main() -> int:
    kind = sys.argv[1]
    rows = node(sys.argv[2]) if kind == "node" else python()
    counts = Counter(lic for _, lic in rows)
    print(f"{kind}: {len(rows)} packages")
    for lic, n in counts.most_common():
        print(f"  {n:4d}  {lic}")
    bad = [(p, lic) for p, lic in rows if FORBIDDEN.search(lic)]
    weak = [
        (p, lic)
        for p, lic in rows
        if WEAK_COPYLEFT.search(lic) and not FORBIDDEN.search(lic)
    ]
    unknown = [(p, lic) for p, lic in rows if lic.upper() in ("UNKNOWN", "")]
    for p, lic in weak:
        print(f"  review (copyleft, not forbidden): {p} {lic}")
    for p, lic in unknown:
        print(f"  review (unknown license): {p}")
    for p, lic in bad:
        print(f"  FORBIDDEN: {p} {lic}")
    return 1 if bad or unknown or not rows else 0


if __name__ == "__main__":
    sys.exit(main())
