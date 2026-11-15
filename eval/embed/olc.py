"""Embedding adaylarının ölçümü (plan 5.3 ve 6.7, eval/embed): getirme kalitesi, CPU gecikmesi, bellek.

Her aday ve her biçim (fp32 model.onnx, int8 model_quantized.onnx) ayrı bir alt süreçte ölçülür; böylece tepe
bellek (RSS) yalnız o modeli gösterir. Alt süreç modeli nlp.embedder.OnnxEmbedder ile, üretimdeki yolla yükler.

Derlem: packages/casuist/fixtures/kayitlar.json (75 kayıt), parçalar nlp.chunk.chunk_text ile (üretimdeki
embed.chunks ile aynı sınırlar). İki pasaj biçimi ölçülür:
  metin          yalnız parça metni; üretimdeki embed.chunks bunu gömer (nlp/job.py)
  baslik+metin   "<kayıt başlığı>\\n<parça>"; packages/casuist MemoryBackend bunu gömer
Kayıt puanı, kaydın parçalarından en yüksek kosinüstür (sql.ts ve memory.ts vektör kolu gibi).

Sorgu setleri: eval/rag/set-50.json (beklenen kaynağı olan sorular ve cevapsız sorular) ve
eval/embed/set-sentetik.json. Ölçütler: isabet@1/5/10 (beklenenlerden en az biri ilk k'da), nDCG@10 (ikili
ilgililik), MRR@10; cevapsız sorularda en üst kosinüs (çekimserlik eşiği için bilgi).

Gecikme: sorgu tek tek (üretimdeki çevrim içi yol), ilk üç sorgu ısınma sayılır; pasajlar OnnxEmbedder'ın
öntanımıyla (metin başına bir çalıştırma) gömülür.

Kullanım (services/worker-py içinden, ner-runtime ekstrası kurulu, modeller hazirla.py ile hazırlanmış):
  uv run --extra ner-runtime python -I ../../eval/embed/olc.py [--only bge-m3] [--bicim int8] [--threads 4] [--yaz]
  --vektor <klasör>  sorgu ve pasaj vektörlerini JSON olarak yazar (hibrit ölçüm için, depo dışına)
macOS'ta komutun başına `caffeinate -i` eklenir; makine uykuya geçerse süreler bozulur.

Çıktı (--yaz): eval/embed/raporlar/dalga-2-embed.json ve .md; ardından depo kökünde
`pnpm exec prettier --write eval/embed/raporlar` (JSON biçimi). Ölçülemeyen bir aday "ölçülmedi" yazılır.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import platform
import resource
import statistics
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Sequence

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WORKER = ROOT / "services" / "worker-py"
sys.path.insert(0, str(WORKER))

from nlp.chunk import chunk_text  # noqa: E402
from nlp.embedder import CANDIDATES, MANIFEST, embed_root  # noqa: E402

CORPUS = ROOT / "packages" / "casuist" / "fixtures" / "kayitlar.json"
SETS = {"rag-50": ROOT / "eval" / "rag" / "set-50.json", "sentetik": HERE / "set-sentetik.json"}
VARIANTS = ("fp32", "int8")
PASSAGE_FORMS = ("metin", "baslik+metin")
KS = (1, 5, 10)
WARMUP = 3


# --- metrics (pure, tested in nlp/tests/test_embed_eval.py) ------------------------------------------------


def rank_records(query: Sequence[float], passages: Sequence[Sequence[float]], owners: Sequence[str]) -> List[str]:
    """Record keys ordered by their best passage's cosine (vectors are L2 normalised, so dot = cosine)."""
    return [k for k, _ in rank_scores(query, passages, owners)]


def rank_scores(
    query: Sequence[float], passages: Sequence[Sequence[float]], owners: Sequence[str]
) -> List[tuple]:
    best: Dict[str, float] = {}
    for vec, owner in zip(passages, owners, strict=True):
        s = math.fsum(a * b for a, b in zip(query, vec, strict=True))
        if owner not in best or s > best[owner]:
            best[owner] = s
    return sorted(best.items(), key=lambda kv: (-kv[1], kv[0]))


def hit_at(ranked: Sequence[str], relevant: Sequence[str], k: int) -> float:
    rel = set(relevant)
    return 1.0 if any(r in rel for r in ranked[:k]) else 0.0


def mrr_at(ranked: Sequence[str], relevant: Sequence[str], k: int = 10) -> float:
    rel = set(relevant)
    for i, r in enumerate(ranked[:k]):
        if r in rel:
            return 1.0 / (i + 1)
    return 0.0


