"""Record draft: the common record shape (SRS 9.5 plus plan 6.3) as produced by connectors.

Field values mirror packages/db/src/schema/corpus.ts (records, record_versions). Connectors never guess a
court, date or number; unknown stays None.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from .dedupe import dedupe_key

DECISION_TYPES = ("karar", "kurul_karari")
NORM_ANON_VERSION = "gerekmez-norm"


@dataclass
class VersionDraft:
    valid_from: date
    valid_to: Optional[date]
    text: str
    amended_by: Optional[str] = None


@dataclass
class RecordDraft:
    type: str
    title: str
    authority_class: str
    license_basis: str
    source_url: str
    source_key: str
    fetched_at: datetime
    text: str
    jurisdiction: str = "TR"
    court: Optional[str] = None
    chamber: Optional[str] = None
    esas_no: Optional[str] = None
    karar_no: Optional[str] = None
    decision_date: Optional[date] = None
    norm_refs: List[Dict[str, str]] = field(default_factory=list)
    status: str = "bilinmiyor"
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    amended_by: Optional[str] = None
    protocol_status: str = "gerekmez"
    live_only: bool = False
    openalex_cited_by: Optional[int] = None
    versions: List[VersionDraft] = field(default_factory=list)
    extra: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.license_basis or not self.source_url or not self.source_key:
            raise ValueError("licenseBasis, sourceUrl and sourceKey are required")

    @property
    def requires_anonymization(self) -> bool:
        return self.type in DECISION_TYPES

    @property
    def dedupe(self) -> str:
        return dedupe_key(self.court, self.chamber, self.esas_no, self.karar_no, self.decision_date, self.text)

    def to_row(self) -> Dict[str, Any]:
        """Columns for INSERT INTO records. anonymized is false for decisions until anon.run finishes."""
        norm = not self.requires_anonymization
        return {
            "type": self.type,
            "title": self.title,
            "court": self.court,
            "chamber": self.chamber,
            "esas_no": self.esas_no,
            "karar_no": self.karar_no,
            "decision_date": self.decision_date,
            "authority_class": self.authority_class,
            "jurisdiction": self.jurisdiction,
            "norm_refs": self.norm_refs or None,
            "status": self.status,
            "valid_from": self.valid_from,
            "valid_to": self.valid_to,
            "amended_by": self.amended_by,
            "license_basis": self.license_basis,
            "protocol_status": self.protocol_status,
            "live_only": self.live_only,
            "anonymized": norm,
            "anonymization_version": NORM_ANON_VERSION if norm else None,
            "source_url": self.source_url,
            "source_key": self.source_key,
            "fetched_at": self.fetched_at,
            "text": self.text,
            "openalex_cited_by": self.openalex_cited_by,
        }
