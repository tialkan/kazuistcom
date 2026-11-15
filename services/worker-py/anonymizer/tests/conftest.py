"""Anonymizer tests run as development unless a test sets KAZUIST_ENV itself, so a shell that exports
KAZUIST_ENV=production does not change which results are publishable."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _development_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("KAZUIST_ENV", raising=False)
