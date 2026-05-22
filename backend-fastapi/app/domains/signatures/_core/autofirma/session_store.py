from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
from typing import Any
from uuid import UUID

from redis import Redis

from app.core.config import settings
from app.domains.signatures._core.security import decrypt_json, encrypt_json


class AutofirmaSessionStore:
    _memory_store: dict[str, tuple[datetime, dict[str, Any]]] = {}

    def __init__(self) -> None:
        self.redis = Redis.from_url(settings.redis_url, decode_responses=True)
        self.logger = logging.getLogger("app.domains.signatures._core.autofirma")

    @staticmethod
    def key(signature_request_id: UUID) -> str:
        return f"autofirma:presign:{signature_request_id}"

    @classmethod
    def _memory_save(cls, *, key: str, ttl_seconds: int, payload: dict[str, Any]) -> None:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=max(1, ttl_seconds))
        cls._memory_store[key] = (expires_at, payload)

    @classmethod
    def _memory_load(cls, *, key: str) -> dict[str, Any] | None:
        current = cls._memory_store.get(key)
        if not current:
            return None
        expires_at, payload = current
        if expires_at < datetime.now(timezone.utc):
            cls._memory_store.pop(key, None)
            return None
        return payload

    @classmethod
    def _memory_delete(cls, *, key: str) -> None:
        cls._memory_store.pop(key, None)

    def save(self, *, signature_request_id: UUID, ttl_seconds: int, payload: dict[str, Any]) -> None:
        key = self.key(signature_request_id)
        try:
            self.redis.setex(key, ttl_seconds, encrypt_json(payload))
            return
        except Exception as exc:
            self.logger.warning(
                "Redis no disponible en save presign (%s). Usando fallback en memoria.",
                exc,
            )
        self._memory_save(key=key, ttl_seconds=ttl_seconds, payload=payload)

    def load(self, *, signature_request_id: UUID) -> dict[str, Any] | None:
        key = self.key(signature_request_id)
        try:
            encrypted = self.redis.get(key)
            if encrypted:
                return decrypt_json(encrypted)
        except Exception as exc:
            self.logger.warning(
                "Redis no disponible en load presign (%s). Usando fallback en memoria.",
                exc,
            )
        return self._memory_load(key=key)

    def delete(self, *, signature_request_id: UUID) -> None:
        key = self.key(signature_request_id)
        try:
            self.redis.delete(key)
        except Exception:
            pass
        self._memory_delete(key=key)

