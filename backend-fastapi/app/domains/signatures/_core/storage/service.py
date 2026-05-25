from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any
from uuid import UUID

from app.core.config import settings


class StorageService:
    def __init__(self) -> None:
        self.base = Path(settings.contracts_storage_path).resolve()
        self.base.mkdir(parents=True, exist_ok=True)

    def request_dir(self, *, tenant_id: int, request_id: UUID) -> Path:
        path = self.base / str(tenant_id) / "signatures" / str(request_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def sha256_bytes(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    def write_bytes(self, path: Path, data: bytes) -> str:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path)

    def write_json(self, path: Path, data: dict[str, Any]) -> str:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return str(path)

    @staticmethod
    def read_bytes(path: str | Path) -> bytes:
        return Path(path).read_bytes()

    @staticmethod
    def read_text(path: str | Path) -> str:
        return Path(path).read_text(encoding="utf-8")
