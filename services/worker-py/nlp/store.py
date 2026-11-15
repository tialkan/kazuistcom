"""Persistence for embed.chunks. SQL only; the schema belongs to packages/db (records, chunks, jobs).

Consumer rule (ADR-0026, docs/istekler/mimar-yonlendirme-2-casuist-anonimlestirme-altyapi.md):
1. Read records.masked_text, md5(masked_text) and records.type. The raw records.text column is never selected
   (ADR-0023: masked_text is the only servable text; NULL means not servable and not indexed).
2. Chunk and embed outside any transaction.
3. In the write transaction lock the record row FOR SHARE and compare the digest. Same digest: delete the
   record's chunks and insert the new ones, so a repeated job replaces rather than duplicates. Different
   digest: raise StaleMaskedText, the job fails and its retry reads the new text. masked_text NULL or record
   gone: nothing is written (the records trigger has already deleted the chunks).

chunks.tsv is a generated column (to_tsvector('turkish', text)), so the full text index fills itself. No
statement logs text.
"""

from __future__ import annotations

import hashlib
from typing import Any, Callable, Dict, List, Optional, Protocol, Sequence, Tuple

from .chunk import Chunk

READ_SQL = """
SELECT masked_text, md5(masked_text), type::text FROM records WHERE id = %(id)s AND masked_text IS NOT NULL
"""
LOCK_SQL = "SELECT md5(masked_text) FROM records WHERE id = %(id)s FOR SHARE"
DELETE_CHUNKS_SQL = "DELETE FROM chunks WHERE record_id = %(id)s"
INSERT_CHUNK_SQL = """
INSERT INTO chunks (record_id, seq, section, text, char_start, char_end, embedding, embedding_model)
VALUES (%(id)s, %(seq)s, %(section)s, %(text)s, %(start)s, %(end)s, %(embedding)s::halfvec, %(model)s)
"""


class StaleMaskedText(Exception):
    """masked_text changed between reading and writing; the retry reads the new text."""


def text_digest(text: str) -> str:
    """md5 of the UTF-8 bytes, equal to PostgreSQL md5(text) in a UTF8 database."""
    return hashlib.md5(text.encode("utf-8")).hexdigest()


def vector_literal(vec: Optional[Sequence[float]]) -> Optional[str]:
    return None if vec is None else "[" + ",".join(format(float(x), ".7g") for x in vec) + "]"


class EmbedStore(Protocol):
    def read(self, record_id: str) -> Optional[Tuple[str, str, Optional[str]]]:
        """(masked_text, digest, record type) or None when the record is missing or not servable. The type
        decides whether the text is cut along decision sections (chunk.SECTIONED_TYPES)."""

    def replace(
        self,
        record_id: str,
        digest: str,
        chunks: Sequence[Chunk],
        vectors: Sequence[Optional[Sequence[float]]],
        model: Optional[str],
    ) -> bool:
        """Write the chunks if the digest still matches. False when the record is gone or no longer servable;
        raises StaleMaskedText when the text changed."""


Connect = Callable[[], Any]


class SqlEmbedStore:
    """Each call runs in its own psycopg connection context (commit on success, rollback on exception), so the
    slow embedding step holds no lock and no open transaction."""

    def __init__(self, connect: Connect):
        self.connect = connect

    def read(self, record_id: str) -> Optional[Tuple[str, str, Optional[str]]]:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(READ_SQL, {"id": record_id})
                rows = cur.fetchall()
        return (rows[0][0], rows[0][1], rows[0][2]) if rows else None

    def replace(
        self,
        record_id: str,
        digest: str,
        chunks: Sequence[Chunk],
        vectors: Sequence[Optional[Sequence[float]]],
        model: Optional[str],
    ) -> bool:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(LOCK_SQL, {"id": record_id})
                rows = cur.fetchall()
                current = rows[0][0] if rows else None
                if current is None:
                    return False
                if current != digest:
                    raise StaleMaskedText(record_id)
                cur.execute(DELETE_CHUNKS_SQL, {"id": record_id})
                params = [
                    {
                        "id": record_id,
                        "seq": c.seq,
                        "section": c.section,
                        "text": c.text,
                        "start": c.char_start,
                        "end": c.char_end,
                        "embedding": vector_literal(v),
                        "model": model if v is not None else None,
                    }
                    for c, v in zip(chunks, vectors, strict=True)
                ]
                if params:
                    cur.executemany(INSERT_CHUNK_SQL, params)
        return True


class MemoryEmbedStore:
    """In memory store for tests. records maps id -> {"text": raw, "masked_text": servable or None, "type":
    record type, optional}; the raw text is kept only so tests can prove it never reaches a chunk."""

    def __init__(self, records: Optional[Dict[str, Dict[str, Optional[str]]]] = None):
        self.records = records or {}
        self.chunks: Dict[str, List[Dict[str, Any]]] = {}
        self.before_write: Optional[Callable[[str], None]] = None

    def set_masked_text(self, record_id: str, masked: Optional[str]) -> None:
        """What the records trigger does: a change deletes the chunks."""
        self.records[record_id]["masked_text"] = masked
        self.chunks.pop(record_id, None)

    def read(self, record_id: str) -> Optional[Tuple[str, str, Optional[str]]]:
        masked = self.records.get(record_id, {}).get("masked_text")
        return None if masked is None else (masked, text_digest(masked), self.records[record_id].get("type"))

    def replace(
        self,
        record_id: str,
        digest: str,
        chunks: Sequence[Chunk],
        vectors: Sequence[Optional[Sequence[float]]],
        model: Optional[str],
    ) -> bool:
        if self.before_write:
            self.before_write(record_id)
        masked = self.records.get(record_id, {}).get("masked_text")
        if masked is None:
            return False
        if text_digest(masked) != digest:
            raise StaleMaskedText(record_id)
        self.chunks[record_id] = [
            {
                "seq": c.seq,
                "section": c.section,
                "text": c.text,
                "char_start": c.char_start,
                "char_end": c.char_end,
                "embedding": None if v is None else list(v),
                "embedding_model": model if v is not None else None,
            }
            for c, v in zip(chunks, vectors, strict=True)
        ]
        return True
