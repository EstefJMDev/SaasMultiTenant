from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from pathlib import Path
import hashlib
import secrets
from typing import Any
from urllib.parse import quote_plus

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.domains.signatures._core.models import SignatureArtifact, SignatureEvidence, SignatureRequest, SignatureRequestStatus
from app.domains.signatures._core.providers.base import PresignPayload
from app.domains.signatures._core.storage.service import StorageService
from .session_store import AutofirmaSessionStore


class AutofirmaPresignService:
    def __init__(self, *, session: Session, storage: StorageService, session_store: AutofirmaSessionStore) -> None:
        self.session = session
        self.storage = storage
        self.session_store = session_store

    def run(self, *, req: SignatureRequest, config: dict[str, Any]) -> PresignPayload:
        now_utc = datetime.now(timezone.utc)
        if req.expires_at and req.expires_at.replace(tzinfo=timezone.utc) < now_utc:
            req.status = SignatureRequestStatus.EXPIRED
            req.error_detail = "La solicitud de firma ha expirado."
            req.updated_at = datetime.now(timezone.utc)
            self.session.add(req)
            self.session.commit()
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="La solicitud de firma ha expirado. Crea una nueva solicitud.",
            )

        artifact = self.session.exec(
            select(SignatureArtifact).where(
                SignatureArtifact.signature_request_id == req.id,
                SignatureArtifact.tenant_id == req.tenant_id,
            )
        ).one_or_none()
        if not artifact:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No existe artefacto base de firma para esta solicitud. Crea una nueva solicitud.",
            )
        if not artifact.original_pdf_path:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El snapshot original no esta disponible para esta solicitud.",
            )
        if not Path(artifact.original_pdf_path).exists():
            req.error_detail = "Snapshot original no encontrado en almacenamiento."
            req.updated_at = datetime.now(timezone.utc)
            self.session.add(req)
            self.session.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El snapshot original ya no existe. Crea una nueva solicitud de firma.",
            )

        try:
            original_bytes = self.storage.read_bytes(artifact.original_pdf_path)
        except Exception as exc:
            req.error_detail = f"Error leyendo snapshot original: {type(exc).__name__}"
            req.updated_at = datetime.now(timezone.utc)
            self.session.add(req)
            self.session.commit()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No se pudo preparar la pre-firma del PDF original.",
            ) from exc

        current_sha = self.storage.sha256_bytes(original_bytes)
        if req.pdf_original_sha256 and current_sha != req.pdf_original_sha256:
            req.error_detail = "Integridad del snapshot original no valida."
            req.updated_at = datetime.now(timezone.utc)
            self.session.add(req)
            self.session.commit()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El snapshot original no pasa validacion de integridad. Crea una nueva solicitud.",
            )

        digest = hashlib.sha256(original_bytes).digest()
        to_be_signed_b64 = base64.b64encode(digest).decode("ascii")

        ttl_minutes = int(config.get("autofirma_session_ttl_minutes") or 10)
        ttl_seconds = max(60, ttl_minutes * 60)
        # AutoFirma Desktop limita el identificador de operacion (id) a 20 caracteres.
        session_id = secrets.token_hex(10)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)

        self.session_store.save(
            signature_request_id=req.id,
            ttl_seconds=ttl_seconds,
            payload={
                "session_id": session_id,
                "signature_request_id": str(req.id),
                "tenant_id": req.tenant_id,
                "contract_id": req.contract_id,
                "artifact_original_pdf_path": artifact.original_pdf_path,
                "pdf_original_sha256": req.pdf_original_sha256,
                "pdf_original_size_bytes": req.pdf_original_size_bytes,
                "to_be_signed_b64": to_be_signed_b64,
                "algorithm": "SHA256withRSA",
                "format": "PAdES",
                "expires_at": expires_at.isoformat(),
            },
        )

        req.status = SignatureRequestStatus.PRESIGNED
        req.presign_session_id = session_id
        req.updated_at = datetime.now(timezone.utc)
        self.session.add(req)
        self.session.add(
            SignatureEvidence(
                signature_request_id=req.id,
                tenant_id=req.tenant_id,
                events=[
                    {
                        "event": "PRESIGNED",
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "detail": {"session_id": session_id},
                    }
                ],
                created_at=datetime.now(timezone.utc),
            )
        )
        self.session.commit()

        req.status = SignatureRequestStatus.PENDING_CLIENT
        req.updated_at = datetime.now(timezone.utc)
        self.session.add(req)
        self.session.commit()

        # Compatibilidad con AutoFirma escritorio:
        # algunas versiones requieren stservlet/rtservlet para evitar NPE
        # en UrlParametersToSign.getStorageServletUrl().
        public_api_base = (settings.public_api_base_url or "").strip().rstrip("/")
        if not public_api_base:
            public_api_base = "http://localhost:8000"
        storage_servlet_url = f"{public_api_base}/public/autofirma/storage"
        protocol_url = (
            "afirma://sign?"
            f"op={quote_plus('sign')}&"
            f"format={quote_plus('CAdES')}&"
            f"algorithm={quote_plus('SHA256withRSA')}&"
            f"id={quote_plus(session_id)}&"
            f"stservlet={quote_plus(storage_servlet_url)}&"
            f"rtservlet={quote_plus(storage_servlet_url)}&"
            f"dat={quote_plus(to_be_signed_b64)}&"
            f"session={quote_plus(session_id)}&"
            f"sig_req={quote_plus(str(req.id))}"
        )
        return PresignPayload(
            session_id=session_id,
            algorithm="SHA256withRSA",
            to_be_signed_b64=to_be_signed_b64,
            format="CAdES",
            expires_at=expires_at.replace(tzinfo=None),
            protocol_url=protocol_url,
        )

