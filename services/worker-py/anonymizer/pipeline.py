"""Anonymisation pipeline: detectors, merge, role labels, policy, masking, review items."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

from . import ENGINE_VERSION
from .ner import NerBackend, NullBackend
from .policy import Policy, default_policy
from .roles import Labeler, find_cued_persons, infer_role, propagate, tr_fold
from .sensitive import find_child_details, find_m6, has_child
from .spans import Span, resolve_overlaps
from .structural import detect_structural

_TRADE = re.compile(
    r"\s+(?:İnşaat|Ticaret|Gıda|Nakliyat|Tekstil|Otomotiv|Turizm|Mobilya|Elektrik|Market|Yapı|Emlak)\b"
)


@dataclass(frozen=True)
class MaskedSpan:
    start: int
    end: int
    entity: str
    mask: str
    detector: str
    score: float
    needs_review: bool


@dataclass
class AnonResult:
    masked_text: str
    spans: List[MaskedSpan]
    policy_version: str
    anonymization_version: str
    child_strict: bool
    review: List[MaskedSpan] = field(default_factory=list)

    @property
    def publishable(self) -> bool:
        return not self.review

    def review_queue_row(self, record_id: str) -> Optional[dict]:
        """review_queue (queue 'anonymization') row. The payload holds offsets and labels only, never the
        original text; the editor UI reads the text from the record under access control."""
        if not self.review:
            return None
        return {
            "queue": "anonymization",
            "subject_type": "record",
            "subject_id": record_id,
            "priority": min(100, len(self.review) * 10 + (50 if self.child_strict else 0)),
            "payload": {
                "policyVersion": self.policy_version,
                "anonymizationVersion": self.anonymization_version,
                "childStrict": self.child_strict,
                "items": [
                    {"charStart": s.start, "charEnd": s.end, "entity": s.entity, "mask": s.mask,
                     "detector": s.detector, "score": round(s.score, 3)}
                    for s in self.review
                ],
            },
        }


def anonymization_version(policy: Policy, ner: NerBackend) -> str:
    return f"{ENGINE_VERSION}+{policy.version}+ner.{ner.name}"


def _sole_proprietor(text: str, spans: List[Span]) -> List[Span]:
    out = []
    for s in spans:
        if s.entity == "PERSON" and _TRADE.match(text, s.end):
            out.append(s.with_(entity="SOLE_PROPRIETOR"))
        else:
            out.append(s)
    return out


def anonymize(
    text: str,
    *,
    court: Optional[str] = None,
    policy: Optional[Policy] = None,
    ner: Optional[NerBackend] = None,
    extra: Optional[List[NerBackend]] = None,
) -> AnonResult:
    policy = policy or default_policy()
    ner = ner or NullBackend()
    raw: List[Span] = []
    raw += detect_structural(text)
    raw += find_cued_persons(text)
    raw += find_m6(text)
    for backend in [ner, *(extra or [])]:
        for s in backend.detect(text):
            if s.entity == "PERSON":
                s = s.with_(role=infer_role(text, s), key=tr_fold(text[s.start : s.end]))
            raw.append(s)
    raw += propagate(text, [s for s in raw if s.entity == "PERSON"])
    child = has_child(text)
    if child:
        raw += find_child_details(text)

    spans = resolve_overlaps(raw)
    spans = _sole_proprietor(text, spans)

    # High court members stay open only when the official source publishes them (Ek E).
    open_courts = {tr_fold(c) for c in policy.open_sources()}
    if court and tr_fold(court) in open_courts:
        spans = [s for s in spans if not (s.entity == "PERSON" and s.role == "hakim")]

    labels = Labeler().assign(spans)
    masked: List[MaskedSpan] = []
    for s in spans:
        if s.entity == "PERSON":
            mask = labels.get(s.key or f"@{s.start}", "[Kişi]")
        elif s.entity == "LOCATION":
            continue  # il and ilce are kept (Ek E); street level comes from the ADDRESS recognizer
        else:
            mask = policy.mask_for(s.entity)
        masked.append(MaskedSpan(s.start, s.end, s.entity, mask, s.detector, s.score,
                                 s.score < policy.review_threshold))

    parts: List[str] = []
    cursor = 0
    for m in masked:
        parts.append(text[cursor : m.start])
        parts.append(m.mask)
        cursor = m.end
    parts.append(text[cursor:])

    return AnonResult(
        masked_text="".join(parts),
        spans=masked,
        policy_version=policy.version,
        anonymization_version=anonymization_version(policy, ner),
        child_strict=child,
        review=[m for m in masked if m.needs_review],
    )
