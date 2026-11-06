"""Checks a DOCX against a rule set (SRS 6.2) and reports, per rule field, whether the file follows it.

Results carry values and counts only: no paragraph text, no author, no file name. Statuses:
uygun (follows), uyumsuz (differs), yok (nothing to measure, for example no footnotes yet) and
elle (cannot be decided from the file; the user checks it by hand).
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from .reader import Docx, Para, Section, read_docx
from .rules import (
    INDENT_TOLERANCE_CM,
    LINE_TOLERANCE,
    MARGIN_TOLERANCE_CM,
    SIZE_TOLERANCE_PT,
    SPACING_TOLERANCE_PT,
    Rules,
)

TWIPS_PER_CM = 566.929
SHARE_OK = 0.95  # a field follows the rule when at least this share of the measured text does
BODY_MIN_CHARS = 20

PAPERS = {"A4": (11906, 16838), "A5": (8391, 11906), "B5": (9979, 14173), "Letter": (12240, 15840)}
ROMAN = ("lowerRoman", "upperRoman")

_WORD = re.compile(r"[^\W_]+(?:['’-][^\W_]+)*", re.UNICODE)


def tr_upper(s: str) -> str:
    return s.replace("i", "İ").replace("ı", "I").upper()


def tr_key(s: str) -> str:
    """Lower case, no diacritics: the matching key for section names."""
    s = s.replace("İ", "i").replace("I", "ı").lower().replace("ı", "i")
    out = []
    for ch in s:
        out.append({"ç": "c", "ğ": "g", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"}.get(ch, ch))
    return " ".join("".join(out).split())


def count_words(text: str) -> int:
    return len(_WORD.findall(text))


@dataclass
class Finding:
    key: str
    status: str
    expected: Any = None
    found: Any = None
    share: Optional[float] = None
    detail: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"key": self.key, "status": self.status, "expected": self.expected}
        if self.found is not None:
            d["found"] = self.found
        if self.share is not None:
            d["share"] = round(self.share, 3)
        if self.detail is not None:
            d["detail"] = self.detail
        return d


def _is_body(p: Para) -> bool:
    if p.in_toc or p.outline is not None and p.outline <= 2:
        return False
    if p.length < BODY_MIN_CHARS:
        return False
    name = p.style_name
    if name.startswith(("footnote", "header", "footer", "caption", "title")):
        return False
    return p.ppr.get("jc") not in ("center", "right", "end")


def _measure(
    items: Iterable[Tuple[Any, int]], ok: Callable[[Any], bool]
) -> Tuple[Optional[float], Any]:
    """Share of weight that satisfies `ok`, and the heaviest value. (None, None) when nothing was measured."""
    weights: Counter = Counter()
    for value, weight in items:
        weights[value] += weight
    total = sum(weights.values())
    if not total:
        return None, None
    good = sum(w for v, w in weights.items() if ok(v))
    return good / total, weights.most_common(1)[0][0]


def _status(share: Optional[float]) -> str:
    if share is None:
        return "yok"
    return "uygun" if share >= SHARE_OK else "uyumsuz"


def _font_key(name: Any) -> str:
    return "".join(str(name).lower().split())


def _run_items(paras: Iterable[Para], key: str) -> List[Tuple[Any, int]]:
    return [(r.get(key), r["len"]) for p in paras for r in p.runs]


def _line_value(p: Para) -> Any:
    line = p.ppr.get("line")
    rule = p.ppr.get("line_rule", "auto")
    if line is None:
        return 1.0
    if rule == "auto":
        return round(line / 240.0, 3)
    return f"{rule}:{round(line / 20.0, 1)}"


def _cm(twips: Optional[int]) -> Optional[float]:
    return None if twips is None else round(twips / TWIPS_PER_CM, 2)


def _check_margins(sections: List[Section], rules: Rules) -> List[Finding]:
    out: List[Finding] = []
    for key, attr_name, want in (
        ("mTop", "top", rules.m_top),
        ("mBottom", "bottom", rules.m_bottom),
        ("mLeft", "left", rules.m_left),
        ("mRight", "right", rules.m_right),
    ):
        found = [_cm(getattr(s, attr_name)) for s in sections]
        if not sections or any(v is None for v in found):
            out.append(Finding(key, "yok", want, detail="no_section"))
            continue
        bad = [v for v in found if abs(v - want) > MARGIN_TOLERANCE_CM]  # type: ignore[operator]
        distinct = sorted(set(found))  # type: ignore[type-var]
        out.append(Finding(key, "uyumsuz" if bad else "uygun", want, distinct[0] if len(distinct) == 1 else distinct))
    return out


def _check_paper(sections: List[Section], rules: Rules) -> Finding:
    w, h = PAPERS.get(rules.paper, PAPERS["A4"])
    found = [(s.page_w, s.page_h) for s in sections]
    if not sections or any(a is None or b is None for a, b in found):
        return Finding("paper", "yok", rules.paper, detail="no_section")
    ok = all(abs(a - w) <= 30 and abs(b - h) <= 30 for a, b in found)  # type: ignore[operator]
    return Finding("paper", "uygun" if ok else "uyumsuz", rules.paper, None if ok else "other_size")


def _alignment_name(kind: Optional[str], align: Optional[str]) -> str:
    if kind is None:
        return "yok"
    if kind == "footer":
        return {"center": "alt-orta", "right": "alt-sag"}.get(align or "", "alt-sol")
    return {"right": "ust-sag", "center": "ust-orta"}.get(align or "", "ust-sol")


def _check_numbering(docx: Docx, rules: Rules) -> List[Finding]:
    out: List[Finding] = []
    secs = docx.sections
    positions = [_alignment_name(*pf) for pf in docx.page_fields]
    if not secs:
        return [Finding("pageNum", "yok", rules.page_num, detail="no_section")]
    ok = all(p == rules.page_num for p in positions)
    out.append(
        Finding("pageNum", "uygun" if ok else "uyumsuz", rules.page_num, positions[0] if len(set(positions)) == 1 else sorted(set(positions)))
    )
    if rules.kind == "tez":
        two = len(secs) >= 2
        fmt_ok = two and ((secs[0].num_fmt in ROMAN) == rules.front_roman) and secs[-1].num_fmt == "decimal"
        starts_ok = all(s.num_start == 1 for s in secs)
        if not two:
            out.append(Finding("frontRoman", "uyumsuz", rules.front_roman, "single_section", detail="needs_two_sections"))
        else:
            out.append(
                Finding("frontRoman", "uygun" if fmt_ok and starts_ok else "uyumsuz", rules.front_roman,
                        [s.num_fmt for s in secs], detail=None if starts_ok else "start_not_one")
            )
    return out


def _headings(paras: List[Para], level: int) -> List[Para]:
    return [p for p in paras if not p.in_toc and p.outline == level and p.length > 0]


def _check_headings(docx: Docx, rules: Rules) -> List[Finding]:
    out: List[Finding] = []
    for level, key, want in ((0, "h1Size", rules.h1_size), (1, "h2Size", rules.h2_size), (2, "h3Size", rules.h3_size)):
        hs = _headings(docx.paragraphs, level)
        share, common = _measure(
            _run_items(hs, "size"), lambda v, w=want: v is not None and abs(v - w) <= SIZE_TOLERANCE_PT
        )
        out.append(Finding(key, _status(share), want, common, None if share is None else share, None if hs else "no_headings"))
    if rules.kind == "tez":
        hs = _headings(docx.paragraphs, 0)
        if not hs:
            out.append(Finding("h1Upper", "yok", rules.h1_upper, detail="no_headings"))
        else:
            upper = [p for p in hs if tr_upper(p.text.strip()) == p.text.strip() or any(r.get("caps") for r in p.runs)]
            share = len(upper) / len(hs)
            matches = share if rules.h1_upper else 1 - share
            out.append(Finding("h1Upper", "uygun" if matches >= SHARE_OK else "uyumsuz", rules.h1_upper, share >= 0.5, matches))
    return out


def _check_body(docx: Docx, rules: Rules) -> List[Finding]:
    body = [p for p in docx.paragraphs if _is_body(p)]
    detail = None if body else "no_body_text"
    out: List[Finding] = []

    def add(key: str, want: Any, items: List[Tuple[Any, int]], ok: Callable[[Any], bool]) -> None:
        share, common = _measure(items, ok)
        out.append(Finding(key, _status(share), want, common, share, detail if share is None else None))

    font_want = _font_key(rules.font)
    add("font", rules.font, _run_items(body, "font"), lambda v: v is not None and _font_key(v) == font_want)
    add("size", rules.size, _run_items(body, "size"), lambda v: v is not None and abs(v - rules.size) <= SIZE_TOLERANCE_PT)
    add("line", rules.line, [(_line_value(p), p.length) for p in body],
        lambda v: isinstance(v, float) and abs(v - rules.line) <= LINE_TOLERANCE)
    if rules.kind == "tez" or rules.indent:
        flat = [p for p in body if not p.ppr.get("hanging") and not p.ppr.get("left")]
        add("indent", rules.indent, [(round(p.ppr.get("first_line", 0) / TWIPS_PER_CM, 2), p.length) for p in flat],
            lambda v: abs(v - rules.indent) <= INDENT_TOLERANCE_CM)
    add("spAfter", rules.sp_after, [(round(p.ppr.get("after", 0) / 20.0, 1), p.length) for p in body],
        lambda v: abs(v - rules.sp_after) <= SPACING_TOLERANCE_PT)
    return out


def _check_footnotes(docx: Docx, rules: Rules) -> Finding:
    paras = [p for p in docx.footnote_paras if p.length > 0]
    if not paras:
        return Finding("footSize", "yok", rules.foot_size, detail="no_footnotes")
    share, common = _measure(
        _run_items(paras, "size"), lambda v: v is not None and abs(v - rules.foot_size) <= SIZE_TOLERANCE_PT
    )
    return Finding("footSize", _status(share), rules.foot_size, common, share)


# Rule sections that are pages of placeholders rather than headings in a finished thesis.
_COVERS = {"dis kapak", "ic kapak"}


def _check_sections(docx: Docx, rules: Rules) -> Optional[Finding]:
    if rules.kind != "tez" or not rules.sections:
        return None
    wanted = [tr_key(s) for s in rules.sections if tr_key(s) not in _COVERS]
    titles: List[str] = []
    for p in docx.paragraphs:
        if p.in_toc or p.length == 0 or p.length > 80:
            continue
        key = tr_key(p.text)
        if p.outline == 0 or key in wanted:
            titles.append(key)
    positions: Dict[str, int] = {}
    for i, t in enumerate(titles):
        positions.setdefault(t, i)
    missing = [s for s in rules.sections if tr_key(s) not in _COVERS and tr_key(s) not in positions]
    order = [positions[k] for k in wanted if k in positions]
    out_of_order = order != sorted(order)
    status = "uygun" if not missing and not out_of_order else "uyumsuz"
    found = {"missing": missing, "outOfOrder": out_of_order} if status == "uyumsuz" else None
    return Finding("sections", status, len(rules.sections), found)


def _section_words(docx: Docx, start: List[str], stop: List[str]) -> Optional[int]:
    """Words between the first heading named in `start` and the next heading (or one named in `stop`)."""
    paras = docx.paragraphs
    begin = None
    for i, p in enumerate(paras):
        if not p.in_toc and p.length <= 80 and tr_key(p.text) in start and (p.outline is not None or p.length < 30):
            begin = i
            break
    if begin is None:
        return None
    total = 0
    for p in paras[begin + 1 :]:
        is_heading = p.outline is not None and p.outline <= 0
        if is_heading or (p.length <= 40 and tr_key(p.text) in stop):
            break
        if not p.in_toc:
            total += count_words(p.text)
    return total


def _limit_state(n: int, limit: Tuple[Optional[int], Optional[int]]) -> str:
    """uyumsuz above the maximum; elle below the minimum (a text still being written is expected to be short);
    uygun otherwise."""
    lo, hi = limit
    if hi is not None and n > hi:
        return "uyumsuz"
    if lo is not None and n < lo:
        return "elle"
    return "uygun"


def _check_limits(docx: Docx, rules: Rules) -> List[Finding]:
    out: List[Finding] = []
    if rules.word_limit:
        total = _section_words(docx, ["giris", "introduction"], ["kaynakca", "references", "bibliography"])
        scope = "intro_to_references"
        if total is None:
            total = sum(count_words(p.text) for p in docx.paragraphs if not p.in_toc)
            scope = "whole_document"
        state = _limit_state(total, rules.word_limit)
        out.append(Finding("wordLimit", state, list(rules.word_limit), total, detail="below_min" if state == "elle" else scope))
    if rules.abs_limit:
        counts = [c for c in (
            _section_words(docx, ["oz", "ozet"], ["abstract", "anahtar kelimeler", "keywords"]),
            _section_words(docx, ["abstract"], ["anahtar kelimeler", "keywords", "giris", "introduction"]),
        ) if c is not None]
        if not counts:
            out.append(Finding("absLimit", "yok", list(rules.abs_limit), detail="no_abstract"))
        else:
            states = [_limit_state(c, rules.abs_limit) for c in counts]
            state = "uyumsuz" if "uyumsuz" in states else "elle" if "elle" in states else "uygun"
            out.append(Finding("absLimit", state, list(rules.abs_limit), counts, detail="below_min" if state == "elle" else None))
    return out


ORDER = [
    "paper", "mTop", "mBottom", "mLeft", "mRight", "font", "size", "line", "indent", "spAfter",
    "h1Size", "h1Upper", "h2Size", "h3Size", "footSize", "pageNum", "frontRoman", "sections",
    "citation", "wordLimit", "absLimit",
]


def check_docx(data: bytes, rules: Rules) -> Dict[str, Any]:
    """Run every check. Raises DocxError for a file that is not a readable DOCX."""
    docx = read_docx(data)
    findings: List[Finding] = [_check_paper(docx.sections, rules)]
    findings += _check_margins(docx.sections, rules)
    findings += _check_body(docx, rules)
    findings += _check_headings(docx, rules)
    findings.append(_check_footnotes(docx, rules))
    findings += _check_numbering(docx, rules)
    sec = _check_sections(docx, rules)
    if sec:
        findings.append(sec)
    findings.append(Finding("citation", "elle", rules.citation, detail="footnotes_present" if docx.footnote_count else "no_footnotes"))
    findings += _check_limits(docx, rules)
    findings.sort(key=lambda f: ORDER.index(f.key) if f.key in ORDER else len(ORDER))
    counts = Counter(f.status for f in findings)
    return {
        "kind": rules.kind,
        "sections": len(docx.sections),
        "summary": {s: counts.get(s, 0) for s in ("uygun", "uyumsuz", "yok", "elle")},
        "findings": [f.to_dict() for f in findings],
    }
