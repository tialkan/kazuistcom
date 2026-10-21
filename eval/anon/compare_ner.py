"""NER aday karşılaştırması (plan 6.4/2).

Her yapılandırma ayrı bir alt süreçte çalışır (temiz bellek ölçümü): yalnız kural katmanı, her aday tek başına
(yalnız NER), kural katmanı + aday ve kural katmanı + aday birleşimleri. Her set için varlık türüne göre yakalama
ve kesinlik (measure.py tanımları), belge başına CPU gecikmesi (duvar saati ve işlemci süresi), 1000 karakter
başına süre, editör kuyruğuna düşen tespit sayısı ve bellek (RSS) kaydedilir.

Modeller yalnız yerel dizinden yüklenir (KAZUIST_NER_DIR/<aday>, export_ner.py çıktısı); ağ kapalıdır
(HF_HUB_OFFLINE=1). Hiçbir metin ağa gönderilmez ve çıktıya yazılmaz; rapor yalnız sayı ve belge kimliği içerir.

Kullanım (services/worker-py içinden, ner extra kurulu):
  uv run python ../../eval/anon/compare_ner.py --out ../../eval/anon/raporlar/dalga-1-ner.json
  uv run python ../../eval/anon/compare_ner.py --only rules+hushmark-berturk-112m --threads 1
"""

from __future__ import annotations

import os

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import argparse  # noqa: E402
import json  # noqa: E402
import platform  # noqa: E402
import resource  # noqa: E402
import statistics  # noqa: E402
import subprocess  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from collections import Counter  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Callable, Dict, List, Optional  # noqa: E402

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import measure  # noqa: E402

from anonymizer.ner import CANDIDATES, MANIFEST, local_model_dir  # noqa: E402

SETS = {"sentetik": HERE / "sentetik", "zor": HERE / "zor"}
MEASURED = ["hushmark-berturk-112m", "akdeniz27", "gliner-multi-v2.1"]
CONFIGS = (
    ["rules"]
    + [f"ner:{k}" for k in MEASURED]
    + [f"rules+{k}" for k in MEASURED]
    + ["rules+hushmark-berturk-112m+akdeniz27", "rules+hushmark-berturk-112m+gliner-multi-v2.1",
       "rules+akdeniz27+gliner-multi-v2.1", "rules+hushmark-berturk-112m+akdeniz27+gliner-multi-v2.1"]
)


def rss_mb() -> Optional[float]:
    try:
        with open("/proc/self/statm") as f:
            return int(f.read().split()[1]) * os.sysconf("SC_PAGE_SIZE") / 2**20
    except OSError:
        pass
    try:
        out = subprocess.run(["ps", "-o", "rss=", "-p", str(os.getpid())], capture_output=True, text=True,
                             check=True).stdout
        return int(out.strip()) / 1024
    except (OSError, ValueError, subprocess.CalledProcessError):
        return None


def peak_rss_mb() -> float:
    r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return r / 2**20 if sys.platform == "darwin" else r / 1024


