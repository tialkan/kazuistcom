"""Text for search indexes and summaries without the names an open source publishes (plan Ek E).

For an open source (policy open_source_match, e.g. AYM) records.masked_text keeps the members the decision lists
on its own panel lines readable: Ek E keeps them ("Yalnız resmî kaynak açık yayımlıyorsa korunur"). The same
row and the general rules forbid their use elsewhere: no search, filter or profile by person name, "kişi adları
hiçbir arama dizinine ve öneri listesine girmez", no person name in source based summaries and game cards
(FR-21, FR-80). index_text() is the text for those uses: every name still readable on a panel line of the
masked text, and its other mentions there (full name and surname, any apostrophe ending outside), becomes
"[Üye n]", numbered by first appearance, the same person always the same number. Text without readable panel
names comes back unchanged, so it is safe to apply to every record.

Pure function over masked text: reads no original text, logs nothing.
"""

from __future__ import annotations

from typing import Dict, List

from .roles import find_panel_members, propagate
from .spans import Span, resolve_overlaps

MEMBER_LABEL = "Üye"


def index_text(masked_text: str) -> str:
    panel = find_panel_members(masked_text)
    if not panel:
        return masked_text
    spans: List[Span] = resolve_overlaps([*panel, *propagate(masked_text, panel)])
    labels: Dict[str, str] = {}
    parts: List[str] = []
    cursor = 0
    for s in spans:
        key = s.key or f"@{s.start}"
        if key not in labels:
            labels[key] = f"[{MEMBER_LABEL} {len(labels) + 1}]"
        parts.append(masked_text[cursor : s.start])
        parts.append(labels[key])
        cursor = s.end
    parts.append(masked_text[cursor:])
    return "".join(parts)
