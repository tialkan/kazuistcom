"""Embedding adaylarını hazırlar (plan 5.3, 6.7; eval/embed): indirme, ONNX, int8 nicemleme, manifest.

Üç adım, her biri yeniden çalıştırılabilir:

  indir     Resmî Hugging Face deposundan, nlp/embedder.py CANDIDATES içindeki sabit revizyonla, yalnız
            gereken dosyaları <kök>/src/<aday> altına indirir. Her dosya Hub'ın bildirdiği özete karşı
            denetlenir (LFS dosyalarında sha256, diğerlerinde git blob sha1). Lisans revizyonun model
            kartından okunur ve CANDIDATES ile karşılaştırılır.
  hazirla   <kök>/<aday> klasörünü kurar: model.onnx (+ dış veri), tokenizer.json, model kartı ve
            kazuist_manifest.json. BGE-M3 ve multilingual-e5-large için deponun kendi ONNX dışa aktarımı
            kullanılır; Qwen3-Embedding-0.6B'nin resmî ONNX'i olmadığı için safetensors ağırlıklarından
            torch.onnx ile dışa aktarılır ve Torch ile eşdeğerliği ölçülür.
  nicemle   model_quantized.onnx (dinamik int8, onnxruntime.quantization) üretir ve fp32 ile int8 vektörleri
            arasındaki kosinüs uyumunu manifeste yazar.

<kök> KAZUIST_EMBED_DIR'dir (öntanım ~/.cache/kazuist-embed); depo DIŞINDADIR. Çalışma anında hiçbir şey
indirilmez; bu betik yalnız hazırlık içindir ve ağa yalnız "indir" adımında çıkar.

Kullanım (services/worker-py içinden; torch ve transformers yalnız Qwen3 dışa aktarımı için gerekir):
  uv run --extra ner --extra ner-runtime python -I ../../eval/embed/hazirla.py indir [--only bge-m3]
  uv run --extra ner --extra ner-runtime python -I ../../eval/embed/hazirla.py hazirla [--only ...]
  uv run --extra ner --extra ner-runtime python -I ../../eval/embed/hazirla.py nicemle [--only ...]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import time
from pathlib import Path
from typing import Dict, List

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "services" / "worker-py"))

from nlp.embedder import CANDIDATES, MANIFEST, embed_root  # noqa: E402

# Files taken from each pinned revision. "onnx" candidates ship an official export under onnx/; "export"
# candidates are converted here from safetensors.
SOURCES: Dict[str, Dict[str, object]] = {
    "bge-m3": {
        "kind": "onnx",
        "files": [
            "onnx/model.onnx",
            "onnx/model.onnx_data",
            "onnx/Constant_7_attr__value",
            "onnx/tokenizer.json",
            "onnx/tokenizer_config.json",
            "onnx/special_tokens_map.json",
            "onnx/config.json",
            "1_Pooling/config.json",
            "README.md",
        ],
    },
    "multilingual-e5-large": {
        "kind": "onnx",
        "files": [
            "onnx/model.onnx",
            "onnx/model.onnx_data",
            "onnx/tokenizer.json",
            "onnx/tokenizer_config.json",
            "onnx/special_tokens_map.json",
            "onnx/config.json",
            "1_Pooling/config.json",
            "README.md",
        ],
    },
    "qwen3-embedding-0.6b": {
        "kind": "export",
        "files": [
            "model.safetensors",
            "config.json",
            "generation_config.json",
            "tokenizer.json",
            "tokenizer_config.json",
            "vocab.json",
            "merges.txt",
            "1_Pooling/config.json",
            "config_sentence_transformers.json",
            "modules.json",
            "README.md",
        ],
    },
}

# Short Turkish legal sentences (written for this script, no personal data) for parity checks.
PARITY_TEXTS = [
    "Kişisel veriler, işlenmesini gerektiren sebeplerin ortadan kalkması hâlinde silinir.",
    "Haksız fiil sorumluluğunda zarar gören, zararını ve failin kusurunu ispat etmekle yükümlüdür.",
    "Anayasa Mahkemesi kararları Resmî Gazetede hemen yayımlanır ve yasama, yürütme ve yargı organlarını bağlar.",
    "İlgili kişi, veri sorumlusuna başvurarak kişisel verisinin işlenip işlenmediğini öğrenebilir.",
    "Temel hak ve hürriyetler, özlerine dokunulmaksızın yalnızca Anayasanın ilgili maddelerinde belirtilen "
    "sebeplere bağlı olarak ve ancak kanunla sınırlanabilir.",
    "Yargıtay ceza dairesi, verileri hukuka aykırı olarak verme suçundan kurulan beraat hükmünü bozmuştur.",
    "Kira",
    "query: kıdem tazminatı",
]


def src_dir(key: str) -> Path:
    return embed_root(os.environ) / "src" / key


def out_dir(key: str) -> Path:
    return embed_root(os.environ) / key


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def git_blob_sha1(p: Path) -> str:
    data = p.read_bytes()
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def versions() -> Dict[str, str]:
    out = {}
    for mod in ("torch", "transformers", "onnxruntime", "onnx", "tokenizers", "numpy", "huggingface_hub"):
        try:
            out[mod] = __import__(mod).__version__
        except Exception:  # noqa: BLE001
            pass
    return out


def front_matter_license(readme: Path) -> str:
    """license value of the README's YAML front matter (the model card metadata block)."""
    import yaml  # type: ignore

    text = readme.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return ""
    end = text.find("\n---", 3)
    meta = yaml.safe_load(text[3:end]) or {}
    return str(meta.get("license") or "")


