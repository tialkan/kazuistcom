"""Command line check, used by eval/rules and CI:

    python -m docxcheck BELGE.docx --kind tez|makale --rules kurallar.json [--libreoffice]

Prints one JSON object {"report": ..., "libreoffice": ...} and exits 0 when no rule field differs (and, with
--libreoffice, the printed page numbers are right), 1 when something differs, 2 when the file cannot be read, 3 when
--libreoffice was asked for and soffice is missing (a missing tool is never a pass).
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, List, Optional

from .check import check_docx
from .rules import RuleError, Rules
from .safe_zip import DocxError


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(prog="docxcheck")
    ap.add_argument("docx")
    ap.add_argument("--kind", choices=("tez", "makale"), required=True)
    ap.add_argument("--rules", required=True, help="JSON file with the rule values (SRS 6.2 keys)")
    ap.add_argument("--libreoffice", action="store_true", help="also convert to PDF and verify printed page numbers")
    args = ap.parse_args(argv)
    try:
        with open(args.rules, encoding="utf-8") as fh:
            rules = Rules.from_dict(args.kind, json.load(fh))
        with open(args.docx, "rb") as fh:
            data = fh.read()
        report = check_docx(data, rules)
    except (OSError, ValueError, RuleError, DocxError) as exc:
        print(json.dumps({"error": type(exc).__name__}))
        return 2
    out: Dict[str, Any] = {"report": report}
    code = 1 if report["summary"]["uyumsuz"] else 0
    if args.libreoffice:
        from .libreoffice import convert_to_pdf, page_labels, soffice_path, verify_numbering

        if soffice_path() is None:
            out["libreoffice"] = {"available": False}
            print(json.dumps(out, ensure_ascii=False))
            return 3
        labels = page_labels(convert_to_pdf(data), rules.page_num)
        # A decimal front matter restarts at 1, so the cover rule only holds when the first page is unnumbered.
        num = verify_numbering(labels, front_roman=rules.front_roman, cover_unnumbered=True) if args.kind == "tez" else None
        article_ok = args.kind == "makale" and labels[:1] == ["1"] and labels == [str(i + 1) for i in range(len(labels))]
        ok = num.ok if num else article_ok
        out["libreoffice"] = {
            "available": True,
            "pages": len(labels),
            "labels": labels,
            "ok": ok,
            "problems": num.problems if num else ([] if article_ok else ["article pages do not run 1, 2, ..."]),
        }
        if not ok:
            code = 1
    print(json.dumps(out, ensure_ascii=False))
    return code


if __name__ == "__main__":
    sys.exit(main())
