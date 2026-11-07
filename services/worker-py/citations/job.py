"""citations.extract job handler (core/jobs.py contract). Payloads carry ids only; results hold counts, never text.

  {"recordId": "<uuid>"} or {"recordIds": [...]}   rules over masked_text; saves edges and queue rows. When a batch
                                                   client is configured, the masked paragraphs with doctrine
                                                   markers are also submitted to Haiku 5.5 (Batch API) and a
                                                   follow-up job collects the answer.
  {"batchId": "...", "recordIds": [...], "poll": n} collects a finished batch, re-extracts with the model items
                                                   and saves again (rules and model cross-checked).

Records outside the network scope (plan: 1.0 is HGK, IBK, AYM) are skipped unless KAZUIST_CITATIONS_SCOPE=all.
A record without masked_text raises NotServable: it is not read at all.
"""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, List, Optional, Protocol

from core.jobs import ClaimedJob, JobType

from .llm import BatchApi, build_batch_requests, answer_text, parse_custom_id, parse_items
from .pipeline import extract_record
from .scoring import in_network_scope
from .store import CitationStore

POLL_SECONDS = 600
MAX_POLLS = 150  # about 25 hours, the Batch API window is 24 hours
MAX_RECORDS = 500


class InvalidPayload(Exception):
    pass


class RecordNotFound(Exception):
    pass


class JobSink(Protocol):
    def enqueue(self, payload: Dict[str, Any], delay_seconds: int, dedupe_key: Optional[str]) -> None: ...


ENQUEUE_SQL = """
INSERT INTO jobs (type, payload, dedupe_key, run_after)
VALUES ('citations.extract'::job_type, %(payload)s::jsonb, %(dedupe_key)s, now() + make_interval(secs => %(delay)s))
ON CONFLICT (type, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running') DO NOTHING
"""


class SqlJobSink:
    def __init__(self, cur: Any):
        self.cur = cur

    def enqueue(self, payload: Dict[str, Any], delay_seconds: int, dedupe_key: Optional[str]) -> None:
        import json

        self.cur.execute(ENQUEUE_SQL, {"payload": json.dumps(payload), "dedupe_key": dedupe_key, "delay": delay_seconds})


def _ids(payload: Any) -> List[str]:
    if not isinstance(payload, dict):
        raise InvalidPayload("payload")
    ids = payload.get("recordIds")
    if ids is None and isinstance(payload.get("recordId"), str):
        ids = [payload["recordId"]]
    if not isinstance(ids, list) or not ids or len(ids) > MAX_RECORDS or not all(isinstance(i, str) and i for i in ids):
        raise InvalidPayload("recordIds")
    return ids


def make_citations_handler(
    store_factory: Callable[[], CitationStore],
    sink: Optional[JobSink] = None,
    batch: Optional[BatchApi] = None,
    scope_all: Optional[bool] = None,
) -> Callable[[ClaimedJob], Dict[str, Any]]:
    scope_all = (os.environ.get("KAZUIST_CITATIONS_SCOPE") == "all") if scope_all is None else scope_all

    def run_rules(ids: List[str]) -> Dict[str, Any]:
        store = store_factory()
        done = skipped = published = queued = 0
        batch_requests: List[Dict[str, Any]] = []
        submitted: List[str] = []
        for rid in ids:
            loaded = store.load(rid)  # NotServable propagates: nothing is read
            if loaded is None:
                raise RecordNotFound(rid)
            m = loaded.meta
            if not scope_all and not in_network_scope(m.court, m.chamber):
                skipped += 1
                continue
            ex = extract_record(loaded.masked_text, m, store.index(), store.registry())
            store.save(rid, ex)
            done += 1
            published += ex.publishable_edges
            queued += len(ex.queue)
            if batch is not None:
                reqs = build_batch_requests(rid, loaded.masked_text)
                if reqs:
                    batch_requests.extend(reqs)
                    submitted.append(rid)
        result: Dict[str, Any] = {"records": done, "skipped": skipped, "published": published, "queued": queued}
        if batch is not None and batch_requests:
            batch_id = batch.create(batch_requests)
            result["batchId"] = batch_id
            result["batchRecords"] = len(submitted)
            if sink is not None:
                sink.enqueue({"batchId": batch_id, "recordIds": submitted, "poll": 0}, POLL_SECONDS, f"citations-batch:{batch_id}")
        return result

    def collect(payload: Dict[str, Any]) -> Dict[str, Any]:
        if batch is None:
            raise InvalidPayload("batch client not configured")
        batch_id = payload["batchId"]
        ids = _ids(payload)
        poll = int(payload.get("poll", 0))
        if not isinstance(batch_id, str) or not batch_id:
            raise InvalidPayload("batchId")
        st = batch.status(batch_id)
        if st.get("processing_status") != "ended":
            if poll >= MAX_POLLS:
                return {"batchId": batch_id, "status": "timeout"}
            if sink is not None:
                sink.enqueue({"batchId": batch_id, "recordIds": ids, "poll": poll + 1}, POLL_SECONDS,
                             f"citations-batch:{batch_id}:{poll + 1}")
            return {"batchId": batch_id, "status": "pending", "poll": poll}
        answers: Dict[str, List[str]] = {}
        for line in batch.results(batch_id):
            parsed = parse_custom_id(str(line.get("custom_id", "")))
            txt = answer_text(line)
            if parsed and txt:
                answers.setdefault(parsed[0], []).append(txt)
        store = store_factory()
        merged = 0
        for rid in ids:
            loaded = store.load(rid)
            if loaded is None:
                continue
            items = []
            for txt in answers.get(rid, []):
                items.extend(parse_items(txt, loaded.masked_text))
            ex = extract_record(loaded.masked_text, loaded.meta, store.index(), store.registry(), items if rid in answers else None)
            store.save(rid, ex)
            merged += 1
        return {"batchId": batch_id, "status": "ended", "records": merged}

    def handle(job: ClaimedJob) -> Dict[str, Any]:
        if job.type is not JobType.CITATIONS_EXTRACT:
            raise InvalidPayload("type")
        if isinstance(job.payload, dict) and "batchId" in job.payload:
            return collect(job.payload)
        return run_rules(_ids(job.payload))

    return handle


def handlers(store_factory: Callable[[], CitationStore], sink: Optional[JobSink] = None, batch: Optional[BatchApi] = None):
    """Registration helper for JobConsumer."""
    return {JobType.CITATIONS_EXTRACT: make_citations_handler(store_factory, sink, batch)}
