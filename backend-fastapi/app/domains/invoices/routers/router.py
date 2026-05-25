from datetime import date
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.db.session import get_session
from app.domains.invoices.models import InvoiceStatus
from app.domains.invoices.schemas import InvoiceRead, InvoiceUpdate
from app.domains.invoices.service import (
    create_invoice_with_upload,
    delete_invoice,
    get_invoice,
    list_invoices,
    mark_invoice_paid,
    prepare_reprocess,
    update_invoice,
)
from app.models.user import User
from app.core.tenancy import tenant_required_for_superadmin
from app.workers.tasks.invoices import extract_invoice


router = APIRouter()
logger = logging.getLogger("app.domains.invoices.router")


def _tenant_for_write(current_user: User, x_tenant_id: Optional[int]) -> int:
    return tenant_required_for_superadmin(current_user, x_tenant_id)


@router.post("", response_model=InvoiceRead)
def upload_invoice(
    file: UploadFile = File(...),
    project_id: Optional[int] = Form(default=None),
    subsidizable: Optional[bool] = Form(default=None),
    expense_type: Optional[str] = Form(default=None),
    milestone_id: Optional[int] = Form(default=None),
    budget_milestone_id: Optional[int] = Form(default=None),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> InvoiceRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    if project_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id requerido para crear la factura.",
        )
    invoice = create_invoice_with_upload(
        session=session,
        tenant_id=tenant_id,
        created_by_id=current_user.id,
        upload=file,
        project_id=project_id,
        subsidizable=subsidizable,
        expense_type=expense_type,
        milestone_id=milestone_id,
        budget_milestone_id=budget_milestone_id,
    )

    # Encolamos extraccion asincrona sin bloquear la request.
    try:
        extract_invoice.delay(invoice.id)
    except Exception as exc:
        logger.exception(
            "No se pudo encolar OCR para factura id=%s: %s",
            invoice.id,
            exc,
        )

    return InvoiceRead.model_validate(invoice)


@router.get("", response_model=list[InvoiceRead])
def list_invoices_endpoint(
    project_id: Optional[int] = None,
    department_id: Optional[int] = None,
    status: Optional[InvoiceStatus] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[InvoiceRead]:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    invoices = list_invoices(
        session=session,
        tenant_id=tenant_id,
        project_id=project_id,
        department_id=department_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
    )
    return [InvoiceRead.model_validate(item) for item in invoices]


@router.get("/{invoice_id}", response_model=InvoiceRead)
def get_invoice_by_id(
    invoice_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> InvoiceRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    invoice = get_invoice(session=session, invoice_id=invoice_id, tenant_id=tenant_id)
    return InvoiceRead.model_validate(invoice)


@router.get("/{invoice_id}/download")
def download_invoice_file(
    invoice_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> FileResponse:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    invoice = get_invoice(session=session, invoice_id=invoice_id, tenant_id=tenant_id)
    if not invoice.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo no encontrado.",
        )
    base_path = Path(settings.invoices_storage_path).resolve()
    file_path = Path(invoice.file_path)
    resolved_path = (base_path / file_path).resolve() if not file_path.is_absolute() else file_path.resolve()
    try:
        resolved_path.relative_to(base_path)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo no encontrado.",
        ) from exc
    if not resolved_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo no encontrado.",
        )
    return FileResponse(
        path=str(resolved_path),
        filename=invoice.original_filename or f"invoice-{invoice.id}",
    )


@router.patch("/{invoice_id}", response_model=InvoiceRead)
def update_invoice_by_id(
    invoice_id: int,
    payload: InvoiceUpdate,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> InvoiceRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    invoice = update_invoice(
        session=session,
        invoice_id=invoice_id,
        tenant_id=tenant_id,
        payload=payload,
        user_id=current_user.id,
    )
    return InvoiceRead.model_validate(invoice)


@router.post("/{invoice_id}/mark-paid", response_model=InvoiceRead)
def mark_invoice_paid_endpoint(
    invoice_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> InvoiceRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    invoice = mark_invoice_paid(
        session=session,
        invoice_id=invoice_id,
        tenant_id=tenant_id,
        user_id=current_user.id,
    )
    return InvoiceRead.model_validate(invoice)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_invoice_endpoint(
    invoice_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    delete_invoice(session=session, invoice_id=invoice_id, tenant_id=tenant_id)


@router.post("/{invoice_id}/reprocess", response_model=InvoiceRead)
def reprocess_invoice_endpoint(
    invoice_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> InvoiceRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    invoice = prepare_reprocess(session=session, invoice_id=invoice_id, tenant_id=tenant_id)
    try:
        extract_invoice.delay(invoice.id)
    except Exception as exc:
        logger.exception(
            "No se pudo encolar reproceso OCR para factura id=%s: %s",
            invoice.id,
            exc,
        )
    return InvoiceRead.model_validate(invoice)

