from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


def _get_key() -> bytes:
    raw = (getattr(settings, "signature_redis_encryption_key", None) or "").strip()
    if not raw:
        # Fallback seguro para no romper despliegues sin clave dedicada:
        # deriva una clave de 32 bytes desde SECRET_KEY.
        secret = (getattr(settings, "secret_key", None) or "").encode("utf-8")
        if not secret:
            raise RuntimeError(
                "No hay clave de cifrado para firmas (SIGNATURE_REDIS_ENCRYPTION_KEY/SECRET_KEY)."
            )
        return hashlib.sha256(secret).digest()
    try:
        key = base64.urlsafe_b64decode(raw.encode("utf-8"))
    except Exception as exc:
        raise RuntimeError(
            "SIGNATURE_REDIS_ENCRYPTION_KEY debe ser base64 urlsafe (32 bytes)."
        ) from exc
    if len(key) != 32:
        raise RuntimeError("SIGNATURE_REDIS_ENCRYPTION_KEY debe decodificar a 32 bytes.")
    return key


def encrypt_json(data: dict[str, Any]) -> str:
    key = _get_key()
    aes = AESGCM(key)
    nonce = os.urandom(12)
    plaintext = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ciphertext = aes.encrypt(nonce, plaintext, None)
    token = base64.urlsafe_b64encode(nonce + ciphertext).decode("utf-8")
    return token


def decrypt_json(token: str) -> dict[str, Any]:
    key = _get_key()
    raw = base64.urlsafe_b64decode(token.encode("utf-8"))
    if len(raw) < 13:
        raise ValueError("Payload cifrado invalido.")
    nonce = raw[:12]
    ciphertext = raw[12:]
    aes = AESGCM(key)
    plaintext = aes.decrypt(nonce, ciphertext, None)
    decoded = json.loads(plaintext.decode("utf-8"))
    if not isinstance(decoded, dict):
        raise ValueError("Payload cifrado invalido.")
    return decoded