def ndcg_at(ranked: Sequence[str], relevant: Sequence[str], k: int = 10) -> float:
    rel = set(relevant)
    if not rel:
        return 0.0
    dcg = math.fsum(1.0 / math.log2(i + 2) for i, r in enumerate(ranked[:k]) if r in rel)
    ideal = math.fsum(1.0 / math.log2(i + 2) for i in range(min(len(rel), k)))
    return dcg / ideal


def percentile(xs: Sequence[float], q: float) -> float:
    """Nearest rank percentile, the same rule as eval/rag/olc.ts."""
    s = sorted(xs)
    if not s:
        return 0.0
    return s[min(len(s) - 1, max(0, math.ceil(q * len(s)) - 1))]


def separation(answered: Sequence[float], unanswered: Sequence[float]) -> Optional[float]:
    """Share of (answered, unanswered) pairs in which the answered query's top cosine is higher (ROC AUC)."""
    if not answered or not unanswered:
        return None
    wins = sum(1.0 if a > u else 0.5 if a == u else 0.0 for a in answered for u in unanswered)
    return wins / (len(answered) * len(unanswered))


def paired_bootstrap(a: Sequence[float], b: Sequence[float], rounds: int = 5000, seed: int = 7) -> tuple:
    """Mean of a - b over paired queries with a 95% percentile bootstrap interval (resampling queries)."""
    import random

    if len(a) != len(b) or not a:
        raise ValueError("paired samples")
    d = [x - y for x, y in zip(a, b, strict=True)]
    rng = random.Random(seed)
    n = len(d)
    means = sorted(math.fsum(d[rng.randrange(n)] for _ in range(n)) / n for _ in range(rounds))
    return math.fsum(d) / n, means[int(0.025 * rounds)], means[int(0.975 * rounds) - 1]


def summarise(per_query: List[dict]) -> dict:
    n = len(per_query)
    out = {"sorular": n}
    for k in KS:
        out[f"isabet@{k}"] = round(sum(q[f"isabet@{k}"] for q in per_query) / n, 4) if n else None
    out["ndcg@10"] = round(sum(q["ndcg@10"] for q in per_query) / n, 4) if n else None
    out["mrr@10"] = round(sum(q["mrr@10"] for q in per_query) / n, 4) if n else None
    return out


# --- data ---------------------------------------------------------------------------------------------------


def load_corpus() -> tuple:
    data = json.loads(CORPUS.read_text(encoding="utf-8"))
    texts: Dict[str, List[str]] = {form: [] for form in PASSAGE_FORMS}
    owners: List[str] = []
    for r in data["kayitlar"]:
        for c in chunk_text(r["text"]):
            owners.append(r["sourceKey"])
            texts["metin"].append(c.text)
            texts["baslik+metin"].append(f"{r['title']}\n{c.text}")
    return data["surum"], texts, owners


def load_sets(corpus_version: str, keys: set) -> Dict[str, dict]:
    out = {}
    for name, path in SETS.items():
        s = json.loads(path.read_text(encoding="utf-8"))
        if s["derlem"] != corpus_version:
            raise SystemExit(f"{name}: set {s['derlem']} derlemi için, fikstür {corpus_version}")
        for q in s["sorular"]:
            for k in q["beklenen"]:
                if k not in keys:
                    raise SystemExit(f"{name} {q['id']}: {k} derlemde yok")
        out[name] = s
    return out


def rss_mb() -> float:
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(peak / (1 << 20) if sys.platform == "darwin" else peak / 1024, 1)


# --- one model in one process --------------------------------------------------------------------------------


