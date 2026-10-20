"""Internal FastAPI app. Not exposed to the internet: bind to the private interface, token required.

Without KAZUIST_INTERNAL_TOKEN every /internal route answers 503 (fail closed).
"""

from __future__ import annotations

import hmac
import os
from typing import Any, Dict, Mapping, Optional

from fastapi import Depends, FastAPI, Header, HTTPException

from .runtime import Runtime


def create_app(rt: Runtime, env: Optional[Mapping[str, str]] = None) -> FastAPI:
    env = env if env is not None else os.environ
    app = FastAPI(title="kazuist-worker-internal", docs_url=None, redoc_url=None, openapi_url=None)

    def auth(x_internal_token: Optional[str] = Header(default=None)) -> None:
        expected = env.get("KAZUIST_INTERNAL_TOKEN")
        if not expected:
            raise HTTPException(status_code=503, detail="internal token not configured")
        if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
            raise HTTPException(status_code=401, detail="unauthorized")

    def _known(name: str) -> None:
        if name not in rt.registry.names():
            raise HTTPException(status_code=404, detail="unknown source")

    @app.get("/healthz")
    def healthz() -> Dict[str, str]:
        return {"status": "ok"}

    @app.get("/internal/sources", dependencies=[Depends(auth)])
    def sources() -> Dict[str, Any]:
        return {"sources": rt.registry.status(), "breaker": rt.fetcher.breaker.snapshot(), "alerts": rt.fetcher.alerts}

    @app.post("/internal/sources/{name}/stop", dependencies=[Depends(auth)])
    def stop(name: str) -> Dict[str, str]:
        _known(name)
        rt.registry.trip(name, "stopped by operator")
        return {"source": name, "state": "stopped"}

    @app.post("/internal/sources/{name}/reset", dependencies=[Depends(auth)])
    def reset(name: str) -> Dict[str, str]:
        _known(name)
        rt.registry.untrip(name)
        rt.fetcher.breaker.reset(name)
        return {"source": name, "state": "reset"}

    return app
