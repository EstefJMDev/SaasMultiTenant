from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session

from app.domains.signatures._core.providers.base import EvidenceReport, PresignPayload, SignatureProvider, SignedArtifact
from app.domains.signatures._core.service import create_signaturit_request as legacy_create_signaturit_request


class SignaturitProvider(SignatureProvider):
    def __init__(self, *, session: Session) -> None:
        self.session = session

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
        if not signer_name or not signer_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Signaturit requiere signer_name y signer_email.",
            )
        signature_mode = str(config.get("signaturit_signature_mode") or "biometric")
        digital_certificate_name = config.get("digital_certificate_name")
        legacy_req, signing_url = legacy_create_signaturit_request(
            session=self.session,
            tenant_id=tenant_id,
            contract_id=contract_id,
            signer_name=signer_name,
            signer_email=signer_email,
            delivery_type="url",
            signature_mode=signature_mode,
            digital_certificate_name=digital_certificate_name,
            created_by_id=created_by,
        )
        return {
            "legacy_request_id": legacy_req.id,
            "provider_signature_id": legacy_req.provider_signature_id,
            "provider_document_id": legacy_req.provider_document_id,
            "signing_url": signing_url,
            "status": legacy_req.status,
        }

    def presign(self, *, signature_request_id: UUID, config: dict[str, Any]) -> PresignPayload:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Signaturit no usa presign en servidor local.",
        )

    def submit_client_result(
        self,
        *,
        signature_request_id: UUID,
        payload: dict[str, Any],
        config: dict[str, Any],
    ) -> None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Signaturit no usa client-result local.",
        )

    def finalize(self, *, signature_request_id: UUID, config: dict[str, Any]) -> SignedArtifact:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Signaturit finaliza via webhook/sync.",
        )

    def get_status(self, *, signature_request_id: UUID) -> str:
        return "PENDING"

    def get_evidence(self, *, signature_request_id: UUID) -> EvidenceReport:
        return EvidenceReport(validation_result="INDETERMINATE", report={"provider": "SIGNATURIT"})

