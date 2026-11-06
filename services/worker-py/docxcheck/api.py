"""Internal HTTP endpoint of the DOCX check (docs/istekler/yazma-docxcheck-kaydi.md).

Mount it in core.api.create_app with `app.include_router(docxcheck.api.make_router(env))`. Same fail-closed
token rule as the other /internal routes: without KAZUIST_INTERNAL_TOKEN every call answers 503.

The request body is the raw DOCX; the rules travel base64 encoded in the `X-Kazuist-Rules` header as
`{"kind": "tez"|"makale", "rules": {...}}`. The file is held in memory for the length of the request, never
written to disk, never logged, never sent to an AI provider.
"""

from __future__ import annotations

import base64
import binascii
import hmac
import json
import os
from typing import Any, Dict, Mapping, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from .check import check_docx
from .rules import RuleError, Rules
from .safe_zip import MAX_FILE_BYTES, DocxError

_STATUS = {"too_large": 413, "zip_bomb": 413}


def make_router(env: Optional[Mapping[str, str]] = None) -> APIRouter:
    env = env if env is not None else os.environ
    router = APIRouter()

    def auth(x_internal_token: Optional[str] = Header(default=None)) -> None:
        expected = env.get("KAZUIST_INTERNAL_TOKEN")
        if not expected:
            raise HTTPException(status_code=503, detail="internal token not configured")
        if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
            raise HTTPException(status_code=401, detail="unauthorized")

    @router.post("/internal/docxcheck", dependencies=[Depends(auth)])
    async def docxcheck(request: Request, x_kazuist_rules: Optional[str] = Header(default=None)) -> Dict[str, Any]:
        if not x_kazuist_rules or len(x_kazuist_rules) > 64 * 1024:
            raise HTTPException(status_code=400, detail="bad_rules")
        try:
            payload = json.loads(base64.b64decode(x_kazuist_rules, validate=True))
            rules = Rules.from_dict(str(payload.get("kind")), payload.get("rules") or {})
        except (binascii.Error, ValueError, AttributeError, TypeError, RuleError) as exc:
            raise HTTPException(status_code=400, detail="bad_rules") from exc
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_FILE_BYTES:
            raise HTTPException(status_code=413, detail="too_large")
        chunks = []
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_FILE_BYTES:
                raise HTTPException(status_code=413, detail="too_large")
            chunks.append(chunk)
        data = b"".join(chunks)
        try:
            return await run_in_threadpool(check_docx, data, rules)
        except DocxError as exc:
            raise HTTPException(status_code=_STATUS.get(exc.code, 422), detail=exc.code) from exc

    return router
