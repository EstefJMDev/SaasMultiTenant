from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.platform.contracts_core.models import (
    ApprovalStatus,
    ComparativeStatus,
    ContractDepartment,
    ContractDocumentType,
    ContractStatus,
    ContractSubtype,
    ContractType,
    SignatureStatus,
    SupplierStatus,
)


class ContractCreate(BaseModel):
    type: ContractType
    title: Optional[str] = None
    comparative_data: Optional[dict] = None
    contract_data: Optional[dict] = None


class ContractUpdate(BaseModel):
    type: Optional[ContractType] = None
    title: Optional[str] = None

    supplier_name: Optional[str] = None
    supplier_tax_id: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_phone: Optional[str] = None
    supplier_address: Optional[str] = None
    supplier_city: Optional[str] = None
    supplier_postal_code: Optional[str] = None
    supplier_country: Optional[str] = None
    supplier_contact_name: Optional[str] = None
    supplier_bank_iban: Optional[str] = None
    supplier_bank_bic: Optional[str] = None
    supplier_legal_rep_name: Optional[str] = None
    supplier_legal_rep_dni: Optional[str] = None

    total_amount: Optional[Decimal] = None
    insurance_amount: Optional[Decimal] = None
    currency: Optional[str] = None

    milestones_text: Optional[str] = None
    freight_responsible: Optional[str] = None
    unloading_responsible: Optional[str] = None

    project_number: Optional[str] = None
    promoter: Optional[str] = None
    work_start_date: Optional[date] = None
    work_end_date: Optional[date] = None
    duration_text: Optional[str] = None
    payment_method: Optional[str] = None
    payment_days: Optional[int] = None
    payment_method_other_text: Optional[str] = None

    deed_type: Optional[str] = None
    deed_date: Optional[date] = None
    notary_name: Optional[str] = None
    notary_protocol: Optional[str] = None
    warranty_text: Optional[str] = None
    service_category: Optional[str] = None
    min_workers: Optional[int] = None

    comparative_data: Optional[dict] = None
    contract_data: Optional[dict] = None


class ComparativeDraftUpdate(BaseModel):
    type: Optional[ContractType] = None
    title: Optional[str] = None
    comparative_data: Optional[dict] = None


class ContractRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    created_by_id: int
    project_id: Optional[int]
    type: ContractType
    status: ContractStatus
    comparative_status: ComparativeStatus
    title: Optional[str]
    description: Optional[str]
    selected_offer_id: Optional[int]
    template_id: Optional[int] = None
    assigned_admin_user_id: Optional[int] = None
    assigned_admin_user_name: Optional[str] = None

    supplier_name: Optional[str]
    supplier_tax_id: Optional[str]
    supplier_email: Optional[str]
    supplier_phone: Optional[str]
    supplier_address: Optional[str]
    supplier_city: Optional[str]
    supplier_postal_code: Optional[str]
    supplier_country: Optional[str]
    supplier_contact_name: Optional[str]
    supplier_bank_iban: Optional[str]
    supplier_bank_bic: Optional[str]
    supplier_legal_rep_name: Optional[str] = None
    supplier_legal_rep_dni: Optional[str] = None

    total_amount: Optional[Decimal]
    insurance_amount: Optional[Decimal] = None
    currency: Optional[str]

    milestones_text: Optional[str] = None
    freight_responsible: Optional[str] = None
    unloading_responsible: Optional[str] = None

    project_number: Optional[str] = None
    promoter: Optional[str] = None
    work_start_date: Optional[date] = None
    work_end_date: Optional[date] = None
    duration_text: Optional[str] = None
    payment_method: Optional[str] = None
    payment_days: Optional[int] = None
    payment_method_other_text: Optional[str] = None

    deed_type: Optional[str] = None
    deed_date: Optional[date] = None
    notary_name: Optional[str] = None
    notary_protocol: Optional[str] = None
    warranty_text: Optional[str] = None
    service_category: Optional[str] = None
    min_workers: Optional[int] = None

    comparative_data: Optional[dict]
    contract_data: Optional[dict]
    ocr_data: Optional[dict]

    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime]
    approved_at: Optional[datetime]
    signed_at: Optional[datetime]

    rejected_reason: Optional[str]
    rejected_by_id: Optional[int]
    rejected_at: Optional[datetime]
    rejected_to_status: Optional[ContractStatus]
    current_pending_department: Optional[str] = None
    current_pending_department_id: Optional[int] = None
    current_pending_step_order: Optional[int] = None


class ContractOfferCreate(BaseModel):
    supplier_name: Optional[str] = None
    supplier_tax_id: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_phone: Optional[str] = None
    total_amount: Optional[Decimal] = None
    currency: Optional[str] = None
    notes: Optional[str] = None


class ContractOfferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    contract_id: int
    created_by_id: int
    supplier_name: Optional[str]
    supplier_tax_id: Optional[str]
    supplier_email: Optional[str]
    supplier_phone: Optional[str]
    total_amount: Optional[Decimal]
    currency: Optional[str]
    notes: Optional[str]
    file_path: Optional[str]
    original_filename: Optional[str]
    created_at: datetime


class ContractApprovalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    contract_id: int
    department: ContractDepartment
    step_order: Optional[int]
    status: ApprovalStatus
    decided_by_id: Optional[int]
    decided_at: Optional[datetime]
    comment: Optional[str]


class ContractDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    contract_id: int
    doc_type: ContractDocumentType
    path: str
    created_by_id: Optional[int]
    created_at: datetime


class SelectOfferRequest(BaseModel):
    offer_id: int


class ApprovalDecision(BaseModel):
    comment: Optional[str] = None


class RejectRequest(BaseModel):
    reason: str
    back_to_status: Optional[ContractStatus] = None


