from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID


@dataclass
class PresignPayload:
    session_id: str
    algorithm: str
    to_be_signed_b64: str
    expires_at: datetime
    protocol_url: str


@dataclass
class SignedArtifact:
    signed_pdf_path: str
    signature_container_path: str | None
    validation_report_path: str
    evidence_json_path: str
    signed_pdf_sha256: str | None


class SignatureProvider(ABC):
    @abstractmethod
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
        raise NotImplementedError

    @abstractmethod
    def presign(
        self,
        *,
        signature_request_id: UUID,
        provider_config: dict[str, Any],
    ) -> PresignPayload:
        raise NotImplementedError

    @abstractmethod
    def submit_client_signature(
        self,
        *,
        signature_request_id: UUID,
        client_payload: dict[str, Any],
        provider_config: dict[str, Any],
    ) -> None:
        raise NotImplementedError

    @abstractmethod
    def finalize(
        self,
        *,
        signature_request_id: UUID,
        provider_config: dict[str, Any],
    ) -> SignedArtifact:
        raise NotImplementedError

    @abstractmethod
    def get_status(
        self,
        *,
        signature_request_id: UUID,
    ) -> str:
        raise NotImplementedError
