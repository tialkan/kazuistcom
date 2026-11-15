"""Anonymisation pipeline: detectors, merge, role labels, policy, masking, review items.

Fail closed (plan 6.4/6, 15.3/2): a result is publishable only when the editor queue is empty and, outside
development, an NER model took part. The rule layer alone misses names without a role cue, so where real
decision text is processed (ner.ner_required) a run without a model is held for review with the reason
"ner_unavailable"; records.masked_text stays NULL and nothing is indexed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Optional

from . import ENGINE_VERSION
from .ner import NerBackend, NullBackend, has_model, ner_required, normalize_spans
from .policy import Policy, default_policy
from .roles import Labeler, find_cued_persons, find_suffixed_names, infer_role, propagate, tr_fold
from .sensitive import find_child_details, find_m6, has_child
from .spans import Span, resolve_overlaps
from .structural import detect_structural
from .suffixes import name_key

NER_UNAVAILABLE = "ner_unavailable"

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
    # Why the result may not be published even with an empty editor queue (NER_UNAVAILABLE), else None.
    blocked: Optional[str] = None

    @property
    def publishable(self) -> bool:
        return self.blocked is None and not self.review

    def review_queue_row(self, record_id: str) -> Optional[dict]:
        """review_queue (queue 'anonymization') row. The payload holds offsets and labels only, never the
        original text; the editor UI reads the text from the record under access control. A blocked result
        always gets a row, so every record held back is visible in the queue with its reason."""
        if not self.review and self.blocked is None:
            return None
        payload = {
            "policyVersion": self.policy_version,
            "anonymizationVersion": self.anonymization_version,
            "childStrict": self.child_strict,
            "items": [
                {"charStart": s.start, "charEnd": s.end, "entity": s.entity, "mask": s.mask,
                 "detector": s.detector, "score": round(s.score, 3)}
                for s in self.review
            ],
        }
        if self.blocked is not None:
            payload["blocked"] = self.blocked
        return {
            "queue": "anonymization",
            "subject_type": "record",
            "subject_id": record_id,
            "priority": min(100, len(self.review) * 10 + (50 if self.child_strict else 0)
                            + (40 if self.blocked else 0)),
            "payload": payload,
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
    require_ner: Optional[bool] = None,
) -> AnonResult:
    """Detect, label and mask. `require_ner` None reads KAZUIST_ENV (ner.ner_required); True makes a run
    without any NER model unpublishable (blocked = NER_UNAVAILABLE), whatever the editor queue says."""
    policy = policy or default_policy()
    ner = ner or NullBackend()
    backends = [ner, *(extra or [])]
    if require_ner is None:
        require_ner = ner_required()
    blocked = NER_UNAVAILABLE if require_ner and not any(has_model(b) for b in backends) else None
    raw: List[Span] = []
    raw += detect_structural(text)
    raw += find_cued_persons(text)
    raw += find_suffixed_names(text)
    raw += find_m6(text)
    for backend in backends:
        for found in backend.detect(text):
            # Backends normalise already; repeating it here (idempotent) covers third party backends.
            for s in normalize_spans(text, found):
                if s.entity == "PERSON":
                    s = s.with_(role=infer_role(text, s), key=name_key(text[s.start : s.end]))
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
        blocked=blocked,
    )