class ComparativeRejectRequest(BaseModel):
    reason: str


class SignatureRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    contract_id: int
    token: str
    recipient_email: Optional[str]
    expires_at: datetime
    status: SignatureStatus
    sent_at: datetime
    signed_at: Optional[datetime]


class SignatureRequestValidate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    contract_id: int
    tenant_id: int
    status: SignatureStatus
    expires_at: datetime
    signed_at: Optional[datetime]


class SupplierRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    tax_id: str
    name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    address: Optional[str]
    city: Optional[str]
    postal_code: Optional[str]
    country: Optional[str]
    contact_name: Optional[str]
    bank_iban: Optional[str]
    bank_bic: Optional[str]
    legal_rep_name: Optional[str] = None
    legal_rep_dni: Optional[str] = None
    deed_type: Optional[str] = None
    deed_date: Optional[date] = None
    notary_name: Optional[str] = None
    notary_protocol: Optional[str] = None
    status: SupplierStatus


class SupplierLookupResponse(BaseModel):
    found: bool
    supplier: Optional[SupplierRead] = None


class SupplierOnboardingValidate(BaseModel):
    token: str
    supplier: SupplierRead
    contract_id: Optional[int] = None
    tenant_id: int
    contract_type: Optional[ContractType] = None
    required_fields: list[str] = []
    missing_fields: list[str] = []
    prefill: dict[str, Optional[str]] = {}
    is_valid: bool = True
    is_used: bool = False
    is_expired: bool = False
    message: Optional[str] = None


class SupplierOnboardingLinkRead(BaseModel):
    token: str
    url: str
    expires_at: datetime
    recipient_email: Optional[str] = None
    email_sent: bool = False


class SupplierOnboardingLinkGenerate(BaseModel):
    supplier_tax_id: Optional[str] = None
    supplier_email: Optional[str] = None


class SupplierOnboardingSubmit(BaseModel):
    token: str
    razon_social: Optional[str] = None
    empresa: Optional[str] = None
    cif: Optional[str] = None
    nombre_gerente: Optional[str] = None
    nif_gerente: Optional[str] = None
    direccion_empresa: Optional[str] = None
    tipo_escritura: Optional[str] = None
    fecha_escritura: Optional[str] = None
    nombre_notario: Optional[str] = None
    num_protocolo: Optional[str] = None


class ContractWorkflowStepInput(BaseModel):
    department_id: int
    step_order: int


class ContractWorkflowConfigUpdate(BaseModel):
    steps: list[ContractWorkflowStepInput]


class ContractWorkflowStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    department_id: Optional[int]
    department_name: str
    step_order: int
    is_active: bool


class ContractWorkflowConfigRead(BaseModel):
    steps: list[ContractWorkflowStepRead]


class ContractWorkflowApprovalRead(BaseModel):
    id: int
    tenant_id: int
    contract_id: int
    step_order: int
    department_id: Optional[int] = None
    department_name: str
    status: ApprovalStatus
    decided_by_id: Optional[int] = None
    decided_by_name: Optional[str] = None
    decided_by_department: Optional[str] = None
    decided_at: Optional[datetime] = None
    comment: Optional[str] = None


class ContractComparativeApprovalRead(BaseModel):
    id: int
    tenant_id: int
    contract_id: int
    department: str
    status: ApprovalStatus
    cycle_number: int = 1
    created_at: Optional[datetime] = None
    decided_by_id: Optional[int] = None
    decided_by_name: Optional[str] = None
    decided_by_department: Optional[str] = None
    decided_at: Optional[datetime] = None
    comment: Optional[str] = None


# ── Templates ─────────────────────────────────────────────────────────────────

class ContractTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    name: str
    subtype: str
    original_filename: str
    file_format: str
    variables: Optional[list] = None
    is_active: bool
    created_at: datetime


class ContractTemplateCreate(BaseModel):
    name: str
    subtype: ContractSubtype


# ── Comparative workflow actions ───────────────────────────────────────────────

class ComparativeReturnRequest(BaseModel):
    """Gerencia devuelve comparativo al creador con comentario."""
    comment: str


class ComparativeApproveRequest(BaseModel):
    comment: Optional[str] = None


# ── Contract workflow (FASE 3+) ────────────────────────────────────────────────

class ContractFromComparativeCreate(BaseModel):
    """Admin crea contrato desde comparativo aprobado."""
    comparative_id: int
    subtype: ContractSubtype


class ContractSelectTemplateRequest(BaseModel):
    template_id: int


class ContractFieldValidationResult(BaseModel):
    """Resultado de validación de campos de la plantilla."""
    missing: list[str]
    is_complete: bool


class ContractActivateRequest(BaseModel):
    """Admin activa el contrato desde comparativo aprobado (FASE 3)."""
    subtype: Optional[ContractSubtype] = None


class ContractSelectTemplateResponse(BaseModel):
    contract: ContractRead
    validation: ContractFieldValidationResult


class ContractRoleApprovalDecision(BaseModel):
    """Decisión de un rol en la revisión multi-rol (Fase 7)."""
    approved: bool
    comment: Optional[str] = None


# ── Supplier data request ──────────────────────────────────────────────────────

class SupplierDataRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    contract_id: int
    token: str
    missing_fields: Optional[list] = None
    expires_at: datetime
    completed_at: Optional[datetime] = None
    contract_type: Optional[str] = None


class SupplierDataSubmit(BaseModel):
    """Payload del proveedor para completar campos faltantes."""
    nombre_proveedor: Optional[str] = None
    cif_nif: Optional[str] = None
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    codigo_postal: Optional[str] = None
    email_proveedor: Optional[str] = None
    telefono: Optional[str] = None
    iban: Optional[str] = None
