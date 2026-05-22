from __future__ import annotations

import hashlib
import hmac
from datetime import datetime
from uuid import UUID

from app.core.config import settings


def build_autofirma_public_signature(
    *,
    signature_request_id: UUID | str,
    tenant_id: int,
    exp: int,
) -> str:
    payload = f"{signature_request_id}:{tenant_id}:{exp}"
    return hmac.new(
        settings.signatures_secret_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def build_autofirma_public_url(
    *,
    signature_request_id: UUID | str,
    tenant_id: int,
    expires_at: datetime,
) -> str:
    exp = int(expires_at.timestamp())
    sig = build_autofirma_public_signature(
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
        exp=exp,
    )
    frontend_base = (settings.frontend_base_url or "").strip().rstrip("/")
    route = (
        f"public/autofirma-sign?sr={signature_request_id}"
        f"&tenant={tenant_id}&exp={exp}&sig={sig}"
    )
    if frontend_base:
        if "#/" in frontend_base:
            prefix, _ = frontend_base.split("#/", 1)
            return f"{prefix.rstrip('/')}/#/{route}"
        return f"{frontend_base.rstrip('/')}/#/{route}"
    return f"/#/{route}"


def verify_autofirma_public_signature(
    *,
    signature_request_id: UUID | str,
    tenant_id: int,
    exp: int,
    sig: str,
) -> bool:
    if not sig:
        return False
    expected = build_autofirma_public_signature(
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
        exp=exp,
    )
    return hmac.compare_digest(sig, expected)
