"""Offline small-model regression for dynamic ONNX export; no pretrained weights required."""

import importlib.util
import tempfile
import unittest
from pathlib import Path


@unittest.skipUnless(
    importlib.util.find_spec("torch") and importlib.util.find_spec("onnx"),
    "ner export extra required",
)
class DynamicExportTests(unittest.TestCase):
    def test_variable_batch_length_and_padding_match_torch(self):
        import numpy as np
        import onnxruntime as ort
        import torch
        from export_ner import export_token_classifier
        from transformers import BertConfig, BertForTokenClassification

        torch.manual_seed(13)
        config = BertConfig(
            vocab_size=32,
            hidden_size=16,
            num_hidden_layers=1,
            num_attention_heads=2,
            intermediate_size=24,
            num_labels=3,
        )
        model = BertForTokenClassification(config).eval()
        model.set_attn_implementation("eager")
        sample = {
            "input_ids": torch.ones(1, 4, dtype=torch.long),
            "attention_mask": torch.ones(1, 4, dtype=torch.long),
            "token_type_ids": torch.zeros(1, 4, dtype=torch.long),
        }
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "model.onnx"
            export_token_classifier(model, sample, path)
            session = ort.InferenceSession(
                str(path), providers=["CPUExecutionProvider"]
            )
            for batch, length in ((1, 2), (2, 7), (1, 11)):
                values = {
                    "input_ids": torch.randint(0, 32, (batch, length)),
                    "attention_mask": torch.ones(batch, length, dtype=torch.long),
                    "token_type_ids": torch.zeros(batch, length, dtype=torch.long),
                }
                values["attention_mask"][:, -1] = 0
                with torch.no_grad():
                    expected = model(**values).logits.numpy()
                actual = session.run(None, {k: v.numpy() for k, v in values.items()})[0]
                np.testing.assert_allclose(actual, expected, atol=1e-5, rtol=1e-5)


if __name__ == "__main__":
    unittest.main()
