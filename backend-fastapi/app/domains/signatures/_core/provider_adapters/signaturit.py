from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session

from app.domains.signatures._core.provider_adapters.base import PresignPayload, SignatureProvider, SignedArtifact
from app.domains.signatures._core.service import create_signaturit_request as legacy_create_signaturit_request


class SignaturitProvider(SignatureProvider):
    def __init__(self, *, session: Session) -> None:
        self.session = session

    def create_signature_request(
        self,
        *,
        signature_request_id: UUID,
        tenant_id: int,
        contract_id: int,
        signer_name: str,
        signer_email: str,
        provider_config: dict[str, Any],
        created_by_user_id: int | None,
    ) -> dict[str, Any]:
        signature_mode = str(provider_config.get("signaturit_signature_mode") or "biometric")
        digital_certificate_name = provider_config.get("digital_certificate_name")
        legacy_req, signing_url = legacy_create_signaturit_request(
            session=self.session,
            tenant_id=tenant_id,
            contract_id=contract_id,
            signer_name=signer_name,
            signer_email=signer_email,
            delivery_type="url",
            signature_mode=signature_mode,
            digital_certificate_name=digital_certificate_name,
            created_by_id=created_by_user_id,
        )
        return {
            "legacy_request_id": legacy_req.id,
            "provider_signature_id": legacy_req.provider_signature_id,
            "provider_document_id": legacy_req.provider_document_id,
            "signing_url": signing_url,
            "status": legacy_req.status,
        }

    def presign(
        self,
        *,
        signature_request_id: UUID,
        provider_config: dict[str, Any],
    ) -> PresignPayload:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Signaturit no usa fase presign local.",
        )

    def submit_client_signature(
        self,
        *,
        signature_request_id: UUID,
        client_payload: dict[str, Any],
        provider_config: dict[str, Any],
    ) -> None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Signaturit no usa client-result local.",
        )

    def finalize(
        self,
        *,
        signature_request_id: UUID,
        provider_config: dict[str, Any],
    ) -> SignedArtifact:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Signaturit finaliza por su propio webhook/sync.",
        )

    def get_status(
        self,
        *,
        signature_request_id: UUID,
    ) -> str:
        return "CREATED"

