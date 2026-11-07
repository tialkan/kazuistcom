"""Builds apps/web/src/app/atif-agi/_veri/ornek-ag.json from the real Yargıtay decisions of the casuist fixture.

    cd services/worker-py && uv run python ../../eval/citations/ornek_ag_uret.py

The file is the extractor's own output over real, source-anonymised decisions (packages/casuist/fixtures). The
fixture corpus holds no decision that cites another one of its decisions, so every cited decision is external
(not a record) and the graph has doctrine edges only where a decision cites books. It is used by tests, local
development and screenshots; production reads PostgreSQL (apps/web/src/app/atif-agi/_sunucu/kaynak.ts).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "services" / "worker-py"))

from citations.pipeline import RecordMeta, extract_record  # noqa: E402
from citations.scoring import PUBLISH_MIN  # noqa: E402

FIXTURE = ROOT / "packages" / "casuist" / "fixtures" / "kayitlar.json"
OUT = ROOT / "apps" / "web" / "src" / "app" / "atif-agi" / "_veri" / "ornek-ag.json"


class _NoTargets:
    def find(self, kind, esas, karar, number):  # the fixture has no cross-citing decisions
        return []


def main() -> None:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    recs = [r for r in data["kayitlar"] if r.get("court") and "Yargıtay" in r["court"]]
    nodes, works, work_edges, external = [], {}, [], []
    for r in recs:
        ex = extract_record(r["text"], RecordMeta(r["id"], r["esasNo"], r["kararNo"], r["court"], r.get("chamber")), _NoTargets())
        nodes.append({
            "id": r["id"], "type": "karar", "title": r["title"], "court": r["court"], "chamber": r.get("chamber"),
            "esasNo": r["esasNo"], "kararNo": r["kararNo"], "date": r.get("date"),
            "authorityClass": r["authorityClass"], "status": r["status"], "labels": [],
            "sourceUrl": r["sourceUrl"], "fetchedAt": r["fetchedAt"],
        })
        for d in ex.doctrine:
            if d.confidence < PUBLISH_MIN:
                continue
            w = d.work
            works.setdefault(d.work_key, {
                "id": d.work_key, "baslik": w["title"], "yazarlar": w["authors"], "tur": w["kind"], "yayin": w["venue"],
                "basklar": [{"yil": e["year"], "baski": e["edition"], "yer": e["place"], "cilt": e["volume"]} for e in w["editions"]],
            })
            work_edges.append({"from": r["id"], "work": d.work_key, "sayfalar": d.pages})
        for e in ex.decisions:
            if e.confidence < PUBLISH_MIN:
                continue
            external.append({"from": r["id"], "tur": e.kind, "mahkeme": e.court, "daire": e.chamber, "esasNo": e.esas,
                             "kararNo": e.karar, "numara": e.number, "tarih": e.date})
    out = {"surum": "ornek-ag-2026-11-07", "kaynak": "packages/casuist/fixtures/kayitlar.json", "nodes": nodes,
           "works": list(works.values()), "workEdges": work_edges, "externalCitations": external}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(nodes)} karar, {len(works)} eser, {len(work_edges)} eser kenarı, {len(external)} dış karar atfı")


if __name__ == "__main__":
    main()