# ---------------------------------------------------------------------------------------------------------


def download(key: str) -> dict:
    from huggingface_hub import HfApi, hf_hub_download  # type: ignore

    c = CANDIDATES[key]
    files: List[str] = SOURCES[key]["files"]  # type: ignore[assignment]
    info = HfApi().model_info(c.hf_id, revision=c.revision, files_metadata=True)
    if info.sha != c.revision:
        raise SystemExit(f"{key}: hub answered revision {info.sha}, pinned {c.revision}")
    meta = {s.rfilename: s for s in info.siblings or []}
    card_license = str((info.card_data or {}).get("license") or "")
    dest = src_dir(key)
    dest.mkdir(parents=True, exist_ok=True)
    checked = {}
    for f in files:
        if f not in meta:
            raise SystemExit(f"{key}: {f} is not in revision {c.revision}")
        path = Path(hf_hub_download(c.hf_id, f, revision=c.revision, local_dir=str(dest)))
        s = meta[f]
        if s.lfs is not None:
            got, want, algo = sha256(path), s.lfs.sha256, "sha256"
        else:
            got, want, algo = git_blob_sha1(path), s.blob_id, "git-sha1"
        if got != want:
            raise SystemExit(f"{key}: {f} {algo} mismatch")
        checked[f] = {"size": path.stat().st_size, algo: got}
    readme_license = front_matter_license(dest / "README.md")
    if not (card_license == readme_license == c.license):
        raise SystemExit(f"{key}: license card={card_license} readme={readme_license} pinned={c.license}")
    record = {
        "hf_id": c.hf_id,
        "revision": c.revision,
        "license": c.license,
        "license_source": f"https://huggingface.co/{c.hf_id}/blob/{c.revision}/README.md (front matter)",
        "downloaded_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "files": checked,
    }
    (dest / "kazuist_download.json").write_text(json.dumps(record, indent=1) + "\n", encoding="utf-8")
    print(f"{key}: {len(checked)} files verified, license {c.license}")
    return record


def _place(src: Path, dst: Path) -> None:
    """Copy on write clone where the file system supports it (APFS, btrfs, XFS), so the 2 GB weights are not
    duplicated on disk; a plain copy otherwise. Not a hard link: onnx refuses external data with several links."""
    import subprocess

    if dst.exists():
        dst.unlink()
    flag = "-c" if sys.platform == "darwin" else "--reflink=auto"
    if subprocess.run(["cp", flag, str(src), str(dst)], capture_output=True).returncode != 0:
        shutil.copy2(src, dst)


def _copy_official(key: str, src: Path, out: Path) -> None:
    for name in ("model.onnx", "model.onnx_data", "Constant_7_attr__value", "tokenizer.json"):
        if (src / "onnx" / name).exists():
            _place(src / "onnx" / name, out / name)


def _export_qwen3(src: Path, out: Path) -> dict:
    """last_hidden_state graph of Qwen3Model with dynamic batch and token axes; pooling stays in nlp.embedder."""
    import torch
    from transformers import AutoModel, AutoTokenizer  # type: ignore

    tok = AutoTokenizer.from_pretrained(str(src), local_files_only=True)
    ref = AutoModel.from_pretrained(
        str(src), local_files_only=True, use_safetensors=True, dtype=torch.float32, attn_implementation="eager"
    ).eval()

    class Hidden(torch.nn.Module):
        def __init__(self, model):
            super().__init__()
            self.model = model

        def forward(self, input_ids, attention_mask):
            return self.model(input_ids=input_ids, attention_mask=attention_mask, use_cache=False).last_hidden_state

    sample = tok(["Örnek bir metin", "İkinci, biraz daha uzun bir örnek metin"], padding=True, return_tensors="pt")
    # torch writes graphs over 2 GB with loose per tensor files; export into a scratch folder, then save one
    # model.onnx with one model.onnx_data next to it.
    tmp = out / "_export"
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir()
    try:
        torch.onnx.export(
            Hidden(ref).eval(),
            (sample["input_ids"], sample["attention_mask"]),
            str(tmp / "model.onnx"),
            dynamo=False,
            opset_version=17,
            input_names=["input_ids", "attention_mask"],
            output_names=["last_hidden_state"],
            dynamic_axes={
                "input_ids": {0: "batch", 1: "tokens"},
                "attention_mask": {0: "batch", 1: "tokens"},
                "last_hidden_state": {0: "batch", 1: "tokens"},
            },
        )
        _consolidate_external(tmp / "model.onnx", out)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    shutil.copy2(src / "tokenizer.json", out / "tokenizer.json")
    return _parity_vs_torch(ref, tok, out)


