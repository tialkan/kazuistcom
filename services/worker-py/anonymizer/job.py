"""anon.run job handler (core/jobs.py contract). Payload: {"recordId": "<uuid>"}; carries ids only.

The returned result is stored in jobs.result and therefore holds counts and versions, never text.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from core.jobs import ClaimedJob, JobType

from .ner import NerBackend, NullBackend
from .pipeline import anonymize
from .policy import Policy, default_policy
from .store import AnonStore


class RecordNotFound(Exception):
    pass


class InvalidPayload(Exception):
    pass


def make_anon_run_handler(
    store_factory: Callable[[], AnonStore],
    ner: Optional[NerBackend] = None,
    policy: Optional[Policy] = None,
) -> Callable[[ClaimedJob], Dict[str, Any]]:
    ner = ner or NullBackend()

    def handle(job: ClaimedJob) -> Dict[str, Any]:
        if job.type is not JobType.ANON_RUN:
            raise InvalidPayload("type")
        record_id = job.payload.get("recordId") if isinstance(job.payload, dict) else None
        if not isinstance(record_id, str) or not record_id:
            raise InvalidPayload("recordId")
        store = store_factory()
        loaded = store.load(record_id)
        if loaded is None:
            raise RecordNotFound(record_id)
        text, court = loaded
        result = anonymize(text, court=court, policy=policy or default_policy(), ner=ner)
        store.save(record_id, result)
        return {
            "recordId": record_id,
            "spans": len(result.spans),
            "review": len(result.review),
            "publishable": result.publishable,
            "anonymizationVersion": result.anonymization_version,
        }

    return handle


def handlers(store_factory: Callable[[], AnonStore], ner: Optional[NerBackend] = None):
    """Registration helper for JobConsumer."""
    return {JobType.ANON_RUN: make_anon_run_handler(store_factory, ner)}
