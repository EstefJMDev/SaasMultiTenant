from datetime import date, datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import Column, Index, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class ContractType(str, Enum):
    SUMINISTRO = "SUMINISTRO"
    SERVICIO = "SERVICIO"
    SUBCONTRATACION = "SUBCONTRATACION"


class ContractStatus(str, Enum):
    # Phase 3 — Admin creates contract from approved comparative
    PENDING_TEMPLATE = "PENDING_TEMPLATE"
    # Phase 4 — Template selected, awaiting data validation
    PENDING_DATA_VALIDATION = "PENDING_DATA_VALIDATION"
    # Phase 7 — Document generated, multi-role review
    PENDING_REVIEW = "PENDING_REVIEW"
    # Phase 7 done — all roles approved
    FULLY_APPROVED = "FULLY_APPROVED"
    # Phase 8 — sent for digital signature
    SENT_FOR_SIGNATURE = "SENT_FOR_SIGNATURE"
    SIGNED = "SIGNED"
    REJECTED = "REJECTED"
    # Legacy statuses kept for DB compat
    DRAFT = "DRAFT"
    PENDING_SUPPLIER = "PENDING_SUPPLIER"
    PENDING_JEFE_OBRA = "PENDING_JEFE_OBRA"
    PENDING_GERENCIA = "PENDING_GERENCIA"
    PENDING_DEPARTAMENTOS = "PENDING_DEPARTAMENTOS"
    PENDING_ADMIN = "PENDING_ADMIN"
    PENDING_COMPRAS = "PENDING_COMPRAS"
    PENDING_JURIDICO = "PENDING_JURIDICO"
    IN_SIGNATURE = "IN_SIGNATURE"


LEGACY_PENDING_DEPARTMENT_STATUSES: tuple[ContractStatus, ...] = (
    ContractStatus.PENDING_ADMIN,
    ContractStatus.PENDING_COMPRAS,
    ContractStatus.PENDING_JURIDICO,
)

ACTIVE_APPROVAL_STATUSES: tuple[ContractStatus, ...] = (
    ContractStatus.PENDING_GERENCIA,
    ContractStatus.PENDING_DEPARTAMENTOS,
    *LEGACY_PENDING_DEPARTMENT_STATUSES,
)


class ComparativeStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_MGMT_APPROVAL = "PENDING_MGMT_APPROVAL"
    NEEDS_CHANGES = "NEEDS_CHANGES"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    # Legacy alias kept for DB compat
    PENDING_REVIEW = "PENDING_REVIEW"


class ContractDocumentType(str, Enum):
    COMPARATIVE = "COMPARATIVE"
    CONTRACT = "CONTRACT"
    SIGNED = "SIGNED"


class ContractDepartment(str, Enum):
    GERENCIA = "GERENCIA"
    OBRA = "OBRA"
    ADMIN = "ADMIN"
    COMPRAS = "COMPRAS"
    JURIDICO = "JURIDICO"


class ApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ApprovalScope(str, Enum):
    COMPARATIVE = "COMPARATIVE"
    CONTRACT = "CONTRACT"


class ContractApproverRole(str, Enum):
    """Roles que pueden aprobar/rechazar un contrato.

    Mantiene los valores legacy del antiguo enum ``ContractDepartment``
    para compatibilidad con filas existentes en la tabla
    ``contract_approval``. Los flujos activos para CONTRACT usan
    ADMIN/JURIDICO/JEFE_OBRA/DIRECTOR_TECNICO. Los valores
    OBRA/GERENCIA siguen apareciendo para approvals de scope=COMPARATIVE.
    """

    ADMIN = "ADMIN"
    JURIDICO = "JURIDICO"
    JEFE_OBRA = "JEFE_OBRA"
    DIRECTOR_TECNICO = "DIRECTOR_TECNICO"
    GERENCIA = "GERENCIA"
    OBRA = "OBRA"
    COMPRAS = "COMPRAS"