def _consolidate_external(exported: Path, out: Path) -> None:
    import onnx  # type: ignore

    for stale in ("model.onnx", "model.onnx_data"):
        (out / stale).unlink(missing_ok=True)
    model = onnx.load(str(exported))  # pulls in the external tensors that sit next to the exported graph
    onnx.save_model(
        model,
        str(out / "model.onnx"),
        save_as_external_data=True,
        all_tensors_to_one_file=True,
        location="model.onnx_data",
    )


def _parity_vs_torch(ref, tok, out: Path) -> dict:
    """Largest absolute difference of the pooled, normalised vectors between Torch and our ONNX runtime path."""
    import numpy as np
    import torch

    from nlp.embedder import OnnxEmbedder, pool

    emb = OnnxEmbedder.load(out, "qwen3-embedding-0.6b")
    worst = 0.0
    for text in PARITY_TEXTS:
        enc = tok([text], return_tensors="pt")
        with torch.no_grad():
            h = ref(**enc).last_hidden_state.numpy()
        a = pool(h, enc["attention_mask"].numpy(), "last")[0]
        b = np.asarray(emb._batch([text])[0])
        worst = max(worst, float(np.abs(a - b).max()))
    return {"max_abs_vector_diff_vs_torch": worst, "texts": len(PARITY_TEXTS)}


def prepare(key: str) -> None:
    c = CANDIDATES[key]
    src = src_dir(key)
    dl = json.loads((src / "kazuist_download.json").read_text(encoding="utf-8"))
    out = out_dir(key)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    parity: dict = {}
    if SOURCES[key]["kind"] == "onnx":
        _copy_official(key, src, out)
        parity = {"note": "official ONNX export of the pinned revision, used as published"}
    else:
        parity = _export_qwen3(src, out)
    shutil.copy2(src / "README.md", out / "README.md")
    for p in out.iterdir():
        if p.is_file():
            p.chmod(0o644)  # the worker runs as an unprivileged user over a read only mount
    manifest = {
        "key": key,
        "hf_id": c.hf_id,
        "revision": c.revision,
        "license": c.license,
        "license_source": dl["license_source"],
        "pooling": c.pooling,
        "query_prefix": c.query_prefix,
        "passage_prefix": c.passage_prefix,
        "max_tokens": c.max_tokens,
        "source": dl["files"],
        "files_sha256": {p.name: sha256(p) for p in sorted(out.iterdir()) if p.is_file() and p.name != MANIFEST},
        "prepared_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "prepare_seconds": round(time.time() - t0, 1),
        "versions": versions(),
        "parity": parity,
    }
    (out / MANIFEST).write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{key}: {out} ready ({manifest['prepare_seconds']} s)")


def quantize(key: str) -> None:
    import numpy as np
    from onnxruntime.quantization import QuantType, quantize_dynamic  # type: ignore

    from nlp.embedder import OnnxEmbedder

    out = out_dir(key)
    t0 = time.time()
    try:
        quantize_dynamic(
            str(out / "model.onnx"), str(out / "model_quantized.onnx"), weight_type=QuantType.QInt8
        )
    finally:
        # onnxruntime's shape inference leaves this next to the input when it fails.
        (out / "model-inferred.onnx").unlink(missing_ok=True)
    (out / "model_quantized.onnx").chmod(0o644)
    fp = OnnxEmbedder.load(out, key)
    q8 = OnnxEmbedder.load(out, key, quantized=True)
    cos = []
    for kind in ("query", "passage"):
        a = np.asarray(fp.embed(PARITY_TEXTS, kind))
        b = np.asarray(q8.embed(PARITY_TEXTS, kind))
        cos.extend((a * b).sum(axis=1).tolist())
    path = out / MANIFEST
    manifest = json.loads(path.read_text(encoding="utf-8"))
    manifest["files_sha256"]["model_quantized.onnx"] = sha256(out / "model_quantized.onnx")
    manifest["quantization"] = {
        "method": "onnxruntime.quantization.quantize_dynamic, weight_type QInt8",
        "seconds": round(time.time() - t0, 1),
        "cosine_fp32_vs_int8": {"min": round(min(cos), 5), "mean": round(float(np.mean(cos)), 5)},
    }
    manifest["versions"] = versions()
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{key}: int8 ready, cosine fp32/int8 min {min(cos):.4f}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["indir", "hazirla", "nicemle"])
    ap.add_argument("--only", action="append", choices=sorted(CANDIDATES))
    args = ap.parse_args()
    if args.step != "indir":
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    for key in args.only or sorted(CANDIDATES):
        {"indir": download, "hazirla": prepare, "nicemle": quantize}[args.step](key)


if __name__ == "__main__":
    main()
