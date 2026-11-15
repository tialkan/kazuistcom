"""NER install check without real models: folders, manifest and sha256 are built in tmp_path."""

from __future__ import annotations

import hashlib
import json

from anonymizer import model_check
from anonymizer.ner import CANDIDATES, MANIFEST
from anonymizer.spans import Span


def _folder(root, key="akdeniz27", onnx=b"onnx-bytes", **manifest):
    d = root / key
    d.mkdir(parents=True)
    (d / "model.onnx").write_bytes(onnx)
    m = {"key": key, "revision": CANDIDATES[key].revision,
         "onnx_sha256": {"model.onnx": hashlib.sha256(onnx).hexdigest()}}
    m.update(manifest)
    (d / MANIFEST).write_text(json.dumps(m), encoding="utf-8")
    return d


def test_empty_or_unknown_spec_fails(tmp_path, capsys, monkeypatch) -> None:
    monkeypatch.delenv("KAZUIST_NER_BACKEND", raising=False)
    assert model_check.main(["--root", str(tmp_path)]) == 1
    assert model_check.main(["--spec", "bilinmeyen", "--root", str(tmp_path)]) == 1
    out = capsys.readouterr().out
    assert "FAIL no NER backend" in out and "FAIL unknown key" in out


def test_folder_problems_are_reported(tmp_path, capsys) -> None:
    assert model_check.check_folder("akdeniz27", tmp_path)[0].startswith("folder missing")
    d = _folder(tmp_path, revision="0000000")
    (d / "model.onnx").write_bytes(b"changed")
    problems = model_check.check_folder("akdeniz27", tmp_path)
    assert "manifest revision differs from ner.CANDIDATES" in problems
    assert "model.onnx sha256 mismatch" in problems
    assert model_check.main(["--spec", "akdeniz27", "--root", str(tmp_path)]) == 1
    assert "FAIL akdeniz27" in capsys.readouterr().out


def test_complete_folder_loads_and_finds_the_probe(tmp_path, capsys, monkeypatch) -> None:
    _folder(tmp_path)
    assert model_check.check_folder("akdeniz27", tmp_path) == []

    class Fake:
        name = "akdeniz27@99995f7"

        def detect(self, text):
            i = text.index(model_check.PROBE_NAME)
            return [Span(i, i + len(model_check.PROBE_NAME), "PERSON", "ner:fake", 0.99)]

    monkeypatch.setattr(model_check, "load_backend", lambda spec, root: Fake())
    assert model_check.main(["--spec", "akdeniz27", "--root", str(tmp_path)]) == 0
    assert capsys.readouterr().out.strip() == "OK akdeniz27@99995f7"

    class Blind(Fake):
        def detect(self, text):
            return []

    monkeypatch.setattr(model_check, "load_backend", lambda spec, root: Blind())
    assert model_check.main(["--spec", "akdeniz27", "--root", str(tmp_path)]) == 1
    out = capsys.readouterr().out
    assert "probe name was not found" in out and model_check.PROBE_NAME not in out


def test_load_failure_prints_the_class_name_only(tmp_path, capsys, monkeypatch) -> None:
    _folder(tmp_path)

    def boom(spec, root):
        raise ImportError("onnxruntime")

    monkeypatch.setattr(model_check, "load_backend", boom)
    assert model_check.main(["--spec", "akdeniz27", "--root", str(tmp_path)]) == 1
    assert capsys.readouterr().out.strip() == "FAIL load: ImportError"