def measure_one(key: str, variant: str, threads: int, vector_dir: Optional[str]) -> dict:
    from nlp.embedder import OnnxEmbedder

    model_dir = embed_root(os.environ) / key
    corpus_version, passages, owners = load_corpus()
    sets = load_sets(corpus_version, set(owners))
    base_rss = rss_mb()
    t0 = time.perf_counter()
    emb = OnnxEmbedder.load(model_dir, key, threads, quantized=variant == "int8")
    load_s = time.perf_counter() - t0
    load_rss = rss_mb()
    tok = emb._tok
    lengths = {
        form: [len(e.ids) for e in tok.encode_batch([emb.candidate.passage_prefix + t for t in texts])]
        for form, texts in passages.items()
    }
    vecs: Dict[str, list] = {}
    passage_s: Dict[str, float] = {}
    for form, texts in passages.items():
        t1 = time.perf_counter()
        vecs[form] = emb.embed(texts, "passage")
        passage_s[form] = time.perf_counter() - t1

    queries = [(name, q) for name, s in sets.items() for q in s["sorular"]]
    for _, q in queries[:WARMUP]:
        emb.embed([q["soru"]], "query")
    qvec: Dict[str, List[float]] = {}
    latency: List[float] = []
    for name, q in queries:
        t1 = time.perf_counter()
        [v] = emb.embed([q["soru"]], "query")
        latency.append((time.perf_counter() - t1) * 1000)
        qvec[f"{name}/{q['id']}"] = v

    results: Dict[str, dict] = {}
    for form in PASSAGE_FORMS:
        for name, s in sets.items():
            per_query, answered_top, unanswered_top = [], [], []
            for q in s["sorular"]:
                ranked = rank_scores(qvec[f"{name}/{q['id']}"], vecs[form], owners)
                keys = [k for k, _ in ranked]
                top = ranked[0][1] if ranked else 0.0
                if not q["beklenen"]:
                    unanswered_top.append(top)
                    continue
                answered_top.append(top)
                first = next((i + 1 for i, k in enumerate(keys) if k in set(q["beklenen"])), None)
                per_query.append(
                    {
                        "id": q["id"],
                        "tur": q["tur"],
                        **{f"isabet@{k}": hit_at(keys, q["beklenen"], k) for k in KS},
                        "ndcg@10": ndcg_at(keys, q["beklenen"]),
                        "mrr@10": mrr_at(keys, q["beklenen"]),
                        "ilk_sira": first,
                        "ust_kosinus": round(top, 4),
                    }
                )
            sep = separation(answered_top, unanswered_top)
            results[f"{form}|{name}"] = {
                **summarise(per_query),
                "cevapsiz": len(unanswered_top),
                "cevapsiz_ust_kosinus_ort": round(statistics.fmean(unanswered_top), 4) if unanswered_top else None,
                "cevapli_ust_kosinus_ort": round(statistics.fmean(answered_top), 4) if answered_top else None,
                "ayrisma_auc": round(sep, 4) if sep is not None else None,
                "kacanlar_ilk10": [p["id"] for p in per_query if not p["isabet@10"]],
                "soru_bazinda": per_query,
            }

    if vector_dir:
        out = Path(vector_dir)
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{key}.{variant}.json").write_text(
            json.dumps(
                {
                    "model": emb.model,
                    "owners": owners,
                    "passages": {form: vecs[form] for form in PASSAGE_FORMS},
                    "texts": passages,
                    "queries": qvec,
                }
            ),
            encoding="utf-8",
        )

    model_file = model_dir / ("model_quantized.onnx" if variant == "int8" else "model.onnx")
    disk = model_file.stat().st_size + sum(
        p.stat().st_size for p in model_dir.iterdir() if variant == "fp32" and p.name == "model.onnx_data"
    )
    return {
        "aday": key,
        "bicim": variant,
        "model": emb.model,
        "is_parcacigi": threads,
        "yukleme_sn": round(load_s, 2),
        "disk_mb": round(disk / (1 << 20), 1),
        "rss_mb": {"baslangic": base_rss, "yuklendi": load_rss, "tepe": rss_mb()},
        "sorgu_ms": {
            "p50": round(percentile(latency, 0.5), 1),
            "p95": round(percentile(latency, 0.95), 1),
            "en": round(max(latency), 1),
            "n": len(latency),
        },
        "pasaj": {
            form: {
                "adet": len(passages[form]),
                "sn": round(passage_s[form], 2),
                "pasaj_sn": round(len(passages[form]) / passage_s[form], 2),
                "token_ort": round(statistics.fmean(lengths[form]), 1),
                "token_en": max(lengths[form]),
                "kesilen": sum(1 for n in lengths[form] if n > emb.candidate.max_tokens),
            }
            for form in PASSAGE_FORMS
        },
        "sonuclar": results,
    }


# --- report -------------------------------------------------------------------------------------------------


def fmt(x: Optional[float], pct: bool = True) -> str:
    if x is None:
        return "yok"
    return f"%{x * 100:.1f}" if pct else f"{x:.3f}"


