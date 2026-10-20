"""Pluggable NER layer (plan 6.4/2).

A backend turns text into PERSON / ADDRESS / DOB / m.6 spans. Backends load model weights only from a local
directory (KAZUIST_NER_DIR or an explicit path); nothing is downloaded at runtime and no text leaves the
process. Heavy dependencies are imported lazily and live in the optional "ner" extra.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Protocol, Sequence

from .spans import Span


class NerBackend(Protocol):
    name: str

    def detect(self, text: str) -> List[Span]: ...


class NullBackend:
    """Default when no model is configured: the rule layer runs alone."""

    name = "none"

    def detect(self, text: str) -> List[Span]:
        return []


@dataclass(frozen=True)
class Candidate:
    key: str
    hf_id: str
    kind: str  # token-classification | gliner | hushmark-span
    license: str
    note: str


# Licences checked on the Hugging Face model cards on 2026-10-19.
CANDIDATES: Dict[str, Candidate] = {
    "hushmark-berturk-112m": Candidate(
        "hushmark-berturk-112m", "lokomotifai/hushmark-berturk-112m", "hushmark-span", "apache-2.0",
        "Özel span başlığı ve kendi yükleyicisi var (custom code); yalnız sentetik veriyle eğitilmiş."),
    "akdeniz27": Candidate(
        "akdeniz27", "akdeniz27/bert-base-turkish-cased-ner", "token-classification", "mit", "PER/LOC/ORG"),
    "savasy": Candidate(
        "savasy", "savasy/bert-base-turkish-ner-cased", "token-classification", "belirtilmemiş",
        "Model kartında lisans alanı yok; üretimde kullanmadan önce lisans netleşmeli."),
    "gliner-multi-v2.1": Candidate(
        "gliner-multi-v2.1", "urchade/gliner_multi-v2.1", "gliner", "apache-2.0",
        "urchade/gliner_multi (v1) cc-by-nc-4.0 olduğu için kullanılmaz; v2.1 Apache-2.0."),
}

# Map backend labels to Kazuist entity codes.
LABEL_MAP = {
    "PER": "PERSON", "PERSON": "PERSON", "B-PER": "PERSON", "I-PER": "PERSON", "person": "PERSON",
    "LOC": "LOCATION", "full address": "ADDRESS", "address": "ADDRESS", "date of birth": "DOB",
    "medical condition": "HEALTH", "religious belief": "RELIGION", "ethnic origin": "ETHNICITY",
    "political opinion": "POLITICAL", "sexual orientation": "SEXUAL_LIFE", "criminal record": "CRIMINAL",
    "biometric data": "BIOMETRIC", "trade union membership": "UNION",
}
KEEP = {"PERSON", "ADDRESS", "DOB", "HEALTH", "RELIGION", "ETHNICITY", "POLITICAL", "SEXUAL_LIFE", "CRIMINAL",
        "BIOMETRIC", "UNION"}


def _chunks(text: str, size: int = 1200, overlap: int = 100):
    i = 0
    while i < len(text):
        yield i, text[i : i + size]
        if i + size >= len(text):
            break
        i += size - overlap


class OnnxTokenClassificationBackend:
    """BERT token classification exported to ONNX (optimum), run on CPU with onnxruntime."""

    def __init__(self, model_dir: Path, name: str):
        from optimum.onnxruntime import ORTModelForTokenClassification  # type: ignore
        from transformers import AutoTokenizer, pipeline  # type: ignore

        model = ORTModelForTokenClassification.from_pretrained(str(model_dir), provider="CPUExecutionProvider")
        tok = AutoTokenizer.from_pretrained(str(model_dir))
        self._pipe = pipeline("token-classification", model=model, tokenizer=tok, aggregation_strategy="simple")
        self.name = name

    def detect(self, text: str) -> List[Span]:
        out: List[Span] = []
        for off, chunk in _chunks(text):
            for r in self._pipe(chunk):
                ent = LABEL_MAP.get(r["entity_group"])
                if ent in KEEP:
                    out.append(Span(off + r["start"], off + r["end"], ent, f"ner:{self.name}", float(r["score"])))
        return out


class GlinerBackend:
    def __init__(self, model_dir: Path, name: str, labels: Sequence[str] = ("person", "address", "date of birth")):
        from gliner import GLiNER  # type: ignore

        self._m = GLiNER.from_pretrained(str(model_dir), load_onnx_model=True, local_files_only=True)
        self._labels = list(labels)
        self.name = name

    def detect(self, text: str) -> List[Span]:
        out: List[Span] = []
        for off, chunk in _chunks(text, 1000):
            for r in self._m.predict_entities(chunk, self._labels, threshold=0.5):
                ent = LABEL_MAP.get(r["label"])
                if ent in KEEP:
                    out.append(Span(off + r["start"], off + r["end"], ent, f"ner:{self.name}", float(r["score"])))
        return out


class HushmarkBackend:
    """Uses the loader shipped inside the local snapshot (hushmark_berturk.py). The snapshot code must be
    reviewed before use because it runs in process."""

    def __init__(self, model_dir: Path, name: str):
        import sys

        sys.path.insert(0, str(model_dir))
        from hushmark_berturk import BerturkSpanModel  # type: ignore

        self._m = BerturkSpanModel.load_artifact(model_dir).eval()
        self.name = name

    def detect(self, text: str) -> List[Span]:
        out: List[Span] = []
        for off, chunk in _chunks(text, 700, 80):  # 256 subword limit
            for r in self._m.predict_entities(chunk, list(self._m.label_names), threshold=0.5):
                ent = LABEL_MAP.get(r["label"])
                if ent in KEEP:
                    out.append(Span(off + r["start"], off + r["end"], ent, f"ner:{self.name}", float(r["score"])))
        return out


def local_model_dir(key: str, root: Optional[Path] = None) -> Optional[Path]:
    root = root or Path(os.environ.get("KAZUIST_NER_DIR", Path.home() / ".cache" / "kazuist" / "ner"))
    d = root / key
    return d if d.is_dir() else None


def load_backend(key: str, root: Optional[Path] = None) -> NerBackend:
    """Load a candidate from local disk. Raises FileNotFoundError when the model is absent and ImportError
    when the optional dependencies are missing."""
    cand = CANDIDATES[key]
    d = local_model_dir(key, root)
    if d is None:
        raise FileNotFoundError(key)
    if cand.kind == "gliner":
        return GlinerBackend(d, key)
    if cand.kind == "hushmark-span":
        return HushmarkBackend(d, key)
    return OnnxTokenClassificationBackend(d, key)


def backend_from_env() -> NerBackend:
    key = os.environ.get("KAZUIST_NER_BACKEND", "")
    if not key:
        return NullBackend()
    return load_backend(key)
