"""Passage and query embeddings for the chunks table (plan 5.3 and 7.2/3, ADR-0006).

Plan: the model runs on our own server with ONNX Runtime on CPU and is one of three candidates chosen by the
eval/embed measurement (nDCG@10 and CPU latency). No candidate has been measured or chosen yet, so nothing is
configured by default and the worker writes chunks without vectors; search then reports the vector leg as
degraded and still answers from the full text and identity legs.

Configuration (all optional):
  KAZUIST_EMBED_BACKEND    one CANDIDATES key; unset or "none" disables vectors
  KAZUIST_EMBED_DIR        root of the read only model volume, one folder per key
                           (default ~/.cache/kazuist-embed)
  KAZUIST_EMBED_THREADS    ONNX Runtime intra op threads (0 = library default)
  KAZUIST_EMBED_QUANTIZED  "1" loads model_quantized.onnx instead of model.onnx

A model folder holds model.onnx (or model_quantized.onnx), tokenizer.json and optionally kazuist_manifest.json
with the upstream revision. Nothing is downloaded at run time and no text leaves the process. The runtime
packages (onnxruntime, tokenizers, numpy) are the ner-runtime extra that the anonymizer already uses; they are
imported only when a backend is configured.

A configured backend that cannot be loaded does not stop the worker: it falls back to no vectors and logs the
reason (class names and keys only, never text). The model id stored in chunks.embedding_model is
"<key>@<revision>"; the web side's KAZUIST_EMBED_MODEL must name the same id, because vectors of different
models never mix (packages/casuist/src/vector.ts).
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Protocol, Sequence

# chunks.embedding is halfvec(1024) (packages/db, ADR-0006); a model of another size needs a schema ADR.
EMBED_DIMENSIONS = 1024
MANIFEST = "kazuist_manifest.json"

Log = Callable[..., None]


class PassageEmbedder(Protocol):
    """model is the chunks.embedding_model value; None means this embedder produces no vectors."""

    model: Optional[str]
    dimensions: int

    def embed(self, texts: Sequence[str], kind: str) -> List[List[float]]: ...


class NullEmbedder:
    """No vectors. reason is a short code for the log: not_configured, unknown_backend, model_missing,
    runtime_missing, load_failed, dimension_mismatch."""

    model: Optional[str] = None
    dimensions = 0

    def __init__(self, reason: str = "not_configured"):
        self.reason = reason

    def embed(self, texts: Sequence[str], kind: str) -> List[List[float]]:
        raise RuntimeError("no embedding model")


@dataclass(frozen=True)
class EmbedCandidate:
    """How a candidate turns token states into one vector and which prefixes it expects (model cards)."""

    hf_id: str
    pooling: str  # "cls", "mean" or "last" (last non padding token)
    query_prefix: str = ""
    passage_prefix: str = ""
    max_tokens: int = 512


# plan 5.3 candidates; all three produce 1024 dimensional vectors. Prefixes follow each model card and must be
# re-checked against the exact revision when eval/embed picks the winner.
CANDIDATES: Dict[str, EmbedCandidate] = {
    "bge-m3": EmbedCandidate("BAAI/bge-m3", "cls"),
    "multilingual-e5-large": EmbedCandidate("intfloat/multilingual-e5-large", "mean", "query: ", "passage: "),
    "qwen3-embedding-0.6b": EmbedCandidate(
        "Qwen/Qwen3-Embedding-0.6B",
        "last",
        "Instruct: Given a Turkish legal question, retrieve passages of legislation and court decisions that "
        "answer it\nQuery:",
    ),
}

# Output names some exports use for an already pooled sentence vector.
_POOLED_OUTPUTS = ("sentence_embedding", "dense_vecs", "embeddings")


def json_log(msg: str, **extra: Any) -> None:
    """Same line format as core.main.json_log; kept local so nlp does not import the worker entry point."""
    import time

    print(
        json.dumps(
            {
                "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "svc": "worker-py",
                "msg": msg,
                **extra,
            }
        ),
        flush=True,
    )


def pool(hidden: Any, mask: Any, how: str) -> Any:
    """(batch, tokens, dim) states and (batch, tokens) mask -> L2 normalised (batch, dim) float32 vectors."""
    import numpy as np  # type: ignore

    hidden = np.asarray(hidden, dtype=np.float32)
    mask = np.asarray(mask)
    if how == "cls":
        vec = hidden[:, 0, :]
    elif how == "mean":
        m = mask[:, :, None].astype(np.float32)
        vec = (hidden * m).sum(axis=1) / np.clip(m.sum(axis=1), 1e-9, None)
    elif how == "last":
        # Index of the last real token for right padding; with left padding that is the final column.
        last = mask.shape[1] - 1 - np.argmax(mask[:, ::-1] > 0, axis=1)
        vec = hidden[np.arange(hidden.shape[0]), last, :]
    else:
        raise ValueError("pooling")
    norm = np.linalg.norm(vec, axis=1, keepdims=True)
    return vec / np.clip(norm, 1e-12, None)


class OnnxEmbedder:
    """A candidate exported to ONNX, run on CPU. session and tokenizer may be injected (tests)."""

    batch_size = 16

    def __init__(self, candidate: EmbedCandidate, name: str, session: Any, tokenizer: Any):
        self.candidate = candidate
        self.model: Optional[str] = name
        self.dimensions = EMBED_DIMENSIONS
        self._sess = session
        self._inputs = {i.name for i in session.get_inputs()}
        self._outputs = [o.name for o in session.get_outputs()]
        self._tok = tokenizer
        pad = None
        for token in ("<pad>", "[PAD]", "<|endoftext|>"):
            pad = tokenizer.token_to_id(token)
            if pad is not None:
                break
        self._pad = pad or 0

    @classmethod
    def load(cls, model_dir: Path, key: str, threads: int = 0, quantized: bool = False) -> "OnnxEmbedder":
        import onnxruntime as ort  # type: ignore
        from tokenizers import Tokenizer  # type: ignore

        onnx = model_dir / ("model_quantized.onnx" if quantized else "model.onnx")
        if not onnx.is_file():
            raise FileNotFoundError(onnx.name)
        so = ort.SessionOptions()
        if threads > 0:
            so.intra_op_num_threads = threads
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        session = ort.InferenceSession(str(onnx), sess_options=so, providers=["CPUExecutionProvider"])
        tok = Tokenizer.from_file(str(model_dir / "tokenizer.json"))
        tok.no_padding()
        tok.enable_truncation(max_length=CANDIDATES[key].max_tokens)
        return cls(CANDIDATES[key], f"{key}@{_revision(model_dir)}", session, tok)

    def _batch(self, texts: Sequence[str]) -> List[List[float]]:
        import numpy as np  # type: ignore

        encs = self._tok.encode_batch(list(texts))
        width = max(1, max(len(e.ids) for e in encs))
        ids = np.full((len(encs), width), self._pad, dtype=np.int64)
        mask = np.zeros((len(encs), width), dtype=np.int64)
        for row, e in enumerate(encs):
            ids[row, : len(e.ids)] = e.ids
            mask[row, : len(e.ids)] = 1
        feeds = {"input_ids": ids, "attention_mask": mask}
        if "token_type_ids" in self._inputs:
            feeds["token_type_ids"] = np.zeros_like(ids)
        if "position_ids" in self._inputs:
            feeds["position_ids"] = np.clip(np.cumsum(mask, axis=1) - 1, 0, None)
        feeds = {k: v for k, v in feeds.items() if k in self._inputs}
        outs = dict(zip(self._outputs, self._sess.run(None, feeds), strict=True))
        pooled = next((outs[n] for n in _POOLED_OUTPUTS if n in outs), None)
        if pooled is not None:
            vec = np.asarray(pooled, dtype=np.float32)
            vec = vec / np.clip(np.linalg.norm(vec, axis=1, keepdims=True), 1e-12, None)
        else:
            vec = pool(outs[self._outputs[0]], mask, self.candidate.pooling)
        return vec.astype(float).tolist()

    def embed(self, texts: Sequence[str], kind: str) -> List[List[float]]:
        prefix = self.candidate.query_prefix if kind == "query" else self.candidate.passage_prefix
        out: List[List[float]] = []
        items = [prefix + t for t in texts]
        for i in range(0, len(items), self.batch_size):
            out.extend(self._batch(items[i : i + self.batch_size]))
        return out


def _revision(model_dir: Path) -> str:
    try:
        rev = json.loads((model_dir / MANIFEST).read_text(encoding="utf-8")).get("revision", "")
    except (OSError, ValueError, AttributeError):
        rev = ""
    return rev[:7] if isinstance(rev, str) and rev else "local"


def valid_vectors(vectors: Sequence[Sequence[float]], count: int) -> bool:
    """count vectors of EMBED_DIMENSIONS finite values (halfvec rejects NaN and infinity)."""
    return len(vectors) == count and all(
        len(v) == EMBED_DIMENSIONS and all(math.isfinite(x) for x in v) for v in vectors
    )


def embed_root(env: Mapping[str, str]) -> Path:
    return Path(env.get("KAZUIST_EMBED_DIR") or Path.home() / ".cache" / "kazuist-embed")


def embedder_from_env(env: Optional[Mapping[str, str]] = None, log: Log = json_log) -> PassageEmbedder:
    """The configured embedder or a NullEmbedder; never raises. Logs the outcome once, without text."""
    env = env if env is not None else os.environ
    key = (env.get("KAZUIST_EMBED_BACKEND") or "").strip()

    def disabled(reason: str, **extra: Any) -> NullEmbedder:
        log("embedding disabled, chunks are written without vectors", reason=reason, **extra)
        return NullEmbedder(reason)

    if not key or key == "none":
        return disabled("not_configured")
    if key not in CANDIDATES:
        return disabled("unknown_backend")
    model_dir = embed_root(env) / key
    if not (model_dir / "tokenizer.json").is_file():
        return disabled("model_missing", backend=key)
    try:
        threads = int(env.get("KAZUIST_EMBED_THREADS") or 0)
    except ValueError:
        threads = 0
    try:
        emb = OnnxEmbedder.load(model_dir, key, threads, env.get("KAZUIST_EMBED_QUANTIZED") == "1")
    except ImportError:
        return disabled("runtime_missing", backend=key)
    except FileNotFoundError:
        return disabled("model_missing", backend=key)
    except Exception as exc:  # noqa: BLE001 - a broken export must not stop the worker; class name only
        return disabled("load_failed", backend=key, error=type(exc).__name__)
    try:
        probe = emb.embed(["kazuist"], "passage")
    except Exception as exc:  # noqa: BLE001
        return disabled("load_failed", backend=key, error=type(exc).__name__)
    if not valid_vectors(probe, 1):
        return disabled("dimension_mismatch", backend=key)
    log("embedding ready", model=emb.model)
    return emb
