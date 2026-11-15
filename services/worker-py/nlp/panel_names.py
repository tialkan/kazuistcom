"""Chunk text without the panel member names that an open source publishes (plan Ek E, FR-21, FR-80).

For an open source (anonymizer policy open_source_match, today AYM) records.masked_text keeps the members the
decision lists on its own panel lines readable, and the record page shows them (Ek E: "Yalnız resmî kaynak
açık yayımlıyorsa korunur"). The same row and the general rules keep person names out of every search index
and out of source based summaries: chunks.text, therefore chunks.tsv, the passage embeddings and the passages
the summary prompt is built from, carry anonymizer.public_names.index_text(masked_text) instead, where every
such name is "[Üye n]" (istek anonimlestirme-onay-ve-acik-kaynak.md madde 4).

Chunk boundaries and char_start/char_end stay those of masked_text (nlp/chunk.py, the packages/casuist
parity), so "Dayanağı göster" still points into the text the record page shows; only the chunk text differs.
The names are found on the whole masked text, once, so a later mention in a passage without the panel lines
gets the same number, and a name cut by a passage boundary is replaced on both sides.

index_text() returns only a string. member_replacements() computes the same replacements with the same
anonymizer functions and labels and then checks that applying them to the whole text gives exactly
index_text(masked_text); if the anonymizer ever changes index_text without this module following, the job
raises IndexTextMismatch and writes nothing (fail closed). Text without readable panel names comes back
unchanged. No function here logs or stores text.
"""

from __future__ import annotations

from dataclasses import replace
from itertools import accumulate
from typing import Dict, List, Sequence, Tuple

from anonymizer.public_names import MEMBER_LABEL, index_text
from anonymizer.roles import find_panel_members, propagate
from anonymizer.spans import resolve_overlaps

from .chunk import Chunk, from_units, to_units

# [start, end) and the label; offsets are Python indexes into masked_text, or UTF-16 units after _to_units.
Replacement = Tuple[int, int, str]


class IndexTextMismatch(Exception):
    """The replacements computed here do not give anonymizer.public_names.index_text; nothing is written."""


def _apply(text: str, reps: Sequence[Replacement]) -> str:
    parts: List[str] = []
    cursor = 0
    for start, end, label in reps:
        parts.append(text[cursor:start])
        parts.append(label)
        cursor = end
    parts.append(text[cursor:])
    return "".join(parts)


def _to_units(text: str, reps: List[Replacement]) -> List[Replacement]:
    """Code point offsets to UTF-16 offsets, the unit of chunk offsets (a character above U+FFFF is two)."""
    if not reps or not text or max(text) <= "\uffff":
        return reps
    at = [0, *accumulate(2 if ch > "\uffff" else 1 for ch in text)]
    return [(at[s], at[e], label) for s, e, label in reps]


def member_replacements(masked: str) -> List[Replacement]:
    """Readable panel names of masked_text and their other mentions, with their "[Üye n]" labels, sorted and
    non overlapping, in UTF-16 units. Empty when the text shows no panel name (every closed source record)."""
    panel = find_panel_members(masked)
    if not panel:
        return []
    labels: Dict[str, str] = {}
    reps: List[Replacement] = []
    for s in resolve_overlaps([*panel, *propagate(masked, panel)]):
        key = s.key or f"@{s.start}"
        if key not in labels:
            labels[key] = f"[{MEMBER_LABEL} {len(labels) + 1}]"
        reps.append((s.start, s.end, labels[key]))
    if _apply(masked, reps) != index_text(masked):
        raise IndexTextMismatch()
    return _to_units(masked, reps)


def index_chunks(masked: str, chunks: Sequence[Chunk]) -> List[Chunk]:
    """The chunks of masked_text with their text taken from index_text(masked_text): every replacement that
    overlaps a chunk is cut to the chunk and written as its label. Offsets, sequence and section unchanged."""
    reps = member_replacements(masked)
    if not reps:
        return list(chunks)
    units = to_units(masked)
    out: List[Chunk] = []
    for c in chunks:
        parts: List[str] = []
        cursor = c.char_start
        for start, end, label in reps:
            if end <= c.char_start or start >= c.char_end:
                continue
            parts.append(units[cursor : max(start, c.char_start)])
            parts.append(label)
            cursor = min(end, c.char_end)
        parts.append(units[cursor : c.char_end])
        out.append(replace(c, text=from_units("".join(parts))))
    return out
