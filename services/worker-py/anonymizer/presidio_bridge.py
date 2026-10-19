"""Optional Presidio integration (extra "presidio").

Two directions:
1. as_presidio_recognizer(): wraps the Kazuist structural layer as a Presidio EntityRecognizer, so a team
   that already runs Presidio Analyzer gets the Turkish check digit recognizers.
2. PresidioBackend: runs a caller supplied AnalyzerEngine (configured with a local Turkish NLP engine) and
   returns Kazuist spans that the pipeline merges with resolve_overlaps.

Presidio is never required: the pipeline works without it and tests skip when it is absent.
"""

from __future__ import annotations

from typing import Any, List

from .spans import Span
from .structural import detect_structural

PRESIDIO_TO_KAZUIST = {
    "PERSON": "PERSON", "EMAIL_ADDRESS": "EMAIL", "PHONE_NUMBER": "PHONE", "IBAN_CODE": "IBAN",
    "CREDIT_CARD": "CARD", "TR_TCKN": "TCKN", "TR_VKN": "VKN", "TR_PLATE": "PLATE", "LOCATION": "LOCATION",
}
KAZUIST_TO_PRESIDIO = {v: k for k, v in PRESIDIO_TO_KAZUIST.items()}


def to_presidio_entity(entity: str) -> str:
    return KAZUIST_TO_PRESIDIO.get(entity, "TR_" + entity)


def from_presidio(results: List[Any]) -> List[Span]:
    out = []
    for r in results:
        ent = PRESIDIO_TO_KAZUIST.get(r.entity_type, r.entity_type.removeprefix("TR_"))
        out.append(Span(r.start, r.end, ent, "presidio", float(r.score)))
    return out


def as_presidio_recognizer():
    from presidio_analyzer import EntityRecognizer, RecognizerResult  # type: ignore

    class KazuistStructuralRecognizer(EntityRecognizer):
        def __init__(self) -> None:
            ents = ["TR_TCKN", "TR_VKN", "IBAN_CODE", "CREDIT_CARD", "PHONE_NUMBER", "EMAIL_ADDRESS", "TR_PLATE",
                    "TR_PASSPORT", "TR_DOB", "TR_PARCEL", "TR_ADDRESS"]
            super().__init__(supported_entities=ents, supported_language="tr", name="KazuistStructural")

        def load(self) -> None:
            return None

        def analyze(self, text, entities, nlp_artifacts=None):
            res = []
            for s in detect_structural(text):
                et = to_presidio_entity(s.entity)
                if not entities or et in entities:
                    res.append(RecognizerResult(et, s.start, s.end, s.score))
            return res

    return KazuistStructuralRecognizer()


class PresidioBackend:
    name = "presidio"

    def __init__(self, analyzer: Any, language: str = "tr"):
        self._a = analyzer
        self._lang = language

    def detect(self, text: str) -> List[Span]:
        return from_presidio(self._a.analyze(text=text, language=self._lang))
