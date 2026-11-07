"""LibreOffice headless validation of a DOCX (plan 10.5/8, 15.1): the file must open, convert to PDF, and the
printed page numbers must run i, ii, ... in the front matter and 1, 2, ... in the main text.

soffice is a large external program: this module is used by CI, by eval/rules and by tests, not by the
request path of the web app. A missing soffice is reported as `None` so callers can skip, never as a pass.
"""

from __future__ import annotations

import io
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from typing import List, Optional

MAC_PATH = "/Applications/LibreOffice.app/Contents/MacOS/soffice"


def soffice_path() -> Optional[str]:
    for name in ("soffice", "libreoffice"):
        found = shutil.which(name)
        if found:
            return found
    return MAC_PATH if os.path.exists(MAC_PATH) else None


def convert_to_pdf(docx: bytes, timeout: float = 180.0) -> bytes:
    """Convert in a throw away directory with a private LibreOffice profile. Raises on failure or timeout."""
    exe = soffice_path()
    if exe is None:
        raise FileNotFoundError("soffice")
    with tempfile.TemporaryDirectory(prefix="kazuist-lo-") as tmp:
        src = os.path.join(tmp, "belge.docx")
        with open(src, "wb") as fh:
            fh.write(docx)
        profile = os.path.join(tmp, "profil")
        subprocess.run(
            [exe, f"-env:UserInstallation=file://{profile}", "--headless", "--norestore", "--convert-to", "pdf",
             "--outdir", tmp, src],
            check=True, capture_output=True, timeout=timeout,
        )
        with open(os.path.join(tmp, "belge.pdf"), "rb") as fh:
            return fh.read()


_ROMAN = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100, "d": 500, "m": 1000}
_LABEL = re.compile(r"^(?:[ivxlcdm]+|\d+)$", re.IGNORECASE)


def roman_value(s: str) -> Optional[int]:
    s = s.lower()
    if not s or any(ch not in _ROMAN for ch in s):
        return None
    total = 0
    for i, ch in enumerate(s):
        v = _ROMAN[ch]
        total += -v if i + 1 < len(s) and _ROMAN[s[i + 1]] > v else v
    return total


def _page_lines(page) -> List[str]:  # type: ignore[no-untyped-def]
    """Text lines of a page ordered from the bottom edge up, found by position, not by stream order."""
    segments: List[tuple] = []

    def visit(text, cm, tm, _font, _size):  # type: ignore[no-untyped-def]
        if text and text.strip():
            segments.append((round(cm[3] * tm[5] + cm[5], 1), text.strip()))

    page.extract_text(visitor_text=visit)
    rows: dict = {}
    for y, text in segments:
        rows.setdefault(y, []).append(text)
    return [" ".join(rows[y]) for y in sorted(rows)]


def page_labels(pdf: bytes, position: str = "alt-orta") -> List[str]:
    """The printed page number of every page ('' when a page prints none). Bottom positions read the lowest
    text line of the page, 'ust-sag' the highest."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(pdf))
    labels: List[str] = []
    for page in reader.pages:
        lines = _page_lines(page)
        pick = (lines[-1] if position.startswith("ust") else lines[0]) if lines else ""
        labels.append(pick if _LABEL.match(pick) else "")
    return labels


@dataclass
class Numbering:
    ok: bool
    front: List[str]
    main: List[str]
    problems: List[str]


def verify_numbering(labels: List[str], front_roman: bool = True, cover_unnumbered: bool = True) -> Numbering:
    """Front matter is i, ii, ... (the unnumbered cover counts as page i); main text is 1, 2, ..."""
    # Main text starts at the first decimal label (roman front matter), or at the restart to "1" when the
    # front matter is decimal too.
    start = len(labels)
    for i, label in enumerate(labels):
        if (label.isdigit() if front_roman else (label == "1" and i > 0)):
            start = i
            break
    front = labels[:start]
    main = labels[start:]
    problems: List[str] = []
    expected = 1
    for i, label in enumerate(front):
        if i == 0 and cover_unnumbered and label == "":
            expected += 1
            continue
        value = roman_value(label) if front_roman else (int(label) if label.isdigit() else None)
        if value != expected:
            problems.append(f"front page {i + 1}: expected {expected}, printed {label!r}")
        expected += 1
    for i, label in enumerate(main):
        if label != str(i + 1):
            problems.append(f"main page {i + 1}: expected {i + 1}, printed {label!r}")
    if not main:
        problems.append("no main text pages")
    return Numbering(not problems, front, main, problems)