def markdown(report: dict) -> str:
    rows = []
    for r in report["olcumler"]:
        if "hata" in r:
            rows.append(f"| {r['aday']} | {r['bicim']} | ölçülmedi ({r['hata']}) |||||||||")
            continue
        for form in PASSAGE_FORMS:
            s = r["sonuclar"][f"{form}|sentetik"]
            g = r["sonuclar"][f"{form}|rag-50"]
            rows.append(
                f"| {r['aday']} | {r['bicim']} | {form} | {fmt(s['isabet@1'])} | {fmt(s['isabet@10'])} | "
                f"{fmt(s['ndcg@10'], False)} | {fmt(g['isabet@1'])} | {fmt(g['isabet@10'])} | "
                f"{fmt(g['ndcg@10'], False)} | {fmt(g['ayrisma_auc'], False)} |"
            )
    perf = []
    for r in report["olcumler"]:
        if "hata" in r:
            continue
        p = r["pasaj"]["metin"]
        perf.append(
            f"| {r['aday']} | {r['bicim']} | {r['disk_mb']:.0f} | {r['rss_mb']['yuklendi']:.0f} | "
            f"{r['rss_mb']['tepe']:.0f} | {r['yukleme_sn']} | "
            f"{r['sorgu_ms']['p50']} | {r['sorgu_ms']['p95']} | {p['pasaj_sn']} | {p['token_ort']} | {p['kesilen']} |"
        )
    pairs = [
        f"| {c['bicim']} | {c['pasaj']} | {c['a']} - {c['b']} | {c['ndcg_farki']:+.3f} | "
        f"[{c['guven_95'][0]:+.3f}, {c['guven_95'][1]:+.3f}] |"
        for c in report.get("karsilastirma", [])
    ]
    env = report["ortam"]
    return f"""# Embedding ölçümü, Dalga 2 ({report['tarih']})

Komut: `{report['komut']}`. Derlem {report['derlem']} ({report['kayit']} kayıt, {report['parca']} parça).
Setler: rag-50 ({report['setler']['rag-50']}), sentetik ({report['setler']['sentetik']}). Yalnız vektör
kolu ölçülür (tam metin ve kimlik kolu yok); kayıt puanı, parçalarının en yüksek kosinüsüdür.

Ortam: {env['makine']}, {env['cpu']}, {env['is_parcacigi']} iş parçacığı, onnxruntime {env['onnxruntime']}.
Süreler bu makinenindir; hedef sunucu (Hetzner CAX21, Arm64 Ampere, 4 vCPU, 8 GB) üzerinde ölçülmedi ve
orada daha yavaş olması beklenir. Bellek, ölçüm sürecinin tepe RSS değeridir (Python, numpy, derlem dahil).

## Getirme (vektör kolu tek başına)

isabet@k: beklenen kayıtlardan en az biri ilk k'da. AUC: cevaplı soruların en üst kosinüsünün cevapsız
sorularınkinden yüksek olma oranı (çekimserlik eşiği için bilgi, eşik değildir).

| Aday | Biçim | Pasaj | Sentetik isabet@1 | Sentetik isabet@10 | Sentetik nDCG@10 | rag-50 isabet@1 | rag-50 isabet@10 | rag-50 nDCG@10 | rag-50 AUC |
|---|---|---|---|---|---|---|---|---|---|
{chr(10).join(rows)}

## Adayların farkı (eşleştirilmiş, iki setin bütün etiketli soruları)

nDCG@10 farkı (a eksi b) ve soruların yeniden örneklenmesiyle %95 güven aralığı. Aralık sıfırı içeriyorsa bu
setlerle fark gösterilemedi demektir.

| Biçim | Pasaj | a - b | nDCG@10 farkı | %95 aralık |
|---|---|---|---|---|
{chr(10).join(pairs)}

## Kaynak kullanımı (pasaj biçimi: metin)

| Aday | Biçim | Disk MB | Yüklenince RSS MB | Tepe RSS MB | Yükleme sn | Sorgu p50 ms | Sorgu p95 ms | Pasaj/sn | Ort. token | Kesilen |
|---|---|---|---|---|---|---|---|---|---|---|
{chr(10).join(perf)}

Ayrıntı (soru bazında sıra ve kosinüs, kaçan sorular): dalga-2-embed.json.
"""


