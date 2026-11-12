"""Embedder selection never stops the worker and never logs text; ONNX plumbing is checked with a fake session
(numpy only, skipped where the ner-runtime extra is not installed). No real model is loaded here."""

from __future__ import annotations

import json
import math
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List

import pytest

from nlp import embedder as E
from nlp.embedder import (
    CANDIDATES,
    EMBED_DIMENSIONS,
    NullEmbedder,
    OnnxEmbedder,
    embedder_from_env,
    valid_vectors,
)


class Logs:
    def __init__(self) -> None:
        self.lines: List[tuple] = []

    def __call__(self, msg: str, **extra: Any) -> None:
        self.lines.append((msg, extra))


def model_dir(root: Path, key: str = "bge-m3", revision: str = "") -> Path:
    d = root / key
    d.mkdir(parents=True)
    (d / "tokenizer.json").write_text("{}", encoding="utf-8")
    if revision:
        (d / E.MANIFEST).write_text(json.dumps({"revision": revision}), encoding="utf-8")
    return d


@pytest.mark.parametrize(
    "env,reason",
    [
        ({}, "not_configured"),
        ({"KAZUIST_EMBED_BACKEND": "none"}, "not_configured"),
        ({"KAZUIST_EMBED_BACKEND": "e5-small"}, "unknown_backend"),
    ],
)
def test_disabled_without_a_known_backend(env: Dict[str, str], reason: str) -> None:
    logs = Logs()
    emb = embedder_from_env(env, logs)
    assert isinstance(emb, NullEmbedder) and emb.model is None and emb.reason == reason
    assert logs.lines == [("embedding disabled, chunks are written without vectors", {"reason": reason})]


def test_missing_model_folder_falls_back_to_no_vectors(tmp_path: Path) -> None:
    logs = Logs()
    emb = embedder_from_env({"KAZUIST_EMBED_BACKEND": "bge-m3", "KAZUIST_EMBED_DIR": str(tmp_path)}, logs)
    assert isinstance(emb, NullEmbedder) and emb.reason == "model_missing"
    assert logs.lines[0][1] == {"reason": "model_missing", "backend": "bge-m3"}


@pytest.mark.parametrize(
    "exc,reason",
    [
        (ImportError("onnxruntime"), "runtime_missing"),
        (FileNotFoundError("model.onnx"), "model_missing"),
        (RuntimeError("bad graph"), "load_failed"),
    ],
)
def test_load_errors_fall_back_to_no_vectors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, exc: Exception, reason: str
) -> None:
    model_dir(tmp_path)

    def boom(*_a: Any, **_k: Any) -> Any:
        raise exc

    monkeypatch.setattr(OnnxEmbedder, "load", classmethod(lambda cls, *a, **k: boom()))
    logs = Logs()
    emb = embedder_from_env({"KAZUIST_EMBED_BACKEND": "bge-m3", "KAZUIST_EMBED_DIR": str(tmp_path)}, logs)
    assert isinstance(emb, NullEmbedder) and emb.reason == reason
    extra = logs.lines[0][1]
    assert extra["reason"] == reason and set(extra) <= {"reason", "backend", "error"}
    assert "bad graph" not in json.dumps(logs.lines)


class Probe:
    def __init__(self, dims: int) -> None:
        self.model = "bge-m3@abcdef1"
        self.dimensions = dims

    def embed(self, texts: List[str], kind: str) -> List[List[float]]:
        return [[0.0] * self.dimensions for _ in texts]


@pytest.mark.parametrize("dims,ready", [(EMBED_DIMENSIONS, True), (768, False)])
def test_a_loaded_model_is_probed_for_1024_dimensions(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, dims: int, ready: bool
) -> None:
    model_dir(tmp_path)
    monkeypatch.setattr(OnnxEmbedder, "load", classmethod(lambda cls, *a, **k: Probe(dims)))
    logs = Logs()
    emb = embedder_from_env({"KAZUIST_EMBED_BACKEND": "bge-m3", "KAZUIST_EMBED_DIR": str(tmp_path)}, logs)
    if ready:
        assert emb.model == "bge-m3@abcdef1"
        assert logs.lines == [("embedding ready", {"model": "bge-m3@abcdef1"})]
    else:
        assert isinstance(emb, NullEmbedder) and emb.reason == "dimension_mismatch"


def test_revision_comes_from_the_manifest(tmp_path: Path) -> None:
    assert E._revision(model_dir(tmp_path, "bge-m3", "0123456789abcdef")) == "0123456"
    assert E._revision(model_dir(tmp_path, "multilingual-e5-large")) == "local"


