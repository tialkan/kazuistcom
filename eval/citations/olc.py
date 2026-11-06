"""Atıf ağı ölçümü (plan 6.7, 15.3/4).

    cd services/worker-py && uv run python ../../eval/citations/olc.py          # ölçer, özeti yazdırır
    cd services/worker-py && uv run python ../../eval/citations/olc.py --yaz    # ayrıca raporlar/ altına yazar

Ölçülen kümeler:
  ornek-7    packages/casuist/fixtures icindeki 7 gerçek Yargıtay kararı (elle etiketli)
  sentetik   kalıp kapsamı için sentetik metinler
Yayın kapısı (15.3/4: 100 karar, yayımlanan kenarlarda kesinlik >= %95) için gereken 100 kararlık altın set ve
gerçek karar corpusu yoktur. O ölçüm "ölçülmedi" yazılır ve geçti sayılmaz. Modele (Haiku 5.5) bağlı bir ölçüm de
yapılmaz: gerçek çağrı yok.

Kesinlik tanımı: çıkarılan ve güveni >= PUBLISH_MIN olan kenarların kaç tanesi altın listede var. Hedef kaydın
corpusta bulunması bu ölçümde aranmaz (gerçek corpusta hedefler yok); bu yüzden bu sayı "kenar kimliği
kesinliği"dir, "yayımlanan kenar kesinliği" değildir.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "services" / "worker-py"))

from citations.pipeline import RecordMeta, extract_record  # noqa: E402
from citations.scoring import PUBLISH_MIN, QUEUE_MIN, Target  # noqa: E402
from citations.text import fold  # noqa: E402
from citations.works import title_contains, title_similarity  # noqa: E402

FIXTURE = ROOT / "packages" / "casuist" / "fixtures" / "kayitlar.json"
THRESHOLD = 0.95


class FixtureIndex:
    def __init__(self, records: Sequence[Dict[str, Any]]):
        self.recs = [r for r in records if r.get("esasNo")]

    def find(self, kind: str, esas: Optional[str], karar: Optional[str], number: Optional[str]) -> Sequence[Target]:
        out = []
        for r in self.recs:
            e, k = r["esasNo"].replace(" ", ""), (r.get("kararNo") or "").replace(" ", "")
            if (number and e == number) or (esas and e == esas and k == karar):
                out.append(Target(r["id"], r["court"], r.get("chamber"), r.get("date"), r["esasNo"], r.get("kararNo")))
        return out


def gold_key(g: Dict[str, Any]) -> Tuple:
    return (g["kind"], g.get("number"), g.get("esas"), g.get("karar"))


def prf(tp: int, fp: int, fn: int) -> Dict[str, Optional[float]]:
    p = tp / (tp + fp) if tp + fp else None
    r = tp / (tp + fn) if tp + fn else None
    return {"kesinlik": p, "duyarlilik": r}


def doctrine_match(edge: Dict[str, Any], gold: Dict[str, Any]) -> bool:
    surname = fold(edge["authors"][0].split(",")[0]).split(" ")[-1]
    # The work title carries volume subtitles ("Türk Medeni Hukuku Başlangıç Hükümleri ..."), the gold only the title.
    same_title = title_similarity(edge["title"], gold["baslik"]) >= 0.8 or title_contains(gold["baslik"], edge["title"])
    return surname == fold(gold["yazar"]).split(" ")[-1] and same_title


def measure_doc(text: str, meta: RecordMeta, index: Any, gold: Dict[str, Any]) -> Dict[str, Any]:
    ex = extract_record(text, meta, index)
    dec = {(e.kind, e.number, e.esas, e.karar): e for e in ex.decisions}
    gd = {gold_key(g): g for g in gold["karar_atiflari"]}
    pub_keys = {k for k, e in dec.items() if e.confidence >= PUBLISH_MIN}
    tp = len(pub_keys & gd.keys())
    fp_keys = sorted(map(str, pub_keys - gd.keys()))
    fn_keys = sorted(map(str, gd.keys() - set(dec)))
    wrong_field = []
    for k in set(dec) & gd.keys():
        e, g = dec[k], gd[k]
        for f in ("court", "chamber", "date"):
            if g.get(f) != getattr(e, f):
                wrong_field.append(f"{k}:{f}:{getattr(e, f)}!={g.get(f)}")
    d_edges = [d.work for d in ex.doctrine if d.confidence >= PUBLISH_MIN]
    gdoc = gold["doktrin_atiflari"]
    d_tp = sum(any(doctrine_match(w, g) for g in gdoc) for w in d_edges)
    d_fp = len(d_edges) - d_tp
    d_fn = sum(not any(doctrine_match(d.work, g) for d in ex.doctrine) for g in gdoc)
    return {
        "karar": {"tp": tp, "fp": len(fp_keys), "fn": len(fn_keys), "fp_ayrinti": fp_keys, "fn_ayrinti": fn_keys,
                  "alan_hatasi": wrong_field, "cikarilan": len(dec), "kuyruk": sum(e.status == "kuyruk" for e in ex.decisions)},
        "doktrin": {"tp": d_tp, "fp": d_fp, "fn": d_fn, "cikarilan": len(ex.doctrine), "kuyruk": sum(d.status == "kuyruk" for d in ex.doctrine)},
        "alt_mahkeme": {"beklenen": gold.get("alt_mahkeme_anmalari", 0), "bulunan": ex.out_of_scope},
        "yayimlanan_kenar": ex.publishable_edges,
    }


def run_ornek7(fx: List[Dict[str, Any]]) -> Dict[str, Any]:
    gold = json.loads((HERE / "altin" / "ornek-7.json").read_text(encoding="utf-8"))
    by_key = {r["sourceKey"]: r for r in fx}
    index = FixtureIndex(fx)
    docs = {}
    for g in gold["kararlar"]:
        r = by_key[g["sourceKey"]]
        docs[g["sourceKey"]] = measure_doc(r["text"], RecordMeta(r["id"], r["esasNo"], r["kararNo"], r["court"], r.get("chamber")), index, g)
    return summarize(docs)


def run_sentetik() -> Dict[str, Any]:
    gold = json.loads((HERE / "altin" / "sentetik.json").read_text(encoding="utf-8"))
    docs = {}
    for v in gold["vakalar"]:
        docs[v["id"]] = measure_doc(v["metin"], RecordMeta(v["id"]), FixtureIndex([]), {**v, "alt_mahkeme_anmalari": 0})
    return summarize(docs)


def summarize(docs: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    tot = {"karar": [0, 0, 0], "doktrin": [0, 0, 0]}
    for d in docs.values():
        for k in tot:
            tot[k][0] += d[k]["tp"]
            tot[k][1] += d[k]["fp"]
            tot[k][2] += d[k]["fn"]
    return {
        "belgeler": docs,
        "toplam": {k: {"tp": v[0], "fp": v[1], "fn": v[2], **prf(*v)} for k, v in tot.items()},
        "alan_hatasi": sum(len(d["karar"]["alan_hatasi"]) for d in docs.values()),
        "alt_mahkeme_uyumsuz": [i for i, d in docs.items() if d["alt_mahkeme"]["beklenen"] != d["alt_mahkeme"]["bulunan"]],
        "yayimlanan_kenar": sum(d["yayimlanan_kenar"] for d in docs.values()),
    }


def pct(x: Optional[float]) -> str:
    return "ölçülemedi (payda 0)" if x is None else f"%{x * 100:.1f}".replace(".", ",")


def report_md(res: Dict[str, Any]) -> str:
    lines = ["# Atıf ağı ölçüm raporu (Dalga 2)", "", f"Eşikler: yayın {PUBLISH_MIN}, kuyruk {QUEUE_MIN}. Hedef eşik: kenar kesinliği %95 ve üstü (plan 15.3/4).", ""]
    lines += ["## Yayın kapısı (15.3/4)", "", "| Ölçüt | Sonuç |", "|---|---|",
              "| 100 kararlık altın set, yayımlanan kenarlarda kesinlik >= %95 | ölçülmedi: altın set ve gerçek karar corpusu yok; geçmedi sayılır |",
              "| Modelli (Haiku 5.5 Batch) çıkarım karşılaştırması | ölçülmedi: gerçek model çağrısı yapılmadı |", ""]
    for ad, r in res["kumeler"].items():
        t = r["toplam"]
        lines += [f"## {ad}", "",
                  "| Tür | doğru | yanlış | kaçan | kesinlik | duyarlılık |", "|---|---|---|---|---|---|"]
        for k in ("karar", "doktrin"):
            lines.append(f"| {k} | {t[k]['tp']} | {t[k]['fp']} | {t[k]['fn']} | {pct(t[k]['kesinlik'])} | {pct(t[k]['duyarlilik'])} |")
        lines += ["", f"Alan hatası (mahkeme, daire, tarih): {r['alan_hatasi']}. Alt mahkeme sayısı uyumsuz belge: {r['alt_mahkeme_uyumsuz'] or 'yok'}.",
                  f"Yayına uygun kenar (karar: hedefi corpusta çözülmüş, doktrin: güven >= eşik): {r['yayimlanan_kenar']}.", ""]
    lines += ["## Sınırlar", "",
              "- ornek-7 yalnız 7 karardır ve 8 karar atfı ile 4 doktrin atfı içerir; sonuç yayın kapısı kanıtı değildir.",
              "- Gold etiketleri metin okunarak ve ham sayı taramasıyla elle çıkarıldı; çıkarıcının çıktısına bakılarak doğrulandı, bu yüzden bağımsız değildir.",
              "- Hedef kayıtlar gerçek corpusta olmadığı için 'yayımlanan kenar kesinliği' ölçülemedi; ölçülen 'kenar kimliği kesinliği'dir.",
              "- Yıl içermeyen eski numara biçimi (ör. 7803-9629 sayılı ilam) desteklenmez; bilinen kapsam dışıdır.", ""]
    return "\n".join(lines)


def main(argv: Sequence[str]) -> int:
    if not FIXTURE.exists():
        print("packages/casuist/fixtures/kayitlar.json yok: ornek-7 ölçülemedi", file=sys.stderr)
        return 2
    fx = json.loads(FIXTURE.read_text(encoding="utf-8"))["kayitlar"]
    res = {"surum": "atif-1.0", "kumeler": {"ornek-7": run_ornek7(fx), "sentetik": run_sentetik()},
           "kapi_15_3_4": "ölçülmedi", "esikler": {"yayin": PUBLISH_MIN, "kuyruk": QUEUE_MIN}}
    md = report_md(res)
    print(md)
    if "--yaz" in argv:
        out = HERE / "raporlar"
        out.mkdir(exist_ok=True)
        (out / "dalga-2.json").write_text(json.dumps(res, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        (out / "dalga-2.md").write_text(md + "\n", encoding="utf-8")
    bad = [ad for ad, r in res["kumeler"].items() if any((r["toplam"][k]["kesinlik"] or 1.0) < THRESHOLD for k in ("karar", "doktrin"))]
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