def comparisons(rows: List[dict]) -> List[dict]:
    """Paired nDCG@10 differences between candidates over every labelled query of both sets, per format."""
    out = []
    ok = [r for r in rows if "hata" not in r]
    for variant in VARIANTS:
        for form in PASSAGE_FORMS:
            same = [r for r in ok if r["bicim"] == variant]
            for i, a in enumerate(same):
                for b in same[i + 1 :]:
                    xs, ys = [], []
                    for name in SETS:
                        qa = a["sonuclar"][f"{form}|{name}"]["soru_bazinda"]
                        qb = b["sonuclar"][f"{form}|{name}"]["soru_bazinda"]
                        assert [q["id"] for q in qa] == [q["id"] for q in qb]
                        xs += [q["ndcg@10"] for q in qa]
                        ys += [q["ndcg@10"] for q in qb]
                    mean, lo, hi = paired_bootstrap(xs, ys)
                    out.append(
                        {
                            "bicim": variant,
                            "pasaj": form,
                            "a": a["aday"],
                            "b": b["aday"],
                            "sorular": len(xs),
                            "ndcg_farki": round(mean, 4),
                            "guven_95": [round(lo, 4), round(hi, 4)],
                        }
                    )
    return out


def run_child(key: str, variant: str, threads: int, vector_dir: Optional[str]) -> dict:
    cmd = [sys.executable, "-I", str(Path(__file__).resolve()), "--alt", key, variant, "--threads", str(threads)]
    if vector_dir:
        cmd += ["--vektor", vector_dir]
    proc = subprocess.run(cmd, capture_output=True, text=True, env={**os.environ, "HF_HUB_OFFLINE": "1"})
    if proc.returncode != 0:
        last = (proc.stderr.strip().splitlines() or ["?"])[-1]
        return {"aday": key, "bicim": variant, "hata": last[:200]}
    return json.loads(proc.stdout.strip().splitlines()[-1])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", action="append", choices=sorted(CANDIDATES))
    ap.add_argument("--bicim", action="append", choices=VARIANTS)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--yaz", action="store_true")
    ap.add_argument("--vektor")
    ap.add_argument("--alt", nargs=2, metavar=("ADAY", "BICIM"))
    args = ap.parse_args()

    if args.alt:
        print(json.dumps(measure_one(args.alt[0], args.alt[1], args.threads, args.vektor), ensure_ascii=False))
        return

    corpus_version, passages, owners = load_corpus()
    sets = load_sets(corpus_version, set(owners))
    rows = []
    for key in args.only or list(CANDIDATES):
        for variant in args.bicim or VARIANTS:
            onnx = embed_root(os.environ) / key / ("model_quantized.onnx" if variant == "int8" else "model.onnx")
            if not onnx.is_file():
                rows.append({"aday": key, "bicim": variant, "hata": "model dosyası yok"})
                continue
            print(f"ölçülüyor: {key} {variant}", file=sys.stderr, flush=True)
            rows.append(run_child(key, variant, args.threads, args.vektor))
    try:
        import onnxruntime  # type: ignore

        ort_version = onnxruntime.__version__
    except ImportError:
        ort_version = "yok"
    cpu = platform.processor() or platform.machine()
    if sys.platform == "darwin":
        cpu = subprocess.run(
            ["sysctl", "-n", "machdep.cpu.brand_string"], capture_output=True, text=True
        ).stdout.strip() or cpu
    manifests = {}
    for key in args.only or list(CANDIDATES):
        p = embed_root(os.environ) / key / MANIFEST
        if p.is_file():
            m = json.loads(p.read_text(encoding="utf-8"))
            manifests[key] = {k: m.get(k) for k in ("hf_id", "revision", "license", "parity", "quantization")}
    count = lambda s: (  # noqa: E731
        f"{sum(1 for q in s['sorular'] if q['beklenen'])} beklenen kaynaklı, "
        f"{sum(1 for q in s['sorular'] if not q['beklenen'])} cevapsız"
    )
    report = {
        "tarih": time.strftime("%Y-%m-%d"),
        "komut": "uv run --extra ner-runtime python -I ../../eval/embed/olc.py --yaz",
        "derlem": corpus_version,
        "kayit": len(set(owners)),
        "parca": len(owners),
        "setler": {name: count(s) for name, s in sets.items()},
        "set_surumleri": {name: s["surum"] for name, s in sets.items()},
        "ortam": {
            "makine": f"{platform.system()} {platform.machine()}",
            "cpu": cpu,
            "is_parcacigi": args.threads,
            "onnxruntime": ort_version,
            "python": platform.python_version(),
        },
        "manifestler": manifests,
        "karsilastirma": comparisons(rows),
        "olcumler": rows,
    }
    md = markdown(report)
    print(md)
    if args.yaz:
        out = HERE / "raporlar"
        out.mkdir(exist_ok=True)
        (out / "dalga-2-embed.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
        )
        (out / "dalga-2-embed.md").write_text(md, encoding="utf-8")


if __name__ == "__main__":
    main()