def test_valid_vectors() -> None:
    ok = [[0.0] * EMBED_DIMENSIONS]
    assert valid_vectors(ok, 1)
    assert not valid_vectors(ok, 2)
    assert not valid_vectors([[0.0] * 3], 1)
    assert not valid_vectors([[math.inf] + [0.0] * (EMBED_DIMENSIONS - 1)], 1)


def test_candidates_are_the_three_from_the_plan() -> None:
    assert set(CANDIDATES) == {"bge-m3", "multilingual-e5-large", "qwen3-embedding-0.6b"}
    assert CANDIDATES["multilingual-e5-large"].passage_prefix == "passage: "


# --- ONNX plumbing with fakes (numpy) ---------------------------------------------------------------------


def test_pooling_variants() -> None:
    np = pytest.importorskip("numpy")
    hidden = np.array([[[1.0, 0.0], [0.0, 1.0], [9.0, 9.0]]])
    mask = np.array([[1, 1, 0]])
    assert np.allclose(E.pool(hidden, mask, "cls"), [[1.0, 0.0]])
    assert np.allclose(E.pool(hidden, mask, "mean"), [[math.sqrt(0.5), math.sqrt(0.5)]])
    assert np.allclose(E.pool(hidden, mask, "last"), [[0.0, 1.0]])  # padding ignored
    with pytest.raises(ValueError):
        E.pool(hidden, mask, "max")


class FakeTokenizer:
    def __init__(self) -> None:
        self.inputs: List[str] = []

    def token_to_id(self, token: str) -> Any:
        return 1 if token == "<pad>" else None

    def encode_batch(self, texts: List[str]) -> List[Any]:
        self.inputs.extend(texts)
        return [SimpleNamespace(ids=list(range(2, 2 + 1 + len(t) % 5))) for t in texts]


class FakeSession:
    def __init__(self, inputs: List[str], outputs: List[str]) -> None:
        self._in = inputs
        self._out = outputs
        self.feeds: List[Dict[str, Any]] = []

    def get_inputs(self) -> List[Any]:
        return [SimpleNamespace(name=n) for n in self._in]

    def get_outputs(self) -> List[Any]:
        return [SimpleNamespace(name=n) for n in self._out]

    def run(self, _names: Any, feeds: Dict[str, Any]) -> List[Any]:
        import numpy as np

        self.feeds.append(feeds)
        b, t = feeds["input_ids"].shape
        if self._out[0] == "sentence_embedding":
            return [np.full((b, EMBED_DIMENSIONS), 3.0), np.ones((b, t, EMBED_DIMENSIONS))]
        return [np.ones((b, t, EMBED_DIMENSIONS))]


def test_onnx_embedder_prefixes_pads_batches_and_normalises() -> None:
    np = pytest.importorskip("numpy")
    sess = FakeSession(["input_ids", "attention_mask", "token_type_ids"], ["last_hidden_state"])
    tok = FakeTokenizer()
    emb = OnnxEmbedder(CANDIDATES["multilingual-e5-large"], "multilingual-e5-large@local", sess, tok)
    texts = [f"metin {i}" * (i % 3 + 1) for i in range(20)]
    vecs = emb.embed(texts, "passage")
    assert len(vecs) == 20 and all(len(v) == EMBED_DIMENSIONS for v in vecs)
    assert all(abs(math.fsum(x * x for x in v) - 1.0) < 1e-5 for v in vecs)
    assert tok.inputs == [f"passage: {t}" for t in texts]
    assert [f["input_ids"].shape[0] for f in sess.feeds] == [16, 4]
    first = sess.feeds[0]
    assert set(first) == {"input_ids", "attention_mask", "token_type_ids"}  # position_ids not declared
    assert first["input_ids"][first["attention_mask"] == 0].tolist() == [1] * int(
        (first["attention_mask"] == 0).sum()
    )
    emb.embed(["soru"], "query")
    assert tok.inputs[-1] == "query: soru"
    assert np.asarray(vecs).dtype == np.float64


def test_onnx_embedder_uses_a_pooled_output_and_position_ids_when_declared() -> None:
    pytest.importorskip("numpy")
    sess = FakeSession(
        ["input_ids", "attention_mask", "position_ids"], ["sentence_embedding", "token_embeddings"]
    )
    emb = OnnxEmbedder(
        CANDIDATES["qwen3-embedding-0.6b"], "qwen3-embedding-0.6b@local", sess, FakeTokenizer()
    )
    [v] = emb.embed(["bir pasaj"], "passage")
    assert abs(v[0] - 1 / math.sqrt(EMBED_DIMENSIONS)) < 1e-6
    feeds = sess.feeds[0]
    assert set(feeds) == {"input_ids", "attention_mask", "position_ids"}
    assert feeds["position_ids"].tolist()[0][0] == 0
