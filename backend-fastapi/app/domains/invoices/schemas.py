from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.domains.invoices.models import InvoiceStatus


class InvoiceExtractionData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    supplier_name: Optional[str] = None
    supplier_tax_id: Optional[str] = None
    invoice_number: Optional[str] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    total_amount: Optional[Decimal] = None
    currency: Optional[str] = None
    concept: Optional[str] = None
    subsidizable: Optional[bool] = None
    expense_type: Optional[str] = None
    milestone_id: Optional[int] = None
    budget_milestone_id: Optional[int] = None

    @field_validator("issue_date", "due_date", mode="before")
    @classmethod
    def _parse_dates(cls, value):
        if value is None or value == "":
            return None
        if isinstance(value, date):
            return value
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, str):
            value = value.strip()
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
                try:
                    return datetime.strptime(value, fmt).date()
                except ValueError:
                    continue
            # Intento con parte de fecha si viene con hora.
            for sep in ("T", " "):
                if sep in value:
                    try:
                        return datetime.fromisoformat(value.split(sep)[0]).date()
                    except ValueError:
                        break
        return None

    @field_validator("total_amount", mode="before")
    @classmethod
    def _parse_amount(cls, value):
        if value is None or value == "":
            return None
        if isinstance(value, Decimal):
            return value
        if isinstance(value, (int, float)):
            return Decimal(str(value))
        if isinstance(value, str):
            raw = (
                value.replace("€", "")
                .replace("$", "")
                .replace("USD", "")
                .replace("EUR", "")
                .replace(" ", "")
            )
            # Normaliza separadores: 1.234,56 -> 1234.56
            if raw.count(",") == 1 and raw.count(".") >= 1:
                raw = raw.replace(".", "").replace(",", ".")
            elif raw.count(",") == 1 and raw.count(".") == 0:
                raw = raw.replace(",", ".")
            try:
                return Decimal(raw)
            except (InvalidOperation, ValueError):
                return None
        return None

    @field_validator("currency", mode="before")
    @classmethod
    def _normalize_currency(cls, value):
        if value is None:
            return None
        if isinstance(value, str):
            cleaned = value.strip().upper()
            return cleaned or None
        return None


class InvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    created_by_id: int
    project_id: Optional[int]
    department_id: Optional[int]
    status: InvoiceStatus
    file_path: str
    original_filename: Optional[str]
    supplier_name: Optional[str]
    supplier_tax_id: Optional[str]
    invoice_number: Optional[str]
    issue_date: Optional[date]
    due_date: Optional[date]
    total_amount: Optional[Decimal]
    currency: Optional[str]
    concept: Optional[str]
    subsidizable: Optional[bool]
    expense_type: Optional[str]
    milestone_id: Optional[int]
    budget_milestone_id: Optional[int]
    raw_text: Optional[str]
    extraction_raw_json: Optional[dict]
    extraction_meta: Optional[dict]
    classification_suggestions: Optional[dict]
    extraction_error: Optional[str]
    created_at: datetime
    updated_at: datetime
    extracted_at: Optional[datetime]
    validated_at: Optional[datetime]
    paid_at: Optional[datetime]


class InvoiceUpdate(BaseModel):
    supplier_name: Optional[str] = None
    supplier_tax_id: Optional[str] = None
    invoice_number: Optional[str] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    total_amount: Optional[Decimal] = None
    currency: Optional[str] = None
    concept: Optional[str] = None
    subsidizable: Optional[bool] = None
    expense_type: Optional[str] = None
    milestone_id: Optional[int] = None
    budget_milestone_id: Optional[int] = None
    project_id: Optional[int] = None
    department_id: Optional[int] = None
    status: Optional[InvoiceStatus] = None

