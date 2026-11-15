"""Shared helpers of the court decision connectors (AYM, Yargitay, Danistay).

Decision bodies arrive as HTML: Word exports (AYM), or the Verdana page of the Adalet Bakanligi karar arama
sites. The text keeps its paragraph structure, one line per paragraph or per table row, and never carries
markup, scripts or style data. Nothing here removes personal data; that is the anonymiser's job and it runs
before anything is indexed (plan 6.2/6).
"""

from __future__ import annotations

import html
import re
from datetime import date
from html.parser import HTMLParser
from typing import List, Optional

from core.errors import ParseError

_BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "table", "tr", "center", "pre"}
_SKIP = {"script", "style", "head", "title"}
_CELL = {"td", "th"}


class _DecisionText(HTMLParser):
    """Paragraph aware extractor. Source line breaks inside a paragraph are folded into spaces (Word wraps
    lines in the markup); a table row becomes one line ("Basvurucu : Ad Soyad")."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: List[str] = []
        self._skip = 0
        self._cells = 0  # open table cells: paragraphs inside a cell stay on the row line

    def handle_starttag(self, tag, attrs):  # noqa: ANN001
        if tag in _SKIP:
            self._skip += 1
        elif tag in _CELL:
            self._cells += 1
            self.out.append(" ")
        elif tag in _BLOCK and not self._cells:
            self.out.append("\n")

    def handle_endtag(self, tag):  # noqa: ANN001
        if tag in _SKIP:
            self._skip = max(0, self._skip - 1)
        elif tag in _CELL:
            self._cells = max(0, self._cells - 1)
            self.out.append(" ")
        elif tag == "tr":
            self.out.append("\n")
        elif tag in _BLOCK and not self._cells:
            self.out.append("\n")

    def handle_data(self, data):  # noqa: ANN001
        if not self._skip:
            self.out.append(re.sub(r"\s+", " ", data))


def decision_html_to_text(markup: str) -> str:
    """HTML of a decision to plain text. Raises ParseError when no text is left."""
    parser = _DecisionText()
    parser.feed(markup)
    parser.close()
    raw = "".join(parser.out).replace("\xa0", " ")
    lines = [re.sub(r" {2,}", " ", ln).strip() for ln in raw.split("\n")]
    # " : " column separators of two cell rows ("Baskan : Ad") keep one space on each side.
    text = "\n".join(ln for ln in lines if ln)
    if len(text) < 40:
        raise ParseError("decision text is empty")
    return text


def unescape_embedded_html(value: str) -> str:
    """Danistay returns the decision as an escaped string inside the page; one unescape gives the markup."""
    return html.unescape(value)


def parse_dotted_date(value: Optional[str]) -> Optional[date]:
    """'18.12.2024' (Yargitay, Danistay) to a date."""
    m = re.fullmatch(r"\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*", value or "")
    if not m:
        return None
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def parse_iso_date(value: Optional[str]) -> Optional[date]:
    """'2015-03-25' or '2017-12-19T00:00:00' (AYM) to a date."""
    m = re.match(r"\s*(\d{4})-(\d{2})-(\d{2})", value or "")
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def slug(value: str) -> str:
    """'Hukuk Genel Kurulu' to 'hukuk-genel-kurulu' (ascii, for source keys)."""
    folded = value.replace("İ", "i").replace("I", "ı").lower()
    table = {"ı": "i", "ğ": "g", "ü": "u", "ş": "s", "ö": "o", "ç": "c"}
    folded = "".join(table.get(ch, ch) for ch in folded)
    return re.sub(r"[^a-z0-9]+", "-", folded).strip("-")


def case_number(value: Optional[str]) -> Optional[str]:
    """'2024/817' as written by the source; None when it does not look like a case number."""
    v = (value or "").strip()
    return v if re.fullmatch(r"\d{4}/[\dA-Za-z()\-]+(?:/\d+)?", v) else None