class SignatureStatus(str, Enum):
    SENT = "SENT"
    SIGNED = "SIGNED"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class ContractNotificationEvent(str, Enum):
    COMPARATIVE_CREATED = "COMPARATIVE_CREATED"
    COMPARATIVE_PENDING_APPROVAL = "COMPARATIVE_PENDING_APPROVAL"
    COMPARATIVE_APPROVED = "COMPARATIVE_APPROVED"
    COMPARATIVE_REJECTED = "COMPARATIVE_REJECTED"
    DOCS_GENERATED = "DOCS_GENERATED"
    SENT_TO_GERENCIA = "SENT_TO_GERENCIA"
    SUPPLIER_PENDING = "SUPPLIER_PENDING"
    SUPPLIER_COMPLETED = "SUPPLIER_COMPLETED"
    GERENCIA_PENDING = "GERENCIA_PENDING"
    GERENCIA_APPROVED = "GERENCIA_APPROVED"
    GERENCIA_REJECTED = "GERENCIA_REJECTED"
    COMPARATIVE_PENDING_WARNING = "COMPARATIVE_PENDING_WARNING"
    COMPARATIVE_AUTO_APPROVED = "COMPARATIVE_AUTO_APPROVED"
    DEPT_APPROVED = "DEPT_APPROVED"
    DEPT_REJECTED = "DEPT_REJECTED"
    ALL_APPROVED = "ALL_APPROVED"
    SIGNATURE_SENT = "SIGNATURE_SENT"
    SIGNED = "SIGNED"
    REJECTED = "REJECTED"


class Contract(SQLModel, table=True):
    __tablename__ = "contract"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    project_id: Optional[int] = Field(default=None, foreign_key="erp_project.id", index=True)

    type: ContractType = Field(index=True)
    status: ContractStatus = Field(default=ContractStatus.DRAFT, index=True)
    comparative_status: str = Field(
        default=ComparativeStatus.DRAFT.value,
        index=True,
        max_length=32,
    )

    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = Field(default=None, sa_column=Column(Text))

    selected_offer_id: Optional[int] = Field(default=None, foreign_key="contract_offer.id", index=True)
    template_id: Optional[int] = Field(default=None, foreign_key="contract_template.id", index=True)
    assigned_admin_user_id: Optional[int] = Field(
        default=None, foreign_key="user.id", index=True
    )

    supplier_name: Optional[str] = Field(default=None, max_length=255)
    supplier_tax_id: Optional[str] = Field(default=None, max_length=64)
    supplier_email: Optional[str] = Field(default=None, max_length=255)
    supplier_phone: Optional[str] = Field(default=None, max_length=64)
    supplier_address: Optional[str] = Field(default=None, max_length=255)
    supplier_city: Optional[str] = Field(default=None, max_length=128)
    supplier_postal_code: Optional[str] = Field(default=None, max_length=32)
    supplier_country: Optional[str] = Field(default=None, max_length=64)
    supplier_contact_name: Optional[str] = Field(default=None, max_length=255)
    supplier_bank_iban: Optional[str] = Field(default=None, max_length=64)
    supplier_bank_bic: Optional[str] = Field(default=None, max_length=32)
    supplier_id: Optional[int] = Field(default=None, foreign_key="supplier.id", index=True)

    # Representante legal del proveedor — snapshot por contrato (migration a3c7e9b2d5f4)
    supplier_legal_rep_name: Optional[str] = Field(default=None, max_length=255)
    supplier_legal_rep_dni: Optional[str] = Field(default=None, max_length=64)

    total_amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2)))
    currency: Optional[str] = Field(default=None, max_length=16)

    service_category: Optional[str] = Field(default=None, max_length=255)
    execution_duration: Optional[str] = Field(default=None, max_length=128)
    insurance_amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2)))
    min_workers: Optional[int] = Field(default=None)
    milestones_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    warranty_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    freight_responsible: Optional[str] = Field(default=None, max_length=128)
    unloading_responsible: Optional[str] = Field(default=None, max_length=128)

    # SUMINISTRO form fields (migration e2f4d8a1c7b9)
    project_number: Optional[str] = Field(default=None, max_length=64)
    promoter: Optional[str] = Field(default=None, max_length=255)
    work_start_date: Optional[date] = Field(default=None)
    work_end_date: Optional[date] = Field(default=None)
    duration_text: Optional[str] = Field(default=None, max_length=128)
    payment_method: Optional[str] = Field(default=None, max_length=64)
    payment_days: Optional[int] = Field(default=None)
    payment_method_other_text: Optional[str] = Field(default=None, max_length=255)

    # SUBCONTRATACION deed fields (migration d4b8e7a2c9f1 + a2c8e4f1b6d9) —
    # snapshot por contrato. Fuente canónica: tabla `proveedores` por CIF.
    # Estas columnas actúan como override manual del form si el usuario
    # corrige el dato.
    deed_type: Optional[str] = Field(default=None, max_length=128)
    deed_date: Optional[date] = Field(default=None)
    notary_name: Optional[str] = Field(default=None, max_length=255)
    notary_protocol: Optional[str] = Field(default=None, max_length=64)

    comparative_data: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    contract_data: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    ocr_data: Optional[dict] = Field(default=None, sa_column=Column(JSONB))

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    submitted_at: Optional[datetime] = Field(default=None)
    approved_at: Optional[datetime] = Field(default=None)
    signed_at: Optional[datetime] = Field(default=None)

    rejected_reason: Optional[str] = Field(default=None, sa_column=Column(Text))
    rejected_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    rejected_at: Optional[datetime] = Field(default=None)
    rejected_to_status: Optional[ContractStatus] = Field(default=None)

    deleted_at: Optional[datetime] = Field(default=None, index=True)

    __table_args__ = (
        Index("ix_contract_tenant_status", "tenant_id", "status"),
        Index("ix_contract_tenant_created", "tenant_id", "created_at"),
    )


