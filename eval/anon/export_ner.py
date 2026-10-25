"""NER adaylarını ONNX'e çevirir ve Torch ile ONNX çıktısının eşdeğerliğini ölçer (plan 6.4/2).

Girdi: indirilmiş, sürümü sabitlenmiş ağırlıklar (depo DIŞINDA): --src (varsayılan ~/.cache/kazuist-ner/src/<aday>)
Çıktı: KAZUIST_NER_DIR/<aday> (varsayılan ~/.cache/kazuist-ner/<aday>): model.onnx, tokenizer, yapılandırma,
lisans dosyaları ve kazuist_manifest.json (kaynak sha256, ONNX sha256, sürümler, eşdeğerlik sonucu).

Ağ kapalı çalışır (HF_HUB_OFFLINE=1). Hushmark'ın indirilen yükleyicisi (hushmark_berturk.py) 2026-10-20'de
okundu: ağ çağrısı, alt süreç, eval/exec veya pickle yok; yalnız safetensors ve local_files_only=True. Bu betik
onu yalnız eşdeğerlik referansı olarak, sys.path'e eklemeden dosya yolundan yükler. Çalışma zamanı
(anonymizer/ner.py) bu kodu hiç yüklemez; ONNX grafiği Kazuist'in kendi modülünden üretilir.

Kullanım (services/worker-py içinden, ner extra kurulu):
  uv run python ../../eval/anon/export_ner.py [--only hushmark-berturk-112m] [--quantize]
"""

from __future__ import annotations

import os

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import argparse  # noqa: E402
import hashlib  # noqa: E402
import importlib.util  # noqa: E402
import json  # noqa: E402
import shutil  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Dict, List, Optional  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "services" / "worker-py"))

from anonymizer.ner import CANDIDATES, MANIFEST, ner_root  # noqa: E402

SRC = ner_root() / "src"
SET = HERE / "sentetik"


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def versions() -> Dict[str, str]:
    out = {}
    for mod in ("torch", "transformers", "onnxruntime", "onnx", "gliner", "tokenizers"):
        try:
            out[mod] = __import__(mod).__version__
        except Exception:  # noqa: BLE001
            pass
    return out


def texts(limit: int = 50) -> List[str]:
    return [json.loads(p.read_text(encoding="utf-8"))["text"] for p in sorted(SET.glob("*.json"))[:limit]]


