"""Install check for the NER model folders (docs/runbook/dagitim.md, "worker-py model birimleri").

    python -m anonymizer.model_check                                 # KAZUIST_NER_BACKEND under KAZUIST_NER_DIR
    python -m anonymizer.model_check --spec akdeniz27 --root /models/ner

For every key: the folder exists; kazuist_manifest.json (eval/anon/export_ner.py) names the same key and the
revision pinned in ner.CANDIDATES; every ONNX file it lists matches its sha256; the file the backend will load
(KAZUIST_NER_QUANTIZED) is one of them. Then the backend loads and must find the person in a synthetic sentence.
Prints "OK <backend name>" or "FAIL <key>: <reasons>", never record text; exits 0 only when everything passes.
An empty spec fails, because the check exists for deployments, where a model is required (ner.ner_required).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import List, Optional

from .ner import CANDIDATES, MANIFEST, _onnx_file, load_backend, ner_root, parse_spec

# Synthetic sentence; the name is made up.
PROBE = "Olay günü tanık olarak dinlenen Mehmet Karaca beyanında bulunmuştur."
PROBE_NAME = "Mehmet Karaca"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def check_folder(key: str, root: Path) -> List[str]:
    """Problems with one model folder; empty when it is complete and unchanged since export."""
    folder = root / key
    if not folder.is_dir():
        return [f"folder missing: {folder}"]
    try:
        manifest = json.loads((folder / MANIFEST).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return [f"{MANIFEST} missing or unreadable"]
    problems: List[str] = []
    if manifest.get("key") != key:
        problems.append("manifest key differs")
    pinned = CANDIDATES[key].revision
    if pinned and manifest.get("revision") != pinned:
        problems.append("manifest revision differs from ner.CANDIDATES")
    sums = manifest.get("onnx_sha256") or {}
    if not sums:
        problems.append("manifest lists no ONNX file")
    for name, digest in sorted(sums.items()):
        path = folder / name
        if not path.is_file():
            problems.append(f"{name} missing")
        elif _sha256(path) != digest:
            problems.append(f"{name} sha256 mismatch")
    try:
        loaded = _onnx_file(folder)
        if sums and loaded.name not in sums:
            problems.append(f"{loaded.name} not in manifest")
    except FileNotFoundError:
        problems.append("ONNX file the backend loads is missing")
    return problems


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Check NER model folders before the worker starts.")
    ap.add_argument("--spec", default=None, help="backend spec, default KAZUIST_NER_BACKEND")
    ap.add_argument("--root", type=Path, default=None, help="model root, default KAZUIST_NER_DIR")
    args = ap.parse_args(argv)
    spec = os.environ.get("KAZUIST_NER_BACKEND", "") if args.spec is None else args.spec
    root = args.root or ner_root()
    try:
        keys = parse_spec(spec)
    except KeyError as exc:
        print(f"FAIL unknown key: {exc.args[0]}")
        return 1
    if not keys:
        print("FAIL no NER backend configured (KAZUIST_NER_BACKEND is empty)")
        return 1
    failed = False
    for key in keys:
        problems = check_folder(key, root)
        if problems:
            failed = True
            print(f"FAIL {key}: " + "; ".join(problems))
    if failed:
        return 1
    try:
        backend = load_backend("+".join(keys), root)
    except Exception as exc:  # noqa: BLE001 - class name only
        print(f"FAIL load: {type(exc).__name__}")
        return 1
    at = PROBE.index(PROBE_NAME)
    spans = backend.detect(PROBE)
    if not any(s.entity == "PERSON" and s.start <= at and s.end >= at + len(PROBE_NAME) for s in spans):
        print(f"FAIL {backend.name}: the synthetic probe name was not found")
        return 1
    print(f"OK {backend.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
