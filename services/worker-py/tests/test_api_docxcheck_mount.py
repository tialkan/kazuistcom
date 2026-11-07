"""core.api mounts the docxcheck router (plan 10.5) behind the internal token."""

from types import SimpleNamespace

from fastapi.testclient import TestClient

from core.api import create_app


def _client() -> TestClient:
    rt = SimpleNamespace(registry=SimpleNamespace(names=lambda: []))
    return TestClient(create_app(rt, env={"KAZUIST_INTERNAL_TOKEN": "t"}))


def test_docxcheck_route_is_mounted_and_validates_rules() -> None:
    r = _client().post("/internal/docxcheck", headers={"x-internal-token": "t"}, content=b"x")
    assert r.status_code == 400
    assert r.json()["detail"] == "bad_rules"


def test_docxcheck_route_requires_the_internal_token() -> None:
    assert _client().post("/internal/docxcheck", content=b"x").status_code == 401
