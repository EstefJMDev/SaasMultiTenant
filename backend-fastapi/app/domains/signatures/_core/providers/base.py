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
    format: str
    expires_at: datetime
    protocol_url: str


@dataclass
class SignedArtifact:
    signed_pdf_path: str
    signature_container_path: str | None
    validation_report_path: str | None
    evidence_json_path: str | None
    signed_pdf_sha256: str | None


@dataclass
class EvidenceReport:
    validation_result: str
    report: dict[str, Any]
    evidence_path: str | None = None


class SignatureProvider(ABC):
    @abstractmethod
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
        raise NotImplementedError

    @abstractmethod
    def presign(
        self,
        *,
        signature_request_id: UUID,
        config: dict[str, Any],
    ) -> PresignPayload:
        raise NotImplementedError

    @abstractmethod
    def submit_client_result(
        self,
        *,
        signature_request_id: UUID,
        payload: dict[str, Any],
        config: dict[str, Any],
    ) -> None:
        raise NotImplementedError

    @abstractmethod
    def finalize(
        self,
        *,
        signature_request_id: UUID,
        config: dict[str, Any],
    ) -> SignedArtifact:
        raise NotImplementedError

    @abstractmethod
    def get_status(self, *, signature_request_id: UUID) -> str:
        raise NotImplementedError

    @abstractmethod
    def get_evidence(self, *, signature_request_id: UUID) -> EvidenceReport:
        raise NotImplementedError