def machine() -> dict:
    cpu = platform.processor()
    if sys.platform == "darwin":
        try:
            cpu = subprocess.run(["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True,
                                 check=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            pass
    return {"platform": platform.platform(), "cpu": cpu, "logical_cpus": os.cpu_count(),
            "python": platform.python_version()}


def person_by_tag(docs: List[dict], predict: Callable[[str], List[dict]]) -> Dict[str, dict]:
    gold: Counter = Counter()
    hit: Counter = Counter()
    for d in docs:
        preds = predict(d["text"])
        for g in d["annotations_a"]:
            if g["entity"] != "PERSON":
                continue
            for tag in d.get("tags", []):
                gold[tag] += 1
                hit[tag] += measure._covered(g, preds)
    return {t: {"gold": gold[t], "caught": hit[t], "recall": hit[t] / gold[t]} for t in sorted(gold)}


def worker(config: str) -> dict:
    from anonymizer.ner import NullBackend, load_backend
    from anonymizer.pipeline import anonymize

    base = rss_mb()
    rules = config == "rules" or config.startswith("rules+")
    spec = "" if config == "rules" else config.split(":", 1)[1] if config.startswith("ner:") else config[6:]
    t0 = time.perf_counter()
    backend = load_backend(spec) if spec else NullBackend()
    load_s = time.perf_counter() - t0
    after_load = rss_mb()

    review: List[int] = []

    def predict(text: str) -> List[dict]:
        if rules:
            r = anonymize(text, ner=backend)
            review.append(len(r.review))
            return [{"start": s.start, "end": s.end, "entity": s.entity} for s in r.spans]
        return [{"start": s.start, "end": s.end, "entity": s.entity} for s in backend.detect(text)]

    out: dict = {"config": config, "backend": backend.name, "load_seconds": round(load_s, 2), "sets": {}}
    for set_name, path in SETS.items():
        docs = measure.load_set(path)
        predict(docs[0]["text"])  # warm up (first ORT run allocates)
        review.clear()
        wall: List[float] = []
        cpu: List[float] = []
        chars = 0
        cache: Dict[str, List[dict]] = {}
        for d in docs:
            c0, w0 = time.process_time(), time.perf_counter()
            cache[d["id"]] = predict(d["text"])
            wall.append(time.perf_counter() - w0)
            cpu.append(time.process_time() - c0)
            chars += len(d["text"])
        by_text = {d["text"]: cache[d["id"]] for d in docs}
        res = measure.score_documents(docs, lambda t: by_text[t])
        wall_sorted = sorted(wall)
        row = {
            "documents": len(docs), "chars": chars, "per_entity": res["per_entity"], "micro": res["micro"],
            "latency_ms_per_doc": {"mean": 1000 * statistics.mean(wall), "p50": 1000 * statistics.median(wall),
                                   "p95": 1000 * wall_sorted[max(0, int(0.95 * len(wall)) - 1)],
                                   "max": 1000 * wall_sorted[-1]},
            "cpu_ms_per_doc": 1000 * statistics.mean(cpu),
            "wall_ms_per_1000_chars": 1000 * sum(wall) / chars * 1000,
        }
        if rules:
            row["review_items_per_doc"] = statistics.mean(review) if review else 0.0
            row["gate_15_3_2_bilgi"] = measure.gate(res)
        if any("tags" in d for d in docs):
            row["person_by_tag"] = person_by_tag(docs, lambda t: by_text[t])
        out["sets"][set_name] = row
    out["memory_mb"] = {"rss_before_load": base, "rss_after_load": after_load,
                        "model_load_delta": (after_load - base) if base and after_load else None,
                        "peak_rss": peak_rss_mb()}
    return out


def model_info() -> dict:
    info = {}
    for key, c in CANDIDATES.items():
        d = local_model_dir(key)
        row = {"hf_id": c.hf_id, "license": c.license, "kind": c.kind, "revision": c.revision, "note": c.note}
        if key == "savasy":
            row["status"] = "indirilmedi: lisans netleşene kadar bekliyor (docs/kararlar.md, 2026-10-20)"
        elif d is None:
            row["status"] = "ölçülemedi: model yerelde yok"
        else:
            row["status"] = "yerelde"
            m = d / MANIFEST
            if m.is_file():
                man = json.loads(m.read_text(encoding="utf-8"))
                row["parity"] = man.get("parity")
                row["onnx_sha256"] = man.get("onnx_sha256")
                row["export_versions"] = man.get("versions")
            row["onnx_mb"] = round(sum(p.stat().st_size for p in d.glob("*.onnx")) / 2**20, 1)
        info[key] = row
    return info


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path)
    ap.add_argument("--only", action="append", help="yalnız bu yapılandırma(lar)")
    ap.add_argument("--threads", type=int, default=0, help="onnxruntime iş parçacığı (0: varsayılan)")
    ap.add_argument("--worker", help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    if a.worker:
        print(json.dumps(worker(a.worker), ensure_ascii=False))
        return 0
    env = dict(os.environ)
    if a.threads:
        env["KAZUIST_NER_THREADS"] = str(a.threads)
    results = []
    for cfg in a.only or CONFIGS:
        p = subprocess.run([sys.executable, __file__, "--worker", cfg], capture_output=True, text=True, env=env)
        if p.returncode != 0:
            err = (p.stderr.strip().splitlines() or ["?"])[-1]
            results.append({"config": cfg, "status": f"ölçülemedi: {err[:200]}"})
            print(cfg, "ölçülemedi", file=sys.stderr)
            continue
        r = json.loads(p.stdout.strip().splitlines()[-1])
        r["status"] = "ölçüldü"
        results.append(r)
        s, z = r["sets"]["sentetik"], r["sets"]["zor"]
        pp = s["per_entity"].get("PERSON", {})
        zp = z["per_entity"].get("PERSON", {})
        print(f"{cfg}: sentetik PERSON R={pp.get('recall')} P={pp.get('precision')} | zor PERSON "
              f"R={zp.get('recall')} P={zp.get('precision')} | {s['latency_ms_per_doc']['mean']:.0f} ms/belge",
              file=sys.stderr)
    report = {
        "date": time.strftime("%Y-%m-%d"), "machine": machine(),
        "onnxruntime_threads": a.threads or "varsayılan", "models": model_info(), "results": results,
        "uyari": "Sentetik ve zor setler kuralları yazan ajan tarafından üretildi; sonuçlar iyimserdir ve "
                 "15.3/2 yayın kapısı için kanıt değildir.",
    }
    txt = json.dumps(report, ensure_ascii=False, indent=1)
    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True)
        a.out.write_text(txt + "\n", encoding="utf-8")
    else:
        print(txt)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