class ContractOffer(SQLModel, table=True):
    __tablename__ = "contract_offer"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)

    supplier_name: Optional[str] = Field(default=None, max_length=255)
    supplier_tax_id: Optional[str] = Field(default=None, max_length=64)
    supplier_email: Optional[str] = Field(default=None, max_length=255)
    supplier_phone: Optional[str] = Field(default=None, max_length=64)

    total_amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2)))
    currency: Optional[str] = Field(default=None, max_length=16)

    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    file_path: Optional[str] = Field(default=None, max_length=512)
    original_filename: Optional[str] = Field(default=None, max_length=255)

    extracted_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    extraction_raw_json: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    extraction_meta: Optional[dict] = Field(default=None, sa_column=Column(JSONB))

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_contract_offer_tenant_contract", "tenant_id", "contract_id"),
    )


class ContractApproval(SQLModel, table=True):
    __tablename__ = "contract_approval"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)

    scope: str = Field(
        default=ApprovalScope.CONTRACT.value,
        index=True,
        max_length=32,
    )
    approver_role: str = Field(
        index=True,
        max_length=32,
        description=(
            "Rol que aprueba/rechaza. Para scope=CONTRACT valores: ADMIN, "
            "JURIDICO, JEFE_OBRA, DIRECTOR_TECNICO. Para scope=COMPARATIVE "
            "valores legacy: OBRA, GERENCIA."
        ),
    )
    step_order: Optional[int] = Field(default=None, index=True)
    status: ApprovalStatus = Field(default=ApprovalStatus.PENDING, index=True)
    cycle_number: int = Field(default=1, index=True)

    decided_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    decided_at: Optional[datetime] = Field(default=None)
    comment: Optional[str] = Field(default=None, sa_column=Column(Text))
    # Marca el momento en que se abrió el ciclo de aprobación. Sirve para
    # mostrar la fecha del reenvío en el timeline del comparativo (cuando un
    # ciclo histórico se cierra y se abre el siguiente).
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    auto_approve_at: Optional[datetime] = Field(
        default=None,
        index=True,
        description="Fecha en la que se auto-aprueba si sigue PENDING (3 días naturales desde submit).",
    )

    __table_args__ = (
        Index(
            "uq_contract_approval",
            "tenant_id",
            "contract_id",
            "approver_role",
            "scope",
            "cycle_number",
            unique=True,
        ),
    )


class ContractWorkflowStep(SQLModel, table=True):
    __tablename__ = "contract_workflow_step"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    step_order: int = Field(index=True)
    department_id: Optional[int] = Field(default=None, foreign_key="department.id", index=True)
    department_name: str = Field(max_length=120)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index(
            "uq_contract_workflow_step_tenant_order",
            "tenant_id",
            "step_order",
            unique=True,
        ),
        Index(
            "ix_contract_workflow_step_tenant_department_id",
            "tenant_id",
            "department_id",
        )
    )


class ContractWorkflowApproval(SQLModel, table=True):
    __tablename__ = "contract_workflow_approval"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    step_order: int = Field(index=True)
    department_id: Optional[int] = Field(default=None, foreign_key="department.id", index=True)
    department_name: str = Field(max_length=120)
    status: ApprovalStatus = Field(default=ApprovalStatus.PENDING, index=True)
    decided_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    decided_at: Optional[datetime] = Field(default=None)
    comment: Optional[str] = Field(default=None, sa_column=Column(Text))

    __table_args__ = (
        Index(
            "uq_contract_workflow_approval",
            "tenant_id",
            "contract_id",
            "step_order",
            unique=True,
        ),
        Index(
            "ix_contract_workflow_approval_tenant_department_status",
            "tenant_id",
            "department_id",
            "status",
        ),
    )


