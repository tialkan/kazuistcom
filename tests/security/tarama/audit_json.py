"""Reject unavailable or empty pnpm audit results before applying the severity gate."""

import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    report = json.load(source)
counts = report["metadata"]["vulnerabilities"]
assert isinstance(report["advisories"], dict), "missing advisory data"
assert all(
    type(counts[level]) is int and counts[level] >= 0
    for level in ("info", "low", "moderate", "high", "critical")
)
assert report["metadata"]["totalDependencies"] > 0, "no dependency inventory"
assert not report.get("error"), "audit service error"
