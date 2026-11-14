"""Install time check of an embedding model folder against its kazuist_manifest.json.

  python -m nlp.model_check /models/embed/<key> [--quantized]

The folder is produced by eval/embed/hazirla.py and mounted read only into worker-py (KAZUIST_EMBED_DIR). The
check passes when the manifest names a known candidate with the revision and licence pinned in
nlp.embedder.CANDIDATES, the files the runtime loads are present (tokenizer.json and model_quantized.onnx with
--quantized, otherwise model.onnx) and every file of the folder that the manifest lists has the recorded
sha256. Files the manifest lists but the folder leaves out (the fp32 graph next to an int8 only deployment) are
fine. Only file names and verdicts are printed; exit status 0 means usable, 1 means not.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import List

from .embedder import CANDIDATES, MANIFEST


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def check(model_dir: Path, quantized: bool) -> List[str]:
    """Problems found, empty when the folder is usable."""
    try:
        manifest = json.loads((model_dir / MANIFEST).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return [f"{MANIFEST} missing or unreadable"]
    if not isinstance(manifest, dict):
        return [f"{MANIFEST} is not an object"]
    key = manifest.get("key")
    if key not in CANDIDATES:
        return ["manifest key is not a known candidate"]
    problems: List[str] = []
    if model_dir.name != key:
        problems.append(f"folder name {model_dir.name} differs from manifest key {key}")
    c = CANDIDATES[key]
    if manifest.get("revision") != c.revision:
        problems.append("revision differs from the pinned revision")
    if manifest.get("license") != c.license:
        problems.append("license differs from the pinned license")
    needed = ["tokenizer.json", "model_quantized.onnx" if quantized else "model.onnx"]
    for name in needed:
        if not (model_dir / name).is_file():
            problems.append(f"{name} missing")
    sums = manifest.get("files_sha256")
    if not isinstance(sums, dict):
        return problems + ["files_sha256 missing"]
    for name in needed:
        if name not in sums:
            problems.append(f"{name} not listed in files_sha256")
    for name, want in sorted(sums.items()):
        path = model_dir / name
        if path.is_file() and _sha256(path) != want:
            problems.append(f"{name} sha256 mismatch")
    return problems


def main(argv: List[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m nlp.model_check")
    ap.add_argument("model_dir", type=Path)
    ap.add_argument("--quantized", action="store_true", help="the deployment loads model_quantized.onnx")
    args = ap.parse_args(argv)
    problems = check(args.model_dir, args.quantized)
    for p in problems:
        print(f"FAIL {p}")
    if not problems:
        print(f"OK {args.model_dir.name}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