class ContractDocument(SQLModel, table=True):
    __tablename__ = "contract_document"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    doc_type: ContractDocumentType = Field(index=True)
    path: str = Field(max_length=512)
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_contract_doc_tenant_contract", "tenant_id", "contract_id"),
    )


class SignatureRequest(SQLModel, table=True):
    __tablename__ = "signature_request"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)

    token: str = Field(index=True, unique=True, max_length=128)
    recipient_email: Optional[str] = Field(default=None, max_length=255)
    expires_at: datetime = Field(index=True)
    status: SignatureStatus = Field(default=SignatureStatus.SENT, index=True)

    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    signed_at: Optional[datetime] = Field(default=None)
    signed_ip: Optional[str] = Field(default=None, max_length=64)
    signed_file_path: Optional[str] = Field(default=None, max_length=512)


class ContractEvent(SQLModel, table=True):
    __tablename__ = "contract_event"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    event_type: str = Field(index=True, max_length=64)
    payload: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)


class ContractNotificationLog(SQLModel, table=True):
    __tablename__ = "contract_notification_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)
    event_type: ContractNotificationEvent = Field(index=True)
    recipient_email: Optional[str] = Field(default=None, max_length=255)
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index(
            "uq_contract_notification_log",
            "tenant_id",
            "contract_id",
            "event_type",
            "recipient_email",
            unique=True,
        ),
    )


class SupplierStatus(str, Enum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"


class Supplier(SQLModel, table=True):
    __tablename__ = "supplier"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)

    tax_id: str = Field(max_length=64, index=True)
    name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=64)
    address: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=128)
    postal_code: Optional[str] = Field(default=None, max_length=32)
    country: Optional[str] = Field(default=None, max_length=64)
    contact_name: Optional[str] = Field(default=None, max_length=255)
    bank_iban: Optional[str] = Field(default=None, max_length=64)
    bank_bic: Optional[str] = Field(default=None, max_length=32)

    legal_rep_name: Optional[str] = Field(default=None, max_length=255)
    legal_rep_dni: Optional[str] = Field(default=None, max_length=64)
    deed_type: Optional[str] = Field(default=None, max_length=64)
    deed_date: Optional[datetime] = Field(default=None)
    notary_name: Optional[str] = Field(default=None, max_length=255)
    notary_protocol: Optional[str] = Field(default=None, max_length=64)

    status: SupplierStatus = Field(default=SupplierStatus.PENDING, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("uq_supplier_tenant_tax_id", "tenant_id", "tax_id", unique=True),
    )


class SupplierInvitation(SQLModel, table=True):
    __tablename__ = "supplier_invitation"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    supplier_id: int = Field(foreign_key="supplier.id", index=True)
    contract_id: Optional[int] = Field(default=None, foreign_key="contract.id", index=True)

    email: Optional[str] = Field(default=None, max_length=255)
    token: str = Field(index=True, unique=True, max_length=128)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(index=True)
    used_at: Optional[datetime] = Field(default=None)


class ContractSubtype(str, Enum):
    SUBCONTRATACION = "subcontratacion"
    SERVICIO = "servicio"
    SUMINISTRO = "suministro"


class ContractTemplate(SQLModel, table=True):
    """Plantillas de contrato subidas por tenant. Variables con formato [NOMBRE]."""

    __tablename__ = "contract_template"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    created_by_id: Optional[int] = Field(default=None, foreign_key="user.id")

    name: str = Field(max_length=255)
    subtype: str = Field(max_length=32, index=True)  # ContractSubtype value
    file_path: str = Field(max_length=512)
    original_filename: str = Field(max_length=255)
    file_format: str = Field(max_length=8)  # "docx" | "pdf"
    variables: Optional[list] = Field(default=None, sa_column=Column(JSONB))

    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_contract_template_tenant_subtype", "tenant_id", "subtype"),
    )


class SupplierDataRequest(SQLModel, table=True):
    """Token enviado al proveedor para completar datos faltantes (Fase 6B)."""

    __tablename__ = "supplier_data_request"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    contract_id: int = Field(foreign_key="contract.id", index=True)

    token: str = Field(index=True, unique=True, max_length=128)
    missing_fields: Optional[list] = Field(default=None, sa_column=Column(JSONB))
    expires_at: datetime = Field(index=True)
    completed_at: Optional[datetime] = Field(default=None)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_supplier_data_request_tenant_contract", "tenant_id", "contract_id"),
    )
