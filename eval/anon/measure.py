"""Anonimleştirme ölçümü: varlık türüne göre yakalama (recall) ve kesinlik (precision), Cohen kappa.

Belge biçimi (JSON): {"id", "text", "annotations_a": [{"start","end","entity"}], "annotations_b"?: [...]}.
annotations_b yalnız çift etiketli belgelerde bulunur (plan 6.7: setin %20'si); kappa onlardan hesaplanır.

Tanımlar:
- Yakalama: altın span'ın bütün karakterleri herhangi bir tahmin span'ıyla örtülüyse yakalandı sayılır
  (sızıntı açısından önemli olan maskelenmiş olmasıdır, tür etiketi değil).
- Kesinlik: tahmin span'ı herhangi bir altın span'la kesişiyorsa doğru sayılır; tür bazında tahmin türüne göre
  gruplanır.
- Kappa: boşlukla ayrılmış token düzeyinde, etiket = token'ı örten varlık türü veya O.

Ham metin çıktıya yazılmaz; rapor yalnız sayı ve belge kimliği içerir.

Kullanım (services/worker-py içinden):
  uv run python ../../eval/anon/measure.py [--set ../../eval/anon/sentetik] [--ner none|<aday>] [--out rapor.json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Optional

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "worker-py"))

DEFAULT_SET = Path(__file__).with_name("sentetik")


def _covered(gold: dict, preds: List[dict]) -> bool:
    need = set(range(gold["start"], gold["end"]))
    for p in preds:
        if p["start"] < gold["end"] and gold["start"] < p["end"]:
            need -= set(range(p["start"], p["end"]))
            if not need:
                return True
    return not need


def _overlaps(p: dict, golds: List[dict]) -> bool:
    return any(p["start"] < g["end"] and g["start"] < p["end"] for g in golds)


def score_documents(docs: Iterable[dict], predict: Callable[[str], List[dict]]) -> dict:
    gold_n: Counter = Counter()
    gold_hit: Counter = Counter()
    pred_n: Counter = Counter()
    pred_ok: Counter = Counter()
    misses: Dict[str, List[str]] = defaultdict(list)
    n_docs = 0
    for doc in docs:
        n_docs += 1
        golds = doc["annotations_a"]
        preds = predict(doc["text"])
        for g in golds:
            gold_n[g["entity"]] += 1
            if _covered(g, preds):
                gold_hit[g["entity"]] += 1
            else:
                misses[g["entity"]].append(doc["id"])
        for p in preds:
            pred_n[p["entity"]] += 1
            if _overlaps(p, golds):
                pred_ok[p["entity"]] += 1
    per_entity = {}
    for ent in sorted(set(gold_n) | set(pred_n)):
        per_entity[ent] = {
            "gold": gold_n[ent],
            "caught": gold_hit[ent],
            "recall": (gold_hit[ent] / gold_n[ent]) if gold_n[ent] else None,
            "predicted": pred_n[ent],
            "correct": pred_ok[ent],
            "precision": (pred_ok[ent] / pred_n[ent]) if pred_n[ent] else None,
            "missed_in": sorted(set(misses[ent]))[:10],
        }
    tg, th, tp, to = sum(gold_n.values()), sum(gold_hit.values()), sum(pred_n.values()), sum(pred_ok.values())
    return {
        "documents": n_docs,
        "per_entity": per_entity,
        "micro": {"recall": th / tg if tg else None, "precision": to / tp if tp else None},
    }


def _token_labels(text: str, spans: List[dict]) -> List[str]:
    labels = []
    for m in re.finditer(r"\S+", text):
        lab = "O"
        for s in spans:
            if s["start"] < m.end() and m.start() < s["end"]:
                lab = s["entity"]
                break
        labels.append(lab)
    return labels


def cohen_kappa(a: List[str], b: List[str]) -> Optional[float]:
    if len(a) != len(b) or not a:
        return None
    n = len(a)
    po = sum(x == y for x, y in zip(a, b)) / n
    ca, cb = Counter(a), Counter(b)
    pe = sum(ca[k] * cb[k] for k in set(ca) | set(cb)) / (n * n)
    if pe == 1:
        return 1.0
    return (po - pe) / (1 - pe)


def kappa_for(docs: Iterable[dict]) -> dict:
    la: List[str] = []
    lb: List[str] = []
    n = 0
    for d in docs:
        if "annotations_b" not in d:
            continue
        n += 1
        la += _token_labels(d["text"], d["annotations_a"])
        lb += _token_labels(d["text"], d["annotations_b"])
    return {"double_annotated": n, "kappa": cohen_kappa(la, lb) if n else None}


# 15.3/2 thresholds; the gate is evaluated only on the 200 real decision set.
GATE = {"PERSON": 0.995, "TCKN": 1.0, "IBAN": 1.0, "PHONE": 1.0, "EMAIL": 1.0}
GATE_PRECISION = 0.95


def gate(result: dict) -> dict:
    out = {}
    for ent, thr in GATE.items():
        r = result["per_entity"].get(ent, {}).get("recall")
        out[ent] = {"threshold": thr, "recall": r, "passed": r is not None and r >= thr}
    p = result["micro"]["precision"]
    out["precision"] = {"threshold": GATE_PRECISION, "value": p, "passed": p is not None and p >= GATE_PRECISION}
    return out


def load_set(path: Path) -> List[dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(path.glob("*.json"))]


def pipeline_predictor(ner_key: str = "none") -> Callable[[str], List[dict]]:
    from anonymizer.ner import NullBackend, load_backend
    from anonymizer.pipeline import anonymize

    backend = NullBackend() if ner_key == "none" else load_backend(ner_key)

    def predict(text: str) -> List[dict]:
        return [{"start": s.start, "end": s.end, "entity": s.entity} for s in anonymize(text, ner=backend).spans]

    return predict


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", type=Path, default=DEFAULT_SET)
    ap.add_argument("--ner", default="none")
    ap.add_argument("--out", type=Path)
    args = ap.parse_args(argv)
    docs = load_set(args.set)
    result = score_documents(docs, pipeline_predictor(args.ner))
    result["kappa"] = kappa_for(docs)
    result["gate_15_3_2"] = gate(result)
    result["ner"] = args.ner
    txt = json.dumps(result, ensure_ascii=False, indent=1)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(txt + "\n", encoding="utf-8")
    print(txt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
