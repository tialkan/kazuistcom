"""anon.run job handler (core/jobs.py contract). Payload: {"recordId": "<uuid>"}; carries ids only.

The returned result is stored in jobs.result and therefore holds counts and versions, never text.

The NER backend comes from KAZUIST_NER_BACKEND (anonymizer/ner.py) unless one is passed in. It is loaded once
when the handler is built; a configured but missing model raises there, so the worker never falls back to
the rule layer alone without saying so. Unset means the rule layer only ("ner.none" in the version).

Fail closed: outside development (KAZUIST_ENV, ner.ner_required) a run without an NER model is saved as not
publishable. The spans and a review row with payload.blocked = "ner_unavailable" are written,
records.anonymized is false and records.masked_text NULL, so an earlier published text of the record is
withdrawn too and embed.chunks is not queued. Saving instead of raising matters: a raised error rolls the
transaction back and would leave an earlier masked_text in place.

Editor approval (store.py): when the latest decided anonymization item of the same anonymizationVersion is an
"onay" that lists every review item of this run, the run publishes (masked_text, anonymized, embed.chunks) and
opens no new item. The admin panel records the decision; queueing this run afterwards is approvals.py's job.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from core.jobs import ClaimedJob, JobType, json_log

from .ner import NerBackend, backend_from_env, ner_required
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
    require_ner: Optional[bool] = None,
) -> Callable[[ClaimedJob], Dict[str, Any]]:
    """`require_ner` None reads KAZUIST_ENV once, here."""
    ner = ner or backend_from_env()
    required = ner_required() if require_ner is None else require_ner

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
        result = anonymize(loaded.text, court=loaded.court, source_key=loaded.source_key,
                           policy=policy or default_policy(), ner=ner, require_ner=required)
        if result.review and result.blocked is None:
            result = result.with_approval(store.approval(record_id, result.anonymization_version))
        store.save(record_id, result)
        if result.blocked:
            # Ids and the reason only; the record text never reaches the log.
            json_log("anon.run held for review", reason=result.blocked, recordId=record_id)
        elif result.approval is not None:
            json_log("anon.run published after editor approval", recordId=record_id,
                     reviewId=result.approval.review_id)
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
