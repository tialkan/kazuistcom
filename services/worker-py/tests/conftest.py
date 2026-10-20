from __future__ import annotations

import pytest

from core.clock import FakeClock


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()
