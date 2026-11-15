"""Real model checks, run only where eval/embed/hazirla.py has prepared the folders (KAZUIST_EMBED_DIR, default
~/.cache/kazuist-embed) and the ner-runtime extra is installed; skipped in CI. All text is written for the test."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import pytest

from nlp.embedder import CANDIDATES, OnnxEmbedder, embed_root, embedder_from_env
from nlp.model_check import check


def prepared(key: str) -> Optional[Path]:
    d = embed_root(os.environ) / key
    return d if (d / "model_quantized.onnx").is_file() and (d / "tokenizer.json").is_file() else None


QUERY = "Şirket artık ihtiyaç duymadığı müşteri bilgilerini ne zaman silmek zorundadır?"
RELEVANT = (
    "İşlenmesini gerektiren sebeplerin ortadan kalkması hâlinde kişisel veriler resen veya ilgili kişinin "
    "talebi üzerine veri sorumlusu tarafından silinir, yok edilir veya anonim hâle getirilir."
)
UNRELATED = "Bir hayvanın bakımını üstlenen kişi, hayvanın verdiği zararı gidermekle yükümlüdür."
BATCH = [
    "Kısa bir cümle.",
    RELEVANT,
    "Hâkim, tazminatın kapsamını ve ödenme biçimini kusurun ağırlığını göz önüne alarak belirler.",
    UNRELATED,
    "Anayasa Mahkemesi kararları kesindir.",
]


@pytest.mark.parametrize("key", sorted(CANDIDATES))
def test_prepared_model_loads_from_the_environment_and_ranks_sensibly(key: str) -> None:
    root = prepared(key)
    if root is None:
        pytest.skip("model yerelde hazırlanmamış")
    np = pytest.importorskip("numpy")
    pytest.importorskip("onnxruntime")
    pytest.importorskip("tokenizers")

    assert check(root, quantized=True) == []
    env = {
        "KAZUIST_EMBED_BACKEND": key,
        "KAZUIST_EMBED_DIR": str(root.parent),
        "KAZUIST_EMBED_QUANTIZED": "1",
        "KAZUIST_EMBED_THREADS": "2",
    }
    emb = embedder_from_env(env, lambda *a, **k: None)
    assert isinstance(emb, OnnxEmbedder)
    assert emb.model == f"{key}@{CANDIDATES[key].revision[:7]}"

    [q] = np.asarray(emb.embed([QUERY], "query"))
    rel, unrel = np.asarray(emb.embed([RELEVANT, UNRELATED], "passage"))
    assert float(q @ rel) > float(q @ unrel)

    # One text per run (the default): a passage vector does not depend on the other texts of the call, which
    # int8 dynamic quantization would otherwise cause.
    together = np.asarray(emb.embed(BATCH, "passage"))
    alone = np.asarray([emb.embed([t], "passage")[0] for t in BATCH])
    assert np.abs(together - alone).max() < 1e-6
