"""NER aday karşılaştırması (plan 6.4/2): her adayı yalnız NER katmanı olarak ve tam hatla ölçer, CPU süresini
kaydeder. Modeller yalnız yerel dizinden yüklenir (KAZUIST_NER_DIR/<aday>); dizin yoksa aday "ölçülemedi"
olarak raporlanır. Hiçbir metin ağ üzerinden gönderilmez.

Yerel hazırlık (bir kez, ağırlıklar depoya girmez):
  uv sync --extra ner
  huggingface-cli download akdeniz27/bert-base-turkish-cased-ner --local-dir ~/.cache/kazuist/ner/akdeniz27
  optimum-cli export onnx --model ~/.cache/kazuist/ner/akdeniz27 ~/.cache/kazuist/ner/akdeniz27  (token-classification)
  GLiNER: urchade/gliner_multi-v2.1 (onnx klasörüyle); Hushmark: lokomotifai/hushmark-berturk-112m (özel yükleyici,
  kodu çalıştırmadan önce incelenmeli).

Kullanım (services/worker-py içinden): uv run python ../../eval/anon/compare_ner.py [--out rapor.json]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
import measure  # noqa: E402

from anonymizer.ner import CANDIDATES, load_backend  # noqa: E402
from anonymizer.pipeline import anonymize  # noqa: E402


def run(set_path: Path) -> dict:
    docs = measure.load_set(set_path)
    rows = {}
    for key, cand in CANDIDATES.items():
        row = {"hf_id": cand.hf_id, "license": cand.license, "kind": cand.kind, "note": cand.note}
        try:
            backend = load_backend(key)
        except FileNotFoundError:
            row["status"] = "ölçülemedi: model yerelde yok"
            rows[key] = row
            continue
        except ImportError as exc:
            row["status"] = f"ölçülemedi: isteğe bağlı bağımlılık eksik ({type(exc).__name__})"
            rows[key] = row
            continue
        t0 = time.perf_counter()
        ner_only = measure.score_documents(
            docs, lambda t: [{"start": s.start, "end": s.end, "entity": s.entity} for s in backend.detect(t)])
        t1 = time.perf_counter()
        full = measure.score_documents(
            docs, lambda t: [{"start": s.start, "end": s.end, "entity": s.entity}
                             for s in anonymize(t, ner=backend).spans])
        row.update(status="ölçüldü", seconds_per_doc=(t1 - t0) / max(1, len(docs)),
                   ner_only=ner_only["per_entity"].get("PERSON"), full_micro=full["micro"],
                   full_person=full["per_entity"].get("PERSON"))
        rows[key] = row
    return rows


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", type=Path, default=measure.DEFAULT_SET)
    ap.add_argument("--out", type=Path)
    a = ap.parse_args(argv)
    txt = json.dumps(run(a.set), ensure_ascii=False, indent=1)
    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(txt + "\n", encoding="utf-8")
    print(txt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
