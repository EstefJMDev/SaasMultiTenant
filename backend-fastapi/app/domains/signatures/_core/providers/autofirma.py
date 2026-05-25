from __future__ import annotations

import json
from datetime import datetime, timezone
from uuid import UUID
from typing import Any

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.domains.signatures._core.autofirma import (
    AutofirmaFinalizeService,
    AutofirmaPresignService,
    AutofirmaSessionStore,
)
from app.domains.signatures._core.models import SignatureArtifact, SignatureRequest, SignatureRequestStatus
from app.domains.signatures._core.providers.base import EvidenceReport, PresignPayload, SignatureProvider, SignedArtifact
from app.domains.signatures._core.storage.service import StorageService
from app.domains.signatures._core.timestamp.service import TimestampService
from app.domains.signatures._core.validation.validator import SignatureValidator


class AutofirmaProvider(SignatureProvider):
    def __init__(self, *, session: Session) -> None:
        self.session = session
        self.storage = StorageService()
        self.session_store = AutofirmaSessionStore()
        self.validator = SignatureValidator()
        self.tsa = TimestampService()
        self.presign_service = AutofirmaPresignService(
            session=session,
            storage=self.storage,
            session_store=self.session_store,
        )
        self.finalize_service = AutofirmaFinalizeService(
            session=session,
            storage=self.storage,
            session_store=self.session_store,
            validator=self.validator,
            tsa=self.tsa,
        )

    def _load_request(self, signature_request_id: UUID) -> SignatureRequest:
        req = self.session.get(SignatureRequest, signature_request_id)
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud de firma no encontrada.")
        return req

    def create_signature_request(
        self,
        *,
        signature_request_id: UUID,
        contract_id: int,
        signer_id: int | None,
        tenant_id: int,
        created_by: int | None,
        config: dict[str, Any],
        signer_name: str | None,
        signer_email: str | None,
    ) -> dict[str, Any]:
        return {
            "provider": "AUTOFIRMA",
            "signature_request_id": str(signature_request_id),
            "contract_id": contract_id,
            "signer_id": signer_id,
            "created_by": created_by,
            "format": "PAdES",
        }

    def presign(self, *, signature_request_id: UUID, config: dict[str, Any]) -> PresignPayload:
        req = self._load_request(signature_request_id)
        if req.provider.value != "AUTOFIRMA":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud no es AUTOFIRMA.")
        if req.status in {SignatureRequestStatus.SIGNED, SignatureRequestStatus.FAILED, SignatureRequestStatus.EXPIRED}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Solicitud finalizada.")
        return self.presign_service.run(req=req, config=config)

    def submit_client_result(
        self,
        *,
        signature_request_id: UUID,
        payload: dict[str, Any],
        config: dict[str, Any],
    ) -> None:
        req = self._load_request(signature_request_id)
        if req.provider.value != "AUTOFIRMA":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud no es AUTOFIRMA.")
        if req.status not in {SignatureRequestStatus.PENDING_CLIENT, SignatureRequestStatus.VALIDATING}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Estado invalido para client-result.")

        presign_data = self.session_store.load(signature_request_id=req.id)
        if not presign_data:
            req.status = SignatureRequestStatus.EXPIRED
            req.error_detail = "Sesion presign expirada."
            req.updated_at = datetime.now(timezone.utc)
            self.session.add(req)
            self.session.commit()
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Sesion presign expirada.")
        if payload.get("session_id") != presign_data.get("session_id"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="session_id invalido.")

        signature_b64 = str(payload.get("signature_b64") or "").strip()
        if not signature_b64:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Falta signature_b64.")
        cert_chain = payload.get("cert_chain_b64") or []
        if not isinstance(cert_chain, list):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cert_chain_b64 invalido.")

        req.client_payload = {
            "session_id": payload.get("session_id"),
            "signature_b64": signature_b64,
            "signed_pdf_b64": payload.get("signed_pdf_b64"),
            "cms_signature_b64": payload.get("cms_signature_b64"),
            "cert_chain_b64": cert_chain,
            "device_hints": payload.get("device_hints") or {},
            "ip": payload.get("ip"),
            "user_agent": payload.get("user_agent"),
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }
        req.status = SignatureRequestStatus.VALIDATING
        req.updated_at = datetime.now(timezone.utc)
        self.session.add(req)
        self.session.commit()

    def finalize(self, *, signature_request_id: UUID, config: dict[str, Any]) -> SignedArtifact:
        req = self._load_request(signature_request_id)
        if req.provider.value != "AUTOFIRMA":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud no es AUTOFIRMA.")
        if req.status not in {SignatureRequestStatus.VALIDATING, SignatureRequestStatus.PENDING_CLIENT}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Estado invalido para finalize.")
        return self.finalize_service.run(req=req, config=config)

    def get_status(self, *, signature_request_id: UUID) -> str:
        req = self._load_request(signature_request_id)
        return req.status.value

    def get_evidence(self, *, signature_request_id: UUID) -> EvidenceReport:
        req = self._load_request(signature_request_id)
        artifact = self.session.exec(
            select(SignatureArtifact).where(
                SignatureArtifact.signature_request_id == req.id,
                SignatureArtifact.tenant_id == req.tenant_id,
            )
        ).one_or_none()
        if not artifact or not artifact.evidence_json_path:
            return EvidenceReport(validation_result="INDETERMINATE", report={})
        data = json.loads(self.storage.read_text(artifact.evidence_json_path))
        validation_result = str(data.get("validation_result") or "INDETERMINATE")
        return EvidenceReport(
            validation_result=validation_result,
            report=data,
            evidence_path=artifact.evidence_json_path,
        )

