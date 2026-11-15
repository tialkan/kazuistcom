"""Install time model folder check (nlp.model_check): pinned revision and licence, required files, sha256."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict

import pytest

from nlp.embedder import CANDIDATES, MANIFEST
from nlp.model_check import check, main

KEY = "bge-m3"


def folder(root: Path, files: Dict[str, bytes], **overrides: object) -> Path:
    d = root / KEY
    d.mkdir()
    for name, data in files.items():
        (d / name).write_bytes(data)
    c = CANDIDATES[KEY]
    manifest = {
        "key": KEY,
        "revision": c.revision,
        "license": c.license,
        "files_sha256": {n: hashlib.sha256(b).hexdigest() for n, b in files.items()},
        **overrides,
    }
    (d / MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")
    return d


FILES = {"tokenizer.json": b"{}", "model_quantized.onnx": b"q8", "model.onnx": b"fp32"}


def test_a_complete_folder_passes(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    d = folder(tmp_path, FILES)
    assert check(d, quantized=True) == [] and check(d, quantized=False) == []
    assert main([str(d), "--quantized"]) == 0
    assert capsys.readouterr().out.strip() == "OK bge-m3"


def test_an_int8_only_deployment_may_leave_the_fp32_graph_out(tmp_path: Path) -> None:
    d = folder(tmp_path, FILES)
    (d / "model.onnx").unlink()
    assert check(d, quantized=True) == []
    assert check(d, quantized=False) == ["model.onnx missing"]


def test_a_changed_file_fails(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    d = folder(tmp_path, FILES)
    (d / "model_quantized.onnx").write_bytes(b"tampered")
    assert check(d, quantized=True) == ["model_quantized.onnx sha256 mismatch"]
    assert main([str(d), "--quantized"]) == 1
    assert "FAIL model_quantized.onnx sha256 mismatch" in capsys.readouterr().out


@pytest.mark.parametrize(
    "overrides,problem",
    [
        ({"revision": "0" * 40}, "revision differs from the pinned revision"),
        ({"license": "agpl-3.0"}, "license differs from the pinned license"),
    ],
)
def test_revision_and_licence_must_match_the_pins(
    tmp_path: Path, overrides: Dict[str, object], problem: str
) -> None:
    assert check(folder(tmp_path, FILES, **overrides), quantized=True) == [problem]


def test_unknown_or_missing_manifest(tmp_path: Path) -> None:
    assert check(tmp_path, quantized=True) == [f"{MANIFEST} missing or unreadable"]
    d = folder(tmp_path, FILES, key="e5-small")
    assert check(d, quantized=True) == ["manifest key is not a known candidate"]


def test_required_files_must_be_listed(tmp_path: Path) -> None:
    d = folder(tmp_path, FILES)
    m = json.loads((d / MANIFEST).read_text(encoding="utf-8"))
    del m["files_sha256"]["tokenizer.json"]
    (d / MANIFEST).write_text(json.dumps(m), encoding="utf-8")
    assert check(d, quantized=True) == ["tokenizer.json not listed in files_sha256"]
