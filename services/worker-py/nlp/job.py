"""embed.chunks job handler (core/jobs.py contract, EmbedChunksPayload in packages/contracts/src/jobs.ts).

Payload {"recordId": "<uuid>"}, nothing else. Producers: the records trigger of migration 0004 (whenever
masked_text gets a value) and anon.run. The handler reads records.masked_text only, splits it with the same
rule as packages/casuist (nlp/chunk.py), embeds the passages when a model is configured and replaces the
record's chunks. Without a model the chunks are written without vectors: full text search works, the vector
leg reports itself degraded.

jobs.result holds counts and the model id, never text. Logs carry class names only.
"""

from __future__ import annotations

import uuid
from typing import Any, Callable, Dict, List, Optional, Sequence

from core.jobs import ClaimedJob, JobType

from .chunk import Chunk, chunk_text
from .embedder import Log, PassageEmbedder, embedder_from_env, json_log, valid_vectors
from .store import EmbedStore, SqlEmbedStore


class InvalidPayload(Exception):
    pass


def record_id_of(job: ClaimedJob) -> str:
    """EmbedChunksPayload is a strict object with one uuid field; anything else is rejected."""
    if job.type is not JobType.EMBED_CHUNKS:
        raise InvalidPayload("type")
    payload = job.payload
    if (
        not isinstance(payload, dict)
        or set(payload) != {"recordId"}
        or not isinstance(payload["recordId"], str)
    ):
        raise InvalidPayload("recordId")
    try:
        uuid.UUID(payload["recordId"])
    except ValueError:
        raise InvalidPayload("recordId") from None
    return payload["recordId"]


def embed_chunks(
    embedder: PassageEmbedder, chunks: Sequence[Chunk], log: Log
) -> tuple[List[Optional[List[float]]], Optional[str]]:
    """Vectors for the chunks, or all None when there is no model or embedding fails (logged, no text)."""
    none: List[Optional[List[float]]] = [None] * len(chunks)
    if embedder.model is None or not chunks:
        return none, None
    try:
        vectors = embedder.embed([c.text for c in chunks], "passage")
    except Exception as exc:  # noqa: BLE001 - degrade to text only chunks; class name only
        log("embedding failed, chunks are written without vectors", error=type(exc).__name__)
        return none, None
    if not valid_vectors(vectors, len(chunks)):
        log("embedding failed, chunks are written without vectors", error="InvalidVectors")
        return none, None
    return [list(v) for v in vectors], embedder.model


def make_embed_chunks_handler(
    store: EmbedStore, embedder: PassageEmbedder, log: Log = json_log
) -> Callable[[ClaimedJob], Dict[str, Any]]:
    def handle(job: ClaimedJob) -> Dict[str, Any]:
        record_id = record_id_of(job)
        loaded = store.read(record_id)
        if loaded is None:
            return {
                "recordId": record_id,
                "chunks": 0,
                "vectors": 0,
                "embeddingModel": None,
                "skipped": "not_servable",
            }
        masked, digest = loaded
        chunks = chunk_text(masked)
        vectors, model = embed_chunks(embedder, chunks, log)
        if not store.replace(record_id, digest, chunks, vectors, model):
            return {
                "recordId": record_id,
                "chunks": 0,
                "vectors": 0,
                "embeddingModel": None,
                "skipped": "not_servable",
            }
        return {
            "recordId": record_id,
            "chunks": len(chunks),
            "vectors": sum(v is not None for v in vectors),
            "embeddingModel": model,
        }

    return handle


def make_embed_handler(
    connect: Callable[[], Any], embedder: Optional[PassageEmbedder] = None, log: Log = json_log
) -> Callable[[ClaimedJob], Dict[str, Any]]:
    """Registration entry for core.main.build_handlers: psycopg connections, embedder from the environment
    (loaded once here; a missing model is logged and means no vectors, never a startup failure)."""
    return make_embed_chunks_handler(SqlEmbedStore(connect), embedder or embedder_from_env(log=log), log)
