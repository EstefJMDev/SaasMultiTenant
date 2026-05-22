import base64
import hashlib
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


MFA_SECRET_PREFIX = "fernet$"


def _derive_key(secret_material: str) -> bytes:
    digest = hashlib.sha256(secret_material.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    return Fernet(_derive_key(settings.mfa_secret_key))


def encrypt_mfa_secret(secret: Optional[str]) -> Optional[str]:
    if not secret:
        return None
    if secret.startswith(MFA_SECRET_PREFIX):
        return secret
    token = _fernet().encrypt(secret.encode("utf-8")).decode("utf-8")
    return f"{MFA_SECRET_PREFIX}{token}"


def decrypt_mfa_secret(secret: Optional[str]) -> Optional[str]:
    if not secret:
        return None
    if not secret.startswith(MFA_SECRET_PREFIX):
        # Backward compatibility for existing plaintext rows.
        return secret
    token = secret[len(MFA_SECRET_PREFIX) :]
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return None