def write_manifest(out: Path, key: str, src: Path, files: List[str], parity: dict, seconds: float) -> None:
    c = CANDIDATES[key]
    m = {
        "key": key, "hf_id": c.hf_id, "revision": c.revision, "license": c.license,
        "source_sha256": {f: sha256(src / f) for f in files},
        "onnx_sha256": {p.name: sha256(p) for p in sorted(out.glob("*.onnx"))},
        "exported_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "export_seconds": round(seconds, 1),
        "versions": versions(), "parity": parity,
    }
    (out / MANIFEST).write_text(json.dumps(m, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def quantize(out: Path) -> None:
    from onnxruntime.quantization import QuantType, quantize_dynamic  # type: ignore

    quantize_dynamic(str(out / "model.onnx"), str(out / "model_quantized.onnx"), weight_type=QuantType.QInt8)


# ---------------------------------------------------------------------------------------------------------


def export_token_classifier(ref, inputs, path: Path) -> None:
    """Export logits with dynamic batch/token axes, independent of Optimum.

    Explicit TorchScript export matches the established Hushmark export path.
    """
    import torch

    class Logits(torch.nn.Module):
        def __init__(self, model):
            super().__init__()
            self.model = model

        def forward(self, input_ids, attention_mask, token_type_ids):
            return self.model(input_ids=input_ids, attention_mask=attention_mask,
                              token_type_ids=token_type_ids).logits


    names = ["input_ids", "attention_mask", "token_type_ids"]
    args = tuple(inputs[name] for name in names)
    torch.onnx.export(
        Logits(ref).eval(), args, str(path), dynamo=False, opset_version=17,
        input_names=names, output_names=["logits"],
        dynamic_axes={name: {0: "batch", 1: "tokens"} for name in names + ["logits"]},
    )


def export_akdeniz(src: Path, out: Path) -> dict:
    import numpy as np
    import torch
    from transformers import AutoModelForTokenClassification, AutoTokenizer, pipeline

    from anonymizer.ner import OnnxTokenClassificationBackend

    tok = AutoTokenizer.from_pretrained(str(src), local_files_only=True)
    ref = AutoModelForTokenClassification.from_pretrained(
        str(src), local_files_only=True, use_safetensors=True, attn_implementation="eager"
    ).eval()

    export_token_classifier(ref, tok("Örnek metin", return_tensors="pt"), out / "model.onnx")
    ref.config.save_pretrained(str(out))
    for f in ("tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "vocab.txt", "README.md"):
        shutil.copy2(src / f, out / f)

    import onnxruntime as ort

    sess = ort.InferenceSession(str(out / "model.onnx"), providers=["CPUExecutionProvider"])
    names = {i.name for i in sess.get_inputs()}
    diff = 0.0
    for t in texts():
        enc = tok(t, return_tensors="np", truncation=True, max_length=512)
        with torch.no_grad():
            a = ref(**{k: torch.from_numpy(v) for k, v in enc.items()}).logits.numpy()
        b = sess.run(None, {k: v.astype(np.int64) for k, v in enc.items() if k in names})[0]
        diff = max(diff, float(np.abs(a - b).max()))
    # Span agreement against the transformers pipeline ("first" aggregation, PER only).
    pipe = pipeline("token-classification", model=ref, tokenizer=tok, aggregation_strategy="first")
    ours = OnnxTokenClassificationBackend(out, "akdeniz27", threshold=0.0)
    same = total = 0
    for t in texts():
        r = {(x["start"], x["end"]) for x in pipe(t) if x["entity_group"] == "PER"}
        o = {(s.start, s.end) for s in ours.detect(t) if s.entity == "PERSON"}
        total += len(r | o)
        same += len(r & o)
    return {"max_abs_logit_diff": diff, "per_span_agreement_vs_transformers_pipeline": same / max(1, total),
            "docs": len(texts())}


class _HushmarkGraph:  # built lazily so torch is imported only here
    @staticmethod
    def build(src: Path):
        import torch
        from safetensors.torch import load_file
        from torch import nn
        from torch.nn import functional as F
        from transformers import BertModel

        cfg = json.loads((src / "hushmark_span_config.json").read_text(encoding="utf-8"))

        class Graph(nn.Module):
            """Kazuist's own re-implementation of the Hushmark span head (start, end, mean word vectors and
            width embedding into a GELU MLP), fused with the encoder; batch size 1, every word valid."""

            def __init__(self, encoder, head, max_width):
                super().__init__()
                self.encoder = encoder
                self.width_embedding = nn.Embedding(*head["width_embedding.weight"].shape)
                w0, w3 = head["classifier.0.weight"], head["classifier.3.weight"]
                self.lin1 = nn.Linear(w0.shape[1], w0.shape[0])
                self.lin2 = nn.Linear(w3.shape[1], w3.shape[0])
                with torch.no_grad():
                    self.width_embedding.weight.copy_(head["width_embedding.weight"])
                    self.lin1.weight.copy_(w0)
                    self.lin1.bias.copy_(head["classifier.0.bias"])
                    self.lin2.weight.copy_(w3)
                    self.lin2.bias.copy_(head["classifier.3.bias"])
                self.max_width = max_width

            def forward(self, input_ids, attention_mask, token_type_ids, word_starts, span_starts, span_ends):
                hidden = self.encoder(input_ids=input_ids, attention_mask=attention_mask,
                                      token_type_ids=token_type_ids).last_hidden_state
                h = hidden.shape[-1]
                words = hidden.gather(1, word_starts.unsqueeze(-1).expand(-1, -1, h))
                si = span_starts.unsqueeze(-1).expand(-1, -1, h)
                ei = span_ends.unsqueeze(-1).expand(-1, -1, h)
                prefix = F.pad(words.cumsum(dim=1), (0, 0, 1, 0))
                widths = span_ends - span_starts + 1
                mean_v = (prefix.gather(1, (span_ends + 1).unsqueeze(-1).expand(-1, -1, h)) - prefix.gather(1, si)) \
                    / widths.clamp_min(1).unsqueeze(-1).to(hidden.dtype)
                feats = torch.cat([words.gather(1, si), words.gather(1, ei), mean_v,
                                   self.width_embedding(widths.clamp(0, self.max_width))], dim=-1)
                return self.lin2(F.gelu(self.lin1(feats))).softmax(dim=-1)

        enc = BertModel.from_pretrained(str(src / "encoder"), local_files_only=True, use_safetensors=True,
                                        add_pooling_layer=False).eval()
        return Graph(enc, load_file(str(src / "span_head.safetensors")), int(cfg["max_width"])).eval()


def export_hushmark(src: Path, out: Path) -> dict:
    import torch

    from anonymizer.ner import HushmarkOnnxBackend, word_units

    g = _HushmarkGraph.build(src)
    w = 6
    spans = [(s, e) for s in range(w) for e in range(s, min(w, s + 24))]
    ids = torch.ones(1, 12, dtype=torch.long)
    args = (ids, torch.ones_like(ids), torch.zeros_like(ids), torch.arange(1, w + 1).unsqueeze(0),
            torch.tensor([[s for s, _ in spans]]), torch.tensor([[e for _, e in spans]]))
    names = ["input_ids", "attention_mask", "token_type_ids", "word_starts", "span_starts", "span_ends"]
    torch.onnx.export(g, args, str(out / "model.onnx"), dynamo=False, opset_version=17, input_names=names,
                      output_names=["probs"],
                      dynamic_axes={"input_ids": {1: "t"}, "attention_mask": {1: "t"}, "token_type_ids": {1: "t"},
                                    "word_starts": {1: "w"}, "span_starts": {1: "s"}, "span_ends": {1: "s"},
                                    "probs": {1: "s"}})
    shutil.copy2(src / "tokenizer" / "tokenizer.json", out / "tokenizer.json")
    for f in ("hushmark_span_config.json", "LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "README.md"):
        shutil.copy2(src / f, out / f)

    # Parity against the reviewed reference loader on paragraphs that fit 256 subwords.
    spec = importlib.util.spec_from_file_location("hushmark_reference", src / "hushmark_berturk.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    ref = mod.BerturkSpanModel.load_artifact(src).eval()
    ours = HushmarkOnnxBackend(out, "hushmark-berturk-112m")
    paragraphs = [p for t in texts() for p in t.split("\n") if p.strip()]
    same = total = 0
    sdiff = 0.0
    skipped = 0
    for p in paragraphs:
        n_sub = len(ref.tokenizer([u[0] for u in word_units(p)], is_split_into_words=True)["input_ids"])
        if n_sub > 256:
            skipped += 1
            continue
        r = {(x["label"], x["start"], x["end"]): x["score"] for x in ref.predict_entities(p, list(ref.label_names), 0.5)}
        o = {(x["label"], x["start"], x["end"]): x["score"] for x in ours.raw(p)}
        total += len(set(r) | set(o))
        same += len(set(r) & set(o))
        for k in set(r) & set(o):
            sdiff = max(sdiff, abs(r[k] - o[k]))
    return {"paragraphs": len(paragraphs) - skipped, "skipped_over_256_subwords": skipped,
            "span_agreement_vs_reference_loader": same / max(1, total), "max_abs_score_diff": sdiff}


def export_gliner(src: Path, out: Path) -> dict:
    from gliner import GLiNER

    deb = SRC / "mdeberta-v3-base"  # backbone tokenizer and config (MIT), no weights
    prep = out / "_prepared"
    prep.mkdir(exist_ok=True)
    cfg = json.loads((src / "gliner_config.json").read_text(encoding="utf-8"))
    cfg["model_name"] = str(deb)
    (prep / "gliner_config.json").write_text(json.dumps(cfg), encoding="utf-8")
    link = prep / "model.safetensors"
    if not link.exists():
        link.symlink_to(src / "model.safetensors")
    ref = GLiNER.from_pretrained(str(prep), local_files_only=True)
    ref.export_to_onnx(str(out))
    shutil.copy2(src / "README.md", out / "README.md")
    ours = GLiNER.from_pretrained(str(out), load_onnx_model=True, local_files_only=True)
    labels = ["person", "address", "date of birth"]
    same = total = 0
    sdiff = 0.0
    for t in texts(20):
        for chunk in [t[i : i + 1000] for i in range(0, len(t), 1000)]:
            r = {(x["label"], x["start"], x["end"]): x["score"] for x in ref.predict_entities(chunk, labels, threshold=0.5)}
            o = {(x["label"], x["start"], x["end"]): x["score"] for x in ours.predict_entities(chunk, labels, threshold=0.5)}
            total += len(set(r) | set(o))
            same += len(set(r) & set(o))
            for k in set(r) & set(o):
                sdiff = max(sdiff, abs(r[k] - o[k]))
    return {"docs": 20, "span_agreement_torch_vs_onnx": same / max(1, total), "max_abs_score_diff": sdiff}


EXPORTERS = {
    "akdeniz27": (export_akdeniz, ["config.json", "model.safetensors", "tokenizer.json", "vocab.txt"]),
    "hushmark-berturk-112m": (export_hushmark, ["encoder/config.json", "encoder/model.safetensors",
                                                "span_head.safetensors", "hushmark_span_config.json",
                                                "tokenizer/tokenizer.json", "hushmark_berturk.py"]),
    "gliner-multi-v2.1": (export_gliner, ["gliner_config.json", "model.safetensors"]),
}


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=sorted(EXPORTERS))
    ap.add_argument("--quantize", action="store_true", help="ek olarak int8 dinamik nicemleme (model_quantized.onnx)")
    a = ap.parse_args(argv)
    for key, (fn, files) in EXPORTERS.items():
        if a.only and key != a.only:
            continue
        src, out = SRC / key, ner_root() / key
        if not src.is_dir():
            print(f"{key}: kaynak yok ({src}), atlandı")
            continue
        out.mkdir(parents=True, exist_ok=True)
        t0 = time.time()
        parity = fn(src, out)
        if a.quantize:
            quantize(out)
        write_manifest(out, key, src, files, parity, time.time() - t0)
        print(key, json.dumps(parity, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
