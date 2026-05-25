from datetime import datetime, date
from decimal import Decimal
from enum import Enum
from typing import Optional

from sqlalchemy import Column, Index, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class InvoiceStatus(str, Enum):
    """Estados principales del ciclo de vida de una factura."""

    UPLOADED = "uploaded"
    EXTRACTING = "extracting"
    EXTRACTED = "extracted"
    SUGGESTED = "suggested"
    VALIDATED = "validated"
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"


class InvoiceEventType(str, Enum):
    """Eventos de auditoria relevantes para facturas."""

    UPLOADED = "uploaded"
    EXTRACTED = "extracted"
    VALIDATED = "validated"
    ASSIGNED = "assigned"
    REMINDER_SENT = "reminder_sent"
    PAID = "paid"
    FAILED = "failed"


class Invoice(SQLModel, table=True):
    """Factura multi-tenant con campos hibridos (columnas + JSONB)."""

    __tablename__ = "invoice"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    project_id: Optional[int] = Field(default=None, foreign_key="erp_project.id", index=True)
    department_id: Optional[int] = Field(default=None, foreign_key="department.id", index=True)

    status: InvoiceStatus = Field(default=InvoiceStatus.UPLOADED, index=True)

    file_path: str = Field(max_length=512, description="Ruta local del archivo")
    original_filename: Optional[str] = Field(default=None, max_length=255)

    supplier_name: Optional[str] = Field(default=None, max_length=255)
    supplier_tax_id: Optional[str] = Field(default=None, max_length=64)
    invoice_number: Optional[str] = Field(default=None, max_length=128)
    issue_date: Optional[date] = Field(default=None)
    due_date: Optional[date] = Field(default=None, index=True)
    total_amount: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 2))
    )
    currency: Optional[str] = Field(default=None, max_length=16)
    concept: Optional[str] = Field(default=None, sa_column=Column(Text))
    subsidizable: Optional[bool] = Field(default=None)
    expense_type: Optional[str] = Field(default=None, max_length=128)
    milestone_id: Optional[int] = Field(
        default=None, foreign_key="erp_milestone.id", index=True
    )
    budget_milestone_id: Optional[int] = Field(
        default=None, foreign_key="erp_project_budget_milestone.id", index=True
    )

    raw_text: Optional[str] = Field(default=None, sa_column=Column(Text))
    extraction_raw_json: Optional[dict] = Field(
        default=None, sa_column=Column(JSONB)
    )
    extraction_meta: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    classification_suggestions: Optional[dict] = Field(
        default=None, sa_column=Column(JSONB)
    )
    extraction_error: Optional[str] = Field(default=None, sa_column=Column(Text))

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    extracted_at: Optional[datetime] = Field(default=None)
    validated_at: Optional[datetime] = Field(default=None)
    paid_at: Optional[datetime] = Field(default=None)

    __table_args__ = (
        Index("ix_invoice_tenant_status", "tenant_id", "status"),
        Index("ix_invoice_tenant_due_date", "tenant_id", "due_date"),
        Index("ix_invoice_tenant_project", "tenant_id", "project_id"),
        Index("ix_invoice_tenant_department", "tenant_id", "department_id"),
    )


class InvoiceEvent(SQLModel, table=True):
    """Eventos de auditoria del flujo de facturas."""

    __tablename__ = "invoice_event"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    invoice_id: int = Field(foreign_key="invoice.id", index=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.id", index=True)
    event_type: InvoiceEventType = Field(index=True)
    payload: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class NotificationType(str, Enum):
    """Tipos de recordatorio de pago."""

    CREATED = "CREATED"
    DUE_20 = "DUE_20"
    DUE_10 = "DUE_10"
    DUE_5 = "DUE_5"
    DUE_1 = "DUE_1"
    DUE_DAILY = "DUE_DAILY"


class NotificationLog(SQLModel, table=True):
    """Registro de notificaciones para idempotencia."""

    __tablename__ = "notification_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    invoice_id: int = Field(foreign_key="invoice.id", index=True)
    notification_type: NotificationType = Field(index=True)
    recipient_email: Optional[str] = Field(default=None, max_length=255)
    scheduled_for: date = Field(index=True)
    sent_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        Index(
            "uq_notification_log",
            "tenant_id",
            "invoice_id",
            "notification_type",
            "scheduled_for",
            unique=True,
        ),
    )
