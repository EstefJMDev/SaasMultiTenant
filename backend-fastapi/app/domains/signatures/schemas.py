from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

from app.domains.signatures._core.models import SignatureProviderType


class SignatureRequestCreate(BaseModel):
    contract_id: int
    signer_name: str
    signer_email: EmailStr
    delivery_type: str = "url"
    signature_mode: str = "biometric"
    digital_certificate_name: Optional[str] = None


class SignatureRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    contract_id: int
    provider: str
    status: str
    provider_signature_id: Optional[str]
    provider_document_id: Optional[str]
    signer_name: Optional[str]
    signer_email: Optional[str]
    source_pdf_path: Optional[str]
    signed_pdf_path: Optional[str]
    audit_trail_path: Optional[str]
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]


class SignatureStartResponse(BaseModel):
    request: SignatureRequestRead
    signing_url: Optional[str] = None
    provider_signature_id: Optional[str] = None
    email_sent: Optional[bool] = None
    email_recipient: Optional[str] = None


class SignatureRequestCreateV2(BaseModel):
    provider: Optional[SignatureProviderType] = None
    signer_name: Optional[str] = None
    signer_email: Optional[EmailStr] = None
    signer_user_id: Optional[int] = None


class SignatureRequestReadV2(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: int
    contract_id: int
    provider: SignatureProviderType
    status: str
    signer_name: Optional[str]
    signer_email: Optional[str]
    contract_snapshot_id: str
    pdf_original_sha256: str
    signed_pdf_sha256: Optional[str]
    provider_request_id: Optional[int]
    expires_at: Optional[datetime]
    signed_at: Optional[datetime]
    failure_reason: Optional[str]
    created_at: datetime
    updated_at: datetime


class SignatureRequestCreateResponseV2(BaseModel):
    request: SignatureRequestReadV2
    provider_payload: dict[str, Any]


class AutofirmaPresignResponse(BaseModel):
    session_id: str
    algorithm: str
    to_be_signed_b64: str
    format: str = "PAdES"
    protocol_url: str
    expires_at: datetime


class AutofirmaClientResultPayload(BaseModel):
    session_id: str
    signature_b64: str
    signed_pdf_b64: Optional[str] = None
    cms_signature_b64: Optional[str] = None
    cert_chain_b64: list[str] = []
    device_hints: Optional[dict[str, Any]] = None


class SignatureFinalizeResponse(BaseModel):
    status: str
    signed_pdf_path: Optional[str] = None
    validation_report_path: Optional[str] = None
    evidence_json_path: Optional[str] = None


class PublicSignatureStatusResponse(BaseModel):
    id: UUID
    status: str
    expires_at: Optional[datetime] = None
    signed_at: Optional[datetime] = None
    failure_reason: Optional[str] = None


class TenantSignatureConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    tenant_id: int
    allow_signaturit: bool
    allow_autofirma: bool
    signature_provider_default: SignatureProviderType
    autofirma_session_ttl_minutes: int
    autofirma_tsa_enabled: bool
    autofirma_tsa_url: Optional[str] = None


class TenantSignatureConfigUpdate(BaseModel):
    allow_signaturit: Optional[bool] = None
    allow_autofirma: Optional[bool] = None
    signature_provider_default: Optional[SignatureProviderType] = None
    autofirma_session_ttl_minutes: Optional[int] = None
    autofirma_tsa_enabled: Optional[bool] = None
    autofirma_tsa_url: Optional[str] = None


class SignedDownloadUrlResponse(BaseModel):
    url: str
    expires_at: datetime

