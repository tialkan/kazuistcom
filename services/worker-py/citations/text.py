"""Turkish aware text helpers. `tr_lower` keeps string length so offsets found on the lowered text are valid
on the original."""

from __future__ import annotations

import datetime
import re
from typing import Optional

_LOWER = str.maketrans({"İ": "i", "I": "ı"})
_FOLD = str.maketrans(
    {
        "ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u",
        "Ç": "c", "Ğ": "g", "İ": "i", "I": "i", "Ö": "o", "Ş": "s", "Ü": "u",
        "â": "a", "î": "i", "û": "u", "Â": "a", "Î": "i", "Û": "u",
    }
)


def tr_lower(s: str) -> str:
    """Lower case with Turkish dotted and dotless i; same length as `s`."""
    out = s.translate(_LOWER).lower()
    if len(out) != len(s):  # exotic letters whose lower case is longer: keep offsets valid
        out = "".join(c if len(c.translate(_LOWER).lower()) != 1 else c.translate(_LOWER).lower() for c in s)
    return out


def fold(s: str) -> str:
    """Lower case, ASCII fold of Turkish letters, single spaces. For keys and comparisons, not for display."""
    s = s.translate(_FOLD).lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def iso_date(raw: Optional[str]) -> Optional[str]:
    """'13.11.2013', '17/6/2015' to ISO; None when it is not a real calendar date."""
    if not raw:
        return None
    m = re.fullmatch(r"\s*(\d{1,2})[./](\d{1,2})[./](\d{4})\s*", raw)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return datetime.date(y, mo, d).isoformat()
    except ValueError:
        return None
