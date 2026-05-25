from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import Column, Index, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class SignatureProviderRequest(SQLModel, table=True):
    __tablename__ = "signature_provider_request"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)

    provider: str = Field(default="signaturit", index=True, max_length=32)
    status: str = Field(default="created", index=True, max_length=64)
    provider_signature_id: Optional[str] = Field(default=None, index=True, max_length=128)
    provider_document_id: Optional[str] = Field(default=None, index=True, max_length=128)
    signer_name: Optional[str] = Field(default=None, max_length=255)
    signer_email: Optional[str] = Field(default=None, max_length=255)

    source_pdf_path: Optional[str] = Field(default=None, max_length=512)
    signed_pdf_path: Optional[str] = Field(default=None, max_length=512)
    audit_trail_path: Optional[str] = Field(default=None, max_length=512)

    request_payload: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    provider_response: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    meta_json: Optional[dict] = Field(default=None, sa_column=Column(JSONB))

    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    completed_at: Optional[datetime] = Field(default=None, index=True)

    __table_args__ = (
        Index("ix_signature_provider_req_tenant_contract", "tenant_id", "contract_id"),
    )


class SignatureProviderEvent(SQLModel, table=True):
    __tablename__ = "signature_provider_event"

    id: Optional[int] = Field(default=None, primary_key=True)
    signature_request_id: int = Field(foreign_key="signature_provider_request.id", index=True)
    event_type: str = Field(index=True, max_length=64)
    payload: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class SignatureProviderType(str, Enum):
    SIGNATURIT = "SIGNATURIT"
    AUTOFIRMA = "AUTOFIRMA"


class SignatureRequestStatus(str, Enum):
    PENDING = "PENDING"
    PRESIGNED = "PRESIGNED"
    PENDING_CLIENT = "PENDING_CLIENT"
    VALIDATING = "VALIDATING"
    SIGNED = "SIGNED"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"
    # Legacy aliases to keep compatibility with older rows/clients.
    CREATED = "PENDING"
    PRESIGN_READY = "PRESIGNED"
    CLIENT_RESULT_RECEIVED = "PENDING_CLIENT"


class TenantSignatureConfig(SQLModel, table=True):
    __tablename__ = "tenant_signature_config"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True, unique=True)
    signature_provider_default: SignatureProviderType = Field(
        default=SignatureProviderType.SIGNATURIT
    )
    allow_signaturit: bool = Field(default=True)
    allow_autofirma: bool = Field(default=False)
    autofirma_session_ttl_minutes: int = Field(default=10)
    autofirma_tsa_enabled: bool = Field(default=True)
    autofirma_tsa_url: Optional[str] = Field(default=None, max_length=512)
    # Legacy compatibility fields:
    autofirma_presign_ttl_seconds: int = Field(default=900)
    tsa_enabled: bool = Field(default=False)
    tsa_url: Optional[str] = Field(default=None, max_length=512)
    tsa_username: Optional[str] = Field(default=None, max_length=255)
    tsa_password: Optional[str] = Field(default=None, max_length=255)
    indeterminate_as_success: bool = Field(default=False)
    updated_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class SignatureRequest(SQLModel, table=True):
    __tablename__ = "signature_requests"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    provider: SignatureProviderType = Field(index=True)
    status: SignatureRequestStatus = Field(default=SignatureRequestStatus.PENDING, index=True)

    created_by_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    signer_user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    signer_name: Optional[str] = Field(default=None, max_length=255)
    signer_email: Optional[str] = Field(default=None, max_length=255)

    contract_snapshot_id: str = Field(max_length=128, index=True)
    contract_version: Optional[str] = Field(default=None, max_length=128)
    pdf_original_sha256: str = Field(max_length=64, index=True)
    pdf_original_size_bytes: Optional[int] = Field(default=None)
    signed_pdf_sha256: Optional[str] = Field(default=None, max_length=64, index=True)

    provider_request_id: Optional[int] = Field(default=None, index=True)
    presign_session_id: Optional[str] = Field(default=None, max_length=128, index=True)
    expires_at: Optional[datetime] = Field(default=None, index=True)
    signed_at: Optional[datetime] = Field(default=None, index=True)

    provider_payload: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    client_payload: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    failure_reason: Optional[str] = Field(default=None, max_length=1024)
    error_detail: Optional[str] = Field(default=None, sa_column=Column(Text))

    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_signature_requests_tenant_contract", "tenant_id", "contract_id"),
        Index("ix_signature_requests_tenant_status", "tenant_id", "status"),
    )


class SignatureArtifact(SQLModel, table=True):
    __tablename__ = "signature_artifacts"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    signature_request_id: UUID = Field(foreign_key="signature_requests.id", index=True, unique=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)

    original_pdf_path: str = Field(max_length=1024)
    signed_pdf_path: Optional[str] = Field(default=None, max_length=1024)
    signature_container_path: Optional[str] = Field(default=None, max_length=1024)
    validation_report_path: Optional[str] = Field(default=None, max_length=1024)
    evidence_json_path: Optional[str] = Field(default=None, max_length=1024)
    signed_pdf_sha256: Optional[str] = Field(default=None, max_length=64, index=True)

    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class SignatureEvidence(SQLModel, table=True):
    __tablename__ = "signature_evidence"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    signature_request_id: UUID = Field(foreign_key="signature_requests.id", index=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    signer_ip: Optional[str] = Field(default=None, max_length=64)
    signer_user_agent: Optional[str] = Field(default=None, max_length=1024)
    device_hints: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    cert_subject_dn: Optional[str] = Field(default=None, max_length=1024)
    cert_issuer_dn: Optional[str] = Field(default=None, max_length=1024)
    cert_serial: Optional[str] = Field(default=None, max_length=256)
    cert_sha256: Optional[str] = Field(default=None, max_length=64)
    not_before: Optional[datetime] = Field(default=None)
    not_after: Optional[datetime] = Field(default=None)
    revocation_method: Optional[str] = Field(default=None, max_length=16)
    revocation_status: Optional[str] = Field(default=None, max_length=16)
    ocsp_response_b64: Optional[str] = Field(default=None, sa_column=Column(Text))
    crl_url_used: Optional[str] = Field(default=None, max_length=1024)
    timestamp_used: Optional[bool] = Field(default=None)
    tsa_name: Optional[str] = Field(default=None, max_length=512)
    tsa_url: Optional[str] = Field(default=None, max_length=512)
    timestamp_token_b64: Optional[str] = Field(default=None, sa_column=Column(Text))
    timestamp_time: Optional[datetime] = Field(default=None)
    validation_result: Optional[str] = Field(default=None, max_length=32)
    validation_report: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    events: Optional[list[dict]] = Field(default=None, sa_column=Column(JSONB))
    # Legacy compatibility fields:
    ip: Optional[str] = Field(default=None, max_length=64)
    user_agent: Optional[str] = Field(default=None, max_length=1024)
    cert_subject: Optional[str] = Field(default=None, max_length=1024)
    cert_issuer: Optional[str] = Field(default=None, max_length=1024)
    trust_chain_ok: Optional[bool] = Field(default=None)
    revocation_ok: Optional[bool] = Field(default=None)
    tsl_source_used: Optional[str] = Field(default=None, max_length=512)
    tsl_sequence: Optional[str] = Field(default=None, max_length=128)
    timestamp_authority: Optional[str] = Field(default=None, max_length=512)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)

    __table_args__ = (
        Index("ix_signature_evidence_tenant_request", "tenant_id", "signature_request_id"),
    )

