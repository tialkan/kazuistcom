"""Rule set of SRS 6.2 as the Python side sees it (same keys as apps/web/src/app/yazma/_cekirdek/kural-semasi.ts)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Tuple

PAGE_NUM_POSITIONS = ("alt-orta", "alt-sag", "ust-sag")
KINDS = ("tez", "makale")

# Tolerances: Word stores margins in twips and sizes in half points, so exact equality is too strict.
MARGIN_TOLERANCE_CM = 0.1
SIZE_TOLERANCE_PT = 0.25
LINE_TOLERANCE = 0.03
INDENT_TOLERANCE_CM = 0.1
SPACING_TOLERANCE_PT = 0.6


class RuleError(ValueError):
    """The rule payload is malformed. The message names the field, never a value from a document."""


@dataclass
class Rules:
    kind: str
    institution: str = ""
    paper: str = "A4"
    m_top: float = 3.0
    m_bottom: float = 2.5
    m_left: float = 3.5
    m_right: float = 2.5
    font: str = "Times New Roman"
    size: float = 12.0
    foot_size: float = 10.0
    line: float = 1.5
    indent: float = 1.25
    sp_after: float = 6.0
    h1_size: float = 14.0
    h1_upper: bool = True
    h2_size: float = 12.0
    h3_size: float = 12.0
    page_num: str = "alt-orta"
    front_roman: bool = True
    citation: str = ""
    sections: List[str] = field(default_factory=list)
    word_limit: Optional[Tuple[Optional[int], Optional[int]]] = None
    abs_limit: Optional[Tuple[Optional[int], Optional[int]]] = None

    @classmethod
    def from_dict(cls, kind: str, data: Mapping[str, Any]) -> "Rules":
        if kind not in KINDS:
            raise RuleError("kind")
        r = cls(kind=kind)

        def num(key: str, attr: str, lo: float, hi: float) -> None:
            if key not in data or data[key] is None:
                return
            v = data[key]
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
                raise RuleError(key)
            setattr(r, attr, float(v))

        num("mTop", "m_top", 0.5, 6)
        num("mBottom", "m_bottom", 0.5, 6)
        num("mLeft", "m_left", 0.5, 6)
        num("mRight", "m_right", 0.5, 6)
        num("size", "size", 8, 20)
        num("footSize", "foot_size", 6, 18)
        num("line", "line", 0.8, 3)
        num("indent", "indent", 0, 4)
        num("spAfter", "sp_after", 0, 48)
        num("h1Size", "h1_size", 6, 36)
        num("h2Size", "h2_size", 6, 36)
        num("h3Size", "h3_size", 6, 36)
        for key, attr in (("h1Upper", "h1_upper"), ("frontRoman", "front_roman")):
            if key in data and data[key] is not None:
                if not isinstance(data[key], bool):
                    raise RuleError(key)
                setattr(r, attr, data[key])
        for key, attr, maxlen in (("institution", "institution", 200), ("font", "font", 60),
                                  ("citation", "citation", 200), ("paper", "paper", 20)):
            if key in data and data[key] is not None:
                if not isinstance(data[key], str) or len(data[key]) > maxlen:
                    raise RuleError(key)
                setattr(r, attr, data[key])
        if "pageNum" in data and data["pageNum"] is not None:
            if data["pageNum"] not in PAGE_NUM_POSITIONS:
                raise RuleError("pageNum")
            r.page_num = data["pageNum"]
        secs = data.get("sections")
        if secs is not None:
            if not isinstance(secs, list) or len(secs) > 40 or not all(isinstance(s, str) and len(s) <= 120 for s in secs):
                raise RuleError("sections")
            r.sections = list(secs)
        for key, attr in (("wordLimit", "word_limit"), ("absLimit", "abs_limit")):
            v = data.get(key)
            if v is None:
                continue
            if not isinstance(v, dict):
                raise RuleError(key)
            lo, hi = v.get("min"), v.get("max")
            for x in (lo, hi):
                if x is not None and (isinstance(x, bool) or not isinstance(x, int) or x < 0):
                    raise RuleError(key)
            if lo is None and hi is None:
                continue
            setattr(r, attr, (lo, hi))
        return r


def rules_summary(rules: Rules) -> Dict[str, Any]:
    return {"kind": rules.kind, "paper": rules.paper}
