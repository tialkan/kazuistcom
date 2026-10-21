"""Pluggable NER layer (plan 6.4/2).

A backend turns text into PERSON / ADDRESS / DOB / m.6 spans. Backends load model weights only from a local
directory (KAZUIST_NER_DIR/<key>); nothing is downloaded at runtime and no text leaves the process. Heavy
dependencies (onnxruntime, tokenizers, numpy, gliner) are imported lazily and live in the optional "ner"
extra, so CI and the rule layer run without them.

Backends:
- hushmark-berturk-112m: BERTurk encoder plus span head, exported by eval/anon/export_ner.py into one ONNX
  graph. Runs with onnxruntime and tokenizers only; the downloaded loader code is not imported at runtime.
- akdeniz27 (and savasy, not downloaded): BERT token classification exported to ONNX.
- gliner-multi-v2.1: GLiNER with its ONNX runtime (the gliner package; pulls torch).

KAZUIST_NER_BACKEND selects one backend or a "+" separated union ("hushmark-berturk-112m+akdeniz27"). When the
variable is set and a model or dependency is missing, loading fails instead of silently running the weaker
rule only layer.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Protocol, Sequence, Tuple

from .spans import Span

MANIFEST = "kazuist_manifest.json"


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
    revision: str = ""


# Licences checked on the Hugging Face model cards on 2026-10-19; revisions pinned on 2026-10-20.
CANDIDATES: Dict[str, Candidate] = {
    "hushmark-berturk-112m": Candidate(
        "hushmark-berturk-112m", "lokomotifai/hushmark-berturk-112m", "hushmark-span", "apache-2.0",
        "Özel span başlığı ve kendi yükleyicisi var (custom code, incelendi); yalnız sentetik veriyle eğitilmiş.",
        "49ed7596936fd1ba28a26b788abcfb8c7b963a5c"),
    "akdeniz27": Candidate(
        "akdeniz27", "akdeniz27/bert-base-turkish-cased-ner", "token-classification", "mit", "PER/LOC/ORG",
        "99995f7d2be4b3a28c74f0d36ee97f8c04ee0571"),
    "savasy": Candidate(
        "savasy", "savasy/bert-base-turkish-ner-cased", "token-classification", "belirtilmemiş",
        "Model kartında lisans alanı yok; lisans netleşene kadar indirilmez ve kullanılmaz."),
    "gliner-multi-v2.1": Candidate(
        "gliner-multi-v2.1", "urchade/gliner_multi-v2.1", "gliner", "apache-2.0",
        "urchade/gliner_multi (v1) cc-by-nc-4.0 olduğu için kullanılmaz; v2.1 Apache-2.0.",
        "443d26d654e0324125a96bebd8e796c14ff2efe6"),
}

# Map backend labels to Kazuist entity codes.
LABEL_MAP = {
    "PER": "PERSON", "PERSON": "PERSON", "person": "PERSON",
    "LOC": "LOCATION", "ORG": "ORGANIZATION", "organization": "ORGANIZATION",
    "full address": "ADDRESS", "address": "ADDRESS", "date of birth": "DOB",
    "medical condition": "HEALTH", "religious belief": "RELIGION", "ethnic origin": "ETHNICITY",
    "political opinion": "POLITICAL", "sexual orientation": "SEXUAL_LIFE", "criminal record": "CRIMINAL",
    "biometric data": "BIOMETRIC", "trade union membership": "UNION",
}
# LOCATION (il, ilçe) and ORGANIZATION (tüzel kişi) stay open under Ek E, so they are not returned.
KEEP = {"PERSON", "ADDRESS", "DOB", "HEALTH", "RELIGION", "ETHNICITY", "POLITICAL", "SEXUAL_LIFE", "CRIMINAL",
        "BIOMETRIC", "UNION"}

# Normalisation of model PERSON spans. These are properties of Turkish names and of Ek E, not of any test set:
# a name never crosses a line break, a list separator or the conjunctions "ve", "ile", "veya"; titles and role
# words are not part of a name ("Av. Hülya Durukan" and "Hülya Durukan" are one person, so one key); trade and
# company words after a name belong to the trade name, which pipeline._sole_proprietor handles. Splitting never
# unmasks a name character, it only stops two people from sharing one label and stops headers being masked.
_SPLIT = re.compile(r"\s*(?:\n|[,;/]|\s(?:ve|ile|veya)\s)\s*", re.IGNORECASE)
_LEAD = re.compile(
    r"(?:(?:Av\.?|Avukat|Dr\.?|Doç\.?|Prof\.?|Uzm\.?|Op\.?|Sn\.?|Bay|Bayan|Davac[ıi]\w*|Daval[ıi]\w*|Sanı[kğ]\w*|"
    r"Tanı[kğ]\w*|Mağdur\w*|Katılan\w*|Müşteki\w*|Bilirkişi\w*|Vekil\w*|Müdafi\w*)(?:\s*[:\-]\s*|\s+|$))+",
    re.IGNORECASE,
)
_TRAIL = re.compile(
    r"(?:\s+(?:İnşaat|Ticaret|Gıda|Nakliyat|Tekstil|Otomotiv|Turizm|Mobilya|Elektrik|Market|Yapı|Emlak|Ltd\.?|"
    r"Şti\.?|A\.Ş\.|Limited|Anonim|Şirketi))+$",
    re.IGNORECASE,
)
_EDGE = " \t\r\n,;:()[]\"'’"


def _trim(text: str, start: int, end: int) -> Tuple[int, int]:
    """Strip separators at both edges. A trailing dot is removed only when it ends a sentence, never when it
    closes an initial ("A.K."), so trimming cannot unmask part of a name."""
    while True:
        before = (start, end)
        while start < end and (text[start] in _EDGE or text[start] == "."):
            start += 1
        while end > start and text[end - 1] in _EDGE:
            end -= 1
        if end - start >= 2 and text[end - 1] == "." and not (
                text[end - 2].isalpha() and (end - start == 2 or not text[end - 3].isalpha())):
            end -= 1
        if (start, end) == before:
            return start, end


def normalize_spans(text: str, s: Span) -> List[Span]:
    """Trim edges; for PERSON spans also split at separators, strip leading titles and role words and trailing
    trade words. Returns zero or more spans."""
    start, end = _trim(text, s.start, s.end)
    if end <= start:
        return []
    if s.entity != "PERSON":
        return [s if (start, end) == (s.start, s.end) else s.with_(start=start, end=end)]
    pieces: List[Tuple[int, int]] = []
    cursor = start
    for m in _SPLIT.finditer(text, start, end):
        pieces.append((cursor, m.start()))
        cursor = m.end()
    pieces.append((cursor, end))
    out: List[Span] = []
    for a, b in pieces:
        a, b = _trim(text, a, b)
        lead = _LEAD.match(text, a, b)
        if lead:
            a = lead.end()
        trail = _TRAIL.search(text, a, b)
        if trail and trail.start() > a:
            b = trail.start()
        a, b = _trim(text, a, b)
        if b > a and any(ch.isalpha() for ch in text[a:b]):
            out.append(s if (a, b) == (s.start, s.end) else s.with_(start=a, end=b))
    return out


def normalize_span(text: str, s: Span) -> Optional[Span]:
    """Single span form of normalize_spans (first piece), kept for callers that expect one span."""
    out = normalize_spans(text, s)
    return out[0] if out else None


# ---------------------------------------------------------------------------------------------------------
# Pure helpers (no numpy), shared by the backends and unit tested in CI.

WORD_UNIT = re.compile(r"\w+(?:[-_]\w+)*|\S", re.UNICODE)  # Hushmark training tokenisation


def word_units(text: str) -> List[Tuple[str, int, int]]:
    return [(m.group(), m.start(), m.end()) for m in WORD_UNIT.finditer(text)]


def candidate_spans(word_count: int, max_width: int) -> List[Tuple[int, int]]:
    """Inclusive word spans in the order the Hushmark head was trained with."""
    return [(s, e) for s in range(word_count) for e in range(s, min(word_count, s + max_width))]


def greedy_select(cands: Iterable[Tuple[float, int, int, int]]) -> List[Tuple[float, int, int, int]]:
    """Non overlapping (score, start, end, label) selection: best score first, then narrower, then earlier."""
    chosen: List[Tuple[float, int, int, int]] = []
    occupied: set = set()
    for c in sorted(cands, key=lambda v: (-v[0], v[2] - v[1], v[1])):
        cover = set(range(c[1], c[2] + 1))
        if occupied & cover:
            continue
        chosen.append(c)
        occupied |= cover
    return sorted(chosen, key=lambda v: (v[1], v[2]))


@dataclass(frozen=True)
class Window:
    start: int  # first unit in the window
    end: int  # one past the last unit
    own_start: int  # units whose span starts in [own_start, own_end) are kept from this window
    own_end: int


def windows(costs: Sequence[int], budget: int, margin: int) -> List[Window]:
    """Split a unit sequence (words or tokens with a subword cost) into windows of at most `budget` cost.

    Consecutive windows overlap by up to 2 * margin units. Each unit is owned by exactly one window, the one
    in which it has at least `margin` units of context on both sides (except at document edges)."""
    n = len(costs)
    if n == 0:
        return []
    out: List[Window] = []
    start = 0
    own_start = 0
    while True:
        end, total = start, 0
        while end < n and total + max(1, costs[end]) <= budget:
            total += max(1, costs[end])
            end += 1
        if end == start:  # a single unit over budget: give it its own window, the caller truncates
            end = start + 1
        if end >= n:
            out.append(Window(start, n, own_start, n))
            return out
        if end - start <= 2 * margin:  # too small for margins: no overlap
            own_end, next_start = end, end
        else:
            own_end = end - margin
            next_start = own_end - margin
        out.append(Window(start, end, own_start, own_end))
        own_start, start = own_end, next_start


def bio_entities(words: Sequence[Tuple[str, float, int, int]]) -> List[Tuple[str, float, int, int]]:
    """Group word level BIO tags ("first" aggregation) into entities.

    words: (tag, score, char_start, char_end) per word, tag like "B-PER", "I-PER" or "O".
    Returns (type, mean score, char_start, char_end)."""
    out: List[Tuple[str, float, int, int]] = []
    cur: Optional[List] = None
    for tag, score, s, e in words:
        kind = tag[2:] if tag[:2] in ("B-", "I-") else None
        if kind is not None and cur is not None and tag.startswith("I-") and cur[0] == kind:
            cur[2] = e
            cur[3].append(score)
            continue
        if cur is not None:
            out.append((cur[0], sum(cur[3]) / len(cur[3]), cur[1], cur[2]))
            cur = None
        if kind is not None:
            cur = [kind, s, e, [score]]
    if cur is not None:
        out.append((cur[0], sum(cur[3]) / len(cur[3]), cur[1], cur[2]))
    return out


def char_windows(text: str, size: int, margin: int) -> List[Tuple[int, int, int, int]]:
    """Character windows cut at whitespace, with ownership like windows(): (start, end, own_start, own_end)."""
    units = [(m.start(), m.end()) for m in re.finditer(r"\S+", text)]
    if not units:
        return []
    out = []
    for w in windows([e - s + 1 for s, e in units], size, margin):
        s = units[w.start][0]
        e = units[w.end - 1][1]
        os_ = units[w.own_start][0] if w.own_start < len(units) else len(text)
        oe = units[w.own_end][0] if w.own_end < len(units) else len(text)
        out.append((s, e, os_ if w.own_start else 0, oe))
    return out


def _softmax_rows(x):
    import numpy as np  # type: ignore

    x = x - x.max(axis=-1, keepdims=True)
    e = np.exp(x)
    return e / e.sum(axis=-1, keepdims=True)


def _ort_session(path: Path):
    import onnxruntime as ort  # type: ignore

    so = ort.SessionOptions()
    threads = int(os.environ.get("KAZUIST_NER_THREADS", "0") or 0)
    if threads > 0:
        so.intra_op_num_threads = threads
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    return ort.InferenceSession(str(path), sess_options=so, providers=["CPUExecutionProvider"])


def _tokenizer(path: Path):
    from tokenizers import Tokenizer  # type: ignore

    tok = Tokenizer.from_file(str(path))
    tok.no_truncation()
    tok.no_padding()
    return tok


def _revision(model_dir: Path) -> str:
    try:
        rev = json.loads((model_dir / MANIFEST).read_text(encoding="utf-8")).get("revision", "")
    except (OSError, ValueError):
        rev = ""
    return rev[:7] if rev else "local"


def _onnx_file(model_dir: Path) -> Path:
    q = os.environ.get("KAZUIST_NER_QUANTIZED", "") == "1"
    p = model_dir / ("model_quantized.onnx" if q else "model.onnx")
    if not p.is_file():
        raise FileNotFoundError(str(p))
    return p


# ---------------------------------------------------------------------------------------------------------
# Backends


class OnnxTokenClassificationBackend:
    """BERT token classification exported to ONNX, decoded with "first" word aggregation, run on CPU."""

    max_tokens = 510

    def __init__(self, model_dir: Path, name: str, threshold: float = 0.5):
        cfg = json.loads((model_dir / "config.json").read_text(encoding="utf-8"))
        self._id2label = {int(k): v for k, v in cfg["id2label"].items()}
        self._sess = _ort_session(_onnx_file(model_dir))
        self._inputs = {i.name for i in self._sess.get_inputs()}
        self._tok = _tokenizer(model_dir / "tokenizer.json")
        self._cls = self._tok.token_to_id("[CLS]")
        self._sep = self._tok.token_to_id("[SEP]")
        self.threshold = threshold
        self.name = f"{name}@{_revision(model_dir)}"

    def detect(self, text: str) -> List[Span]:
        import numpy as np  # type: ignore

        enc = self._tok.encode(text, add_special_tokens=False)
        ids, offsets, wids = enc.ids, enc.offsets, enc.word_ids
        if not ids:
            return []
        tags: List[Optional[Tuple[str, float]]] = [None] * len(ids)
        for w in windows([1] * len(ids), self.max_tokens, 64):
            seq = [self._cls, *ids[w.start : w.end], self._sep]
            feed = {"input_ids": np.array([seq], dtype=np.int64),
                    "attention_mask": np.ones((1, len(seq)), dtype=np.int64)}
            if "token_type_ids" in self._inputs:
                feed["token_type_ids"] = np.zeros((1, len(seq)), dtype=np.int64)
            probs = _softmax_rows(self._sess.run(None, feed)[0][0][1:-1])
            for i in range(w.own_start, w.own_end):
                row = probs[i - w.start]
                k = int(row.argmax())
                tags[i] = (self._id2label[k], float(row[k]))
        words: List[Tuple[str, float, int, int]] = []
        last_wid = None
        for i, wid in enumerate(wids):
            if wid is None:
                continue
            s, e = offsets[i]
            if wid == last_wid and words:
                t, sc, ws, _ = words[-1]
                words[-1] = (t, sc, ws, e)  # later subwords extend the word, the first decides the tag
            else:
                t, sc = tags[i] or ("O", 0.0)
                words.append((t, sc, s, e))
            last_wid = wid
        out: List[Span] = []
        for kind, score, s, e in bio_entities(words):
            ent = LABEL_MAP.get(kind)
            if ent in KEEP and score >= self.threshold:
                out += normalize_spans(text, Span(s, e, ent, f"ner:{self.name}", score))
        return out


class HushmarkOnnxBackend:
    """Hushmark BERTurk Span 112M as one ONNX graph (encoder plus span head, see export_ner.py).

    Reproduces the reference loader's inference: word units by WORD_UNIT, first subword per word, every span
    up to max_width words, softmax over labels plus background, threshold, greedy non overlapping selection.
    Long texts are split into windows of at most max_length subwords."""

    def __init__(self, model_dir: Path, name: str, threshold: float = 0.5, margin: int = 24):
        cfg = json.loads((model_dir / "hushmark_span_config.json").read_text(encoding="utf-8"))
        self._labels = list(cfg["label_names"])
        self._max_len = int(cfg["max_length"])
        self._max_width = int(cfg["max_width"])
        self._sess = _ort_session(_onnx_file(model_dir))
        self._tok = _tokenizer(model_dir / "tokenizer.json")
        self._cls = self._tok.token_to_id("[CLS]")
        self._sep = self._tok.token_to_id("[SEP]")
        self.threshold = threshold
        self.margin = margin
        self.name = f"{name}@{_revision(model_dir)}"

    def raw(self, text: str) -> List[dict]:
        """Model output before label mapping: [{"label", "start", "end", "score"}] with char offsets."""
        import numpy as np  # type: ignore

        units = word_units(text)
        if not units:
            return []
        enc = self._tok.encode([u[0] for u in units], is_pretokenized=True, add_special_tokens=False)
        first: Dict[int, int] = {}
        count = [0] * len(units)
        for i, wid in enumerate(enc.word_ids):
            if wid is None:
                continue
            first.setdefault(wid, i)
            count[wid] += 1
        ids = enc.ids
        found: List[dict] = []
        for w in windows(count, self._max_len - 2, self.margin):
            n = w.end - w.start
            sub_a = first.get(w.start, 0)
            sub_b = first.get(w.end, len(ids))
            seq = [self._cls, *ids[sub_a:sub_b][: self._max_len - 2], self._sep]
            word_starts = [min(len(seq) - 2, first.get(w.start + k, sub_a) - sub_a + 1) for k in range(n)]
            spans = candidate_spans(n, self._max_width)
            feed = {
                "input_ids": np.array([seq], dtype=np.int64),
                "attention_mask": np.ones((1, len(seq)), dtype=np.int64),
                "token_type_ids": np.zeros((1, len(seq)), dtype=np.int64),
                "word_starts": np.array([word_starts], dtype=np.int64),
                "span_starts": np.array([[s for s, _ in spans]], dtype=np.int64),
                "span_ends": np.array([[e for _, e in spans]], dtype=np.int64),
            }
            probs = self._sess.run(None, feed)[0][0][:, 1:]
            label_ids = probs.argmax(axis=-1)
            scores = probs[np.arange(len(spans)), label_ids]
            keep = np.nonzero(scores >= self.threshold)[0]
            cands = [(float(scores[k]), spans[k][0], spans[k][1], int(label_ids[k])) for k in keep]
            for score, s, e, lab in greedy_select(cands):
                if not (w.own_start <= w.start + s < w.own_end):
                    continue
                found.append({"label": self._labels[lab], "start": units[w.start + s][1],
                              "end": units[w.start + e][2], "score": score})
        return found

    def detect(self, text: str) -> List[Span]:
        out: List[Span] = []
        for r in self.raw(text):
            ent = LABEL_MAP.get(r["label"])
            if ent in KEEP:
                out += normalize_spans(text, Span(r["start"], r["end"], ent, f"ner:{self.name}", r["score"]))
        return out


class GlinerBackend:
    """GLiNER multi v2.1 through its ONNX runtime. Labels are zero shot prompts."""

    def __init__(self, model_dir: Path, name: str, labels: Sequence[str] = ("person", "address", "date of birth"),
                 threshold: float = 0.5, window_chars: int = 1000, margin: int = 15):
        from gliner import GLiNER  # type: ignore

        self._m = GLiNER.from_pretrained(str(model_dir), load_onnx_model=True, local_files_only=True,
                                         onnx_model_file=_onnx_file(model_dir).name)
        self._labels = list(labels)
        self.threshold = threshold
        self.window_chars = window_chars
        self.margin = margin
        self.name = f"{name}@{_revision(model_dir)}"

    def detect(self, text: str) -> List[Span]:
        out: List[Span] = []
        for s, e, own_s, own_e in char_windows(text, self.window_chars, self.margin):
            for r in self._m.predict_entities(text[s:e], self._labels, threshold=self.threshold):
                start, end = s + int(r["start"]), s + int(r["end"])
                if not (own_s <= start < own_e):
                    continue
                ent = LABEL_MAP.get(r["label"])
                if ent in KEEP:
                    out += normalize_spans(text, Span(start, end, ent, f"ner:{self.name}", float(r["score"])))
        return out


class EnsembleBackend:
    """Union of several backends; the pipeline resolves overlaps."""

    def __init__(self, backends: Sequence[NerBackend]):
        self._b = list(backends)
        self.name = "+".join(b.name for b in self._b)

    def detect(self, text: str) -> List[Span]:
        out: List[Span] = []
        for b in self._b:
            out += b.detect(text)
        return out


def ner_root() -> Path:
    return Path(os.environ.get("KAZUIST_NER_DIR", Path.home() / ".cache" / "kazuist-ner"))


def local_model_dir(key: str, root: Optional[Path] = None) -> Optional[Path]:
    d = (root or ner_root()) / key
    return d if d.is_dir() else None


def parse_spec(spec: str) -> List[str]:
    """"a+b" -> ["a", "b"]; "", "none" -> []. Unknown keys raise KeyError."""
    keys = [k.strip() for k in spec.split("+") if k.strip() and k.strip() != "none"]
    for k in keys:
        if k not in CANDIDATES:
            raise KeyError(k)
    return keys


def load_backend(spec: str, root: Optional[Path] = None) -> NerBackend:
    """Load one candidate or a "+" union from local disk. Raises FileNotFoundError when a model is absent and
    ImportError when the optional dependencies are missing."""
    keys = parse_spec(spec)
    if not keys:
        return NullBackend()
    loaded: List[NerBackend] = []
    for key in keys:
        cand = CANDIDATES[key]
        d = local_model_dir(key, root)
        if d is None:
            raise FileNotFoundError(key)
        if cand.kind == "gliner":
            loaded.append(GlinerBackend(d, key))
        elif cand.kind == "hushmark-span":
            loaded.append(HushmarkOnnxBackend(d, key))
        else:
            loaded.append(OnnxTokenClassificationBackend(d, key))
    return loaded[0] if len(loaded) == 1 else EnsembleBackend(loaded)


def backend_from_env() -> NerBackend:
    return load_backend(os.environ.get("KAZUIST_NER_BACKEND", ""))
