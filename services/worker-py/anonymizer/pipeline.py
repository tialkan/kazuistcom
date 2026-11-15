"""Anonymisation pipeline: detectors, merge, role labels, policy, masking, review items.

Fail closed (plan 6.4/6, 15.3/2): a result is publishable only when the editor queue is empty and, outside
development, an NER model took part. The rule layer alone misses names without a role cue, so where real
decision text is processed (ner.ner_required) a run without a model is held for review with the reason
"ner_unavailable"; records.masked_text stays NULL and nothing is indexed.

The editor queue counts as empty when an editor approved (review_queue decision "onay") an item of the same
anonymizationVersion that lists every item of this result (with_approval). A blocked result is never published
by an approval: it needs a run with a model.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Dict, FrozenSet, List, Optional, Set, Tuple

from . import ENGINE_VERSION
from .ner import NerBackend, NullBackend, has_model, ner_required, normalize_spans
from .policy import Policy, default_policy
from .roles import (Labeler, find_cued_persons, find_panel_members, find_suffixed_names, infer_role,
                    propagate, tr_fold)
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


ReviewItemKey = Tuple[int, int, str, str]


def review_item_key(item: dict) -> Optional[ReviewItemKey]:
    """(charStart, charEnd, entity, mask) of a review_queue payload item; None when malformed."""
    try:
        return int(item["charStart"]), int(item["charEnd"]), str(item["entity"]), str(item["mask"])
    except (KeyError, TypeError, ValueError):
        return None


@dataclass(frozen=True)
class Approval:
    """An editor's "onay" on an anonymization review item (review_queue row)."""

    review_id: str
    anonymization_version: str
    items: FrozenSet[ReviewItemKey]
    decided_by: Optional[str] = None
    decided_at: Optional[datetime] = None


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
    # The open source (policy open_sources entry, e.g. "AYM") whose listed panel stayed readable, else None.
    open_source: Optional[str] = None
    # The editor approval that covers every review item of this result (with_approval), else None.
    approval: Optional[Approval] = None

    @property
    def publishable(self) -> bool:
        return self.blocked is None and (not self.review or self.approval is not None)

    def review_keys(self) -> FrozenSet[ReviewItemKey]:
        return frozenset((s.start, s.end, s.entity, s.mask) for s in self.review)

    def with_approval(self, approval: Optional[Approval]) -> "AnonResult":
        """This result marked as approved when `approval` is for the same anonymizationVersion and lists every
        review item (same offsets, entity and mask); otherwise unchanged. Blocked results stay blocked."""
        if (approval is None or self.blocked is not None or not self.review
                or approval.anonymization_version != self.anonymization_version
                or not self.review_keys() <= approval.items):
            return self
        return replace(self, approval=approval)

    def review_queue_row(self, record_id: str) -> Optional[dict]:
        """review_queue (queue 'anonymization') row. The payload holds offsets and labels only, never the
        original text; the editor UI reads the text from the record under access control. A blocked result
        always gets a row, so every record held back is visible in the queue with its reason. An approved
        result gets none: its items were decided already."""
        if self.publishable:
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


# Roles that never belong to a court member: a person named with one of them anywhere in the document stays
# masked even when the panel of an open source lists the same name. None, "kisi" and "hakim" are compatible.
_MEMBER_ROLES = {None, "kisi", "hakim"}
PANEL_DETECTOR = "context:panel"


def _person_key(s: Span) -> str:
    return s.key or f"@{s.start}"


def _open_panel(text: str, raw: List[Span], spans: List[Span]) -> List[Span]:
    """Drop the masks of the members an open source lists on its own panel lines (Ek E, "Yüksek mahkeme üyesi
    ve muhalefet şerhi yazarı"). A resolved PERSON span stays readable when its person was found on a panel
    line, or the span lies inside one, and no detection anywhere gives that person a non member role. A
    surname only mention stays masked when a masked person carries the same surname. Everything else keeps its
    mask: parties, lawyers, rapporteurs, first instance judges and names after a member word in a sentence."""
    persons = [s for s in raw if s.entity == "PERSON"]
    panel = [s for s in persons if s.detector == PANEL_DETECTOR]
    if not panel:
        return spans
    roles: Dict[str, Set[Optional[str]]] = {}
    for s in persons:
        roles.setdefault(_person_key(s), set()).add(s.role)
    blocked = {k for k, rs in roles.items() if not rs <= _MEMBER_ROLES}
    listed = {_person_key(p) for p in panel} - blocked
    listed_panel = [p for p in panel if _person_key(p) in listed]

    def readable(s: Span) -> bool:
        if s.entity != "PERSON" or _person_key(s) in blocked:
            return False
        return _person_key(s) in listed or any(p.start <= s.start and s.end <= p.end for p in listed_panel)

    flags = [readable(s) for s in spans]
    closed = {k.split()[-1] for k in roles if k not in listed and not k.startswith("@") and k.split()}
    closed |= {tr_fold(text[s.start:s.end]).split()[-1] for s, f in zip(spans, flags, strict=True)
               if s.entity == "PERSON" and not f and text[s.start:s.end].split()}
    return [s for s, f in zip(spans, flags, strict=True)
            if not f or (s.detector == "context:surname" and tr_fold(text[s.start:s.end]) in closed)]


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
    source_key: Optional[str] = None,
    policy: Optional[Policy] = None,
    ner: Optional[NerBackend] = None,
    extra: Optional[List[NerBackend]] = None,
    require_ner: Optional[bool] = None,
) -> AnonResult:
    """Detect, label and mask. `require_ner` None reads KAZUIST_ENV (ner.ner_required); True makes a run
    without any NER model unpublishable (blocked = NER_UNAVAILABLE), whatever the editor queue says.

    `court` and `source_key` are records.court and records.source_key; policy.open_source_for() maps them to
    an open source (Ek E), for which the members on the decision's own panel lines stay readable."""
    policy = policy or default_policy()
    ner = ner or NullBackend()
    backends = [ner, *(extra or [])]
    if require_ner is None:
        require_ner = ner_required()
    blocked = NER_UNAVAILABLE if require_ner and not any(has_model(b) for b in backends) else None
    raw: List[Span] = []
    raw += detect_structural(text)
    raw += find_cued_persons(text)
    raw += find_panel_members(text)
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
    open_source = policy.open_source_for(court=court, source_key=source_key)
    if open_source:
        spans = _open_panel(text, raw, spans)

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
        open_source=open_source,
    )
