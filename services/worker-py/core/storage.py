"""Raw document archive (plan 6.2/5). S3 compatible interface; local directory in tests and development."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Optional, Protocol


class ObjectStore(Protocol):
    def put(self, key: str, data: bytes, content_type: Optional[str] = None) -> None: ...

    def get(self, key: str) -> bytes: ...

    def exists(self, key: str) -> bool: ...


class LocalObjectStore:
    def __init__(self, root: Path):
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError("key escapes the store root")
        return path

    def put(self, key: str, data: bytes, content_type: Optional[str] = None) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()


class S3ObjectStore:
    """Wraps a boto3 style client (put_object, get_object, head_object). The client is injected, so no SDK
    dependency is added here; the deployment wires S3_ENDPOINT, S3_BUCKET and credentials from the environment."""

    def __init__(self, client: Any, bucket: str):
        self.client = client
        self.bucket = bucket

    def put(self, key: str, data: bytes, content_type: Optional[str] = None) -> None:
        extra = {"ContentType": content_type} if content_type else {}
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, **extra)

    def get(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:  # noqa: BLE001 - any client error means absent
            return False


@dataclass(frozen=True)
class RawDocument:
    source: str
    external_id: str
    url: str
    object_key: str
    sha256: str
    content_type: Optional[str]
    fetched_at: datetime
    size: int


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class RawArchive:
    """Content addressed: the same bytes are stored once; the row-level record (sources_raw) is the pointer."""

    def __init__(self, store: ObjectStore):
        self.store = store

    def save(
        self,
        source: str,
        external_id: str,
        url: str,
        data: bytes,
        content_type: Optional[str],
        fetched_at: datetime,
    ) -> RawDocument:
        digest = sha256_hex(data)
        key = f"raw/{source}/{digest[:2]}/{digest}"
        if not self.store.exists(key):
            self.store.put(key, data, content_type)
        return RawDocument(source, external_id, url, key, digest, content_type, fetched_at, len(data))
