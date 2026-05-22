from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from openpyxl.utils.exceptions import InvalidFileException
from sqlmodel import Session
from zipfile import BadZipFile

from app.api.deps import get_current_active_user
from app.domains.procurement.comparatives.excel_import import parse_comparative_excel
from app.domains.procurement.contracts.routers.router_common import tenant_for_write
from app.platform.contracts_core.schemas import (
    ApprovalDecision,
    ComparativeDraftUpdate,
    ComparativeRejectRequest,
    ComparativeReturnRequest,
    ContractOfferCreate,
    ContractOfferRead,
    ContractRead,
    SelectOfferRequest,
)
from app.domains.procurement.contracts.service import comparatives_service, contracts_service
from app.db.session import get_session
from app.models.user import User
from app.platform.contracts_core.models import ContractType
from app.storage.local import save_comparative_source_bytes
from sqlalchemy.orm.attributes import flag_modified


router = APIRouter()


@router.get("/{contract_id}/comparative-offers", response_model=list[dict])
def get_comparative_offers_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[dict]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    return comparatives_service.get_comparative_offers(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )


@router.patch("/{contract_id}/comparative-draft", response_model=ContractRead)
def save_comparative_draft_endpoint(
    contract_id: int,
    payload: ComparativeDraftUpdate,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = comparatives_service.save_draft(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        payload=payload.model_dump(exclude_unset=True),
        user=current_user,
    )
    return contracts_service.build_read(session, contract)


@router.post("/comparatives/import-excel", response_model=ContractRead)
async def import_comparative_excel_endpoint(
    file: UploadFile = File(...),
    type: ContractType = Form(...),
    title: Optional[str] = Form(default=None),
    obra_numero: Optional[str] = Form(default=None),
    obra_nombre: Optional[str] = Form(default=None),
    jefe_obra: Optional[str] = Form(default=None),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo Excel requerido.")
    content = await file.read()
    try:
        comparative_data = parse_comparative_excel(content, filename=file.filename)
    except (ValueError, InvalidFileException, BadZipFile) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo leer el Excel. Usa un archivo .xlsx valido.",
        ) from exc

    # Datos rellenados manualmente en el formulario tienen prioridad sobre los
    # parseados del Excel (obra, jefe de obra). Si el usuario los escribió,
    # NUNCA sobrescribir con el contenido del fichero.
    manual_obra_numero = (obra_numero or "").strip()
    manual_obra_nombre = (obra_nombre or "").strip()
    manual_jefe_obra = (jefe_obra or "").strip()
    if isinstance(comparative_data, dict) and (
        manual_obra_numero or manual_obra_nombre or manual_jefe_obra
    ):
        header = comparative_data.get("header")
        if not isinstance(header, dict):
            header = {}
            comparative_data["header"] = header
        if manual_obra_numero:
            comparative_data["obra_numero"] = manual_obra_numero
            header["obra_num"] = manual_obra_numero
        if manual_obra_nombre:
            comparative_data["obra_nombre"] = manual_obra_nombre
            header["obra_nombre"] = manual_obra_nombre
        if manual_jefe_obra:
            comparative_data["jefe_obra"] = manual_jefe_obra
            header["jefe_obra"] = manual_jefe_obra

    manual_title = (title or "").strip() or None
    payload = {
        "type": type,
        "comparative_data": comparative_data,
        **({"title": manual_title} if manual_title else {}),
    }
    contract = contracts_service.create(
        session=session,
        tenant_id=tenant_id,
        created_by=current_user,
        payload=payload,
    )

    try:
        saved_path = save_comparative_source_bytes(
            content=content,
            tenant_id=tenant_id,
            contract_id=contract.id,
            original_filename=file.filename,
        )
        existing = dict(contract.comparative_data or {})
        existing["source_file_path"] = str(saved_path)
        existing["source_filename"] = file.filename
        contract.comparative_data = existing
        flag_modified(contract, "comparative_data")
        session.add(contract)
        session.commit()
        session.refresh(contract)
    except Exception:
        # Si falla la persistencia del archivo, no rompemos el flujo:
        # el comparativo queda creado con el JSON parseado (fallback).
        pass

    return contracts_service.build_read(session, contract)


@router.get("/{contract_id}/comparative-source/download")
def download_comparative_source_endpoint(
    contract_id: int,
    inline: bool = Query(default=False),
    tenant_id: Optional[int] = Query(default=None),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> FileResponse:
    resolved_tenant_id = tenant_for_write(
        current_user,
        x_tenant_id if x_tenant_id is not None else tenant_id,
        session,
    )
    contract = contracts_service.get_by_id(
        session=session,
        contract_id=contract_id,
        tenant_id=resolved_tenant_id,
        user=current_user,
    )
    data = dict(contract.comparative_data or {})
    raw_path = data.get("source_file_path")
    if not raw_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Este comparativo no tiene un archivo Excel original almacenado.",
        )
    path_obj = Path(str(raw_path))
    if not path_obj.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo Excel original no encontrado en almacenamiento.",
        )
    filename = data.get("source_filename") or f"comparativo-CP-{contract_id}{path_obj.suffix}"
    return FileResponse(
        path=str(path_obj),
        filename=str(filename),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content_disposition_type="inline" if inline else "attachment",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        },
    )


@router.post("/{contract_id}/comparative-source/replace", response_model=ContractRead)
async def replace_comparative_source_endpoint(
    contract_id: int,
    file: UploadFile = File(...),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archivo Excel requerido.",
        )
    content = await file.read()
    try:
        parsed = parse_comparative_excel(content, filename=file.filename)
    except (ValueError, InvalidFileException, BadZipFile) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo leer el Excel. Usa un archivo .xlsx valido.",
        ) from exc

    contract = contracts_service.get_by_id(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )

    saved_path = save_comparative_source_bytes(
        content=content,
        tenant_id=tenant_id,
        contract_id=contract.id,
        original_filename=file.filename,
    )

    merged = dict(parsed or {})
    merged["source_file_path"] = str(saved_path)
    merged["source_filename"] = file.filename
    contract.comparative_data = merged
    flag_modified(contract, "comparative_data")
    session.add(contract)
    session.commit()
    session.refresh(contract)

    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/sync-comparative-offers", response_model=list[dict])
def sync_comparative_offers_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[dict]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    return comparatives_service.sync_offer_ids(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )


@router.post("/{contract_id}/offers", response_model=ContractOfferRead)
def add_offer_endpoint(
    contract_id: int,
    file: UploadFile = File(...),
    supplier_name: Optional[str] = Form(default=None),
    supplier_tax_id: Optional[str] = Form(default=None),
    supplier_email: Optional[str] = Form(default=None),
    supplier_phone: Optional[str] = Form(default=None),
    total_amount: Optional[float] = Form(default=None),
    currency: Optional[str] = Form(default=None),
    notes: Optional[str] = Form(default=None),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractOfferRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    payload = ContractOfferCreate(
        supplier_name=supplier_name,
        supplier_tax_id=supplier_tax_id,
        supplier_email=supplier_email,
        supplier_phone=supplier_phone,
        total_amount=total_amount,
        currency=currency,
        notes=notes,
    ).model_dump()
    offer = comparatives_service.add_offer(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        payload=payload,
        upload=file,
        user=current_user,
    )
    return ContractOfferRead.model_validate(offer)


@router.post("/{contract_id}/select-offer", response_model=ContractRead)
def select_offer_endpoint(
    contract_id: int,
    payload: SelectOfferRequest,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = comparatives_service.select_offer(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        offer_id=payload.offer_id,
        user=current_user,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/validate-rea")
def validate_rea_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    """Consulta REA del proveedor y devuelve si esta acreditado y si existe en BD.

    Respuesta:
      - rea: { encontrada, estado, tipo_identificacion, numero }
      - supplier_in_db: bool (proveedor existe y esta ACTIVE en BD local)
      - next_action: "send_to_approval" | "send_to_supplier"
    """
    import logging as _logging
    _log = _logging.getLogger("app.platform.contracts_core")
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    try:
        result = comparatives_service.validate_rea(
            session=session,
            contract_id=contract_id,
            tenant_id=tenant_id,
            user=current_user,
        )
    except HTTPException:
        raise
    except Exception as exc:
        _log.exception(
            "validate-rea fallo inesperado contract_id=%s tenant_id=%s: %s",
            contract_id,
            tenant_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al validar REA: {exc!s}",
        )
    return result


@router.post("/{contract_id}/send-supplier-form", response_model=ContractRead)
def send_supplier_form_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    """Envia manualmente el formulario al proveedor tras aprobacion del comparativo."""
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = comparatives_service.send_supplier_form_after_approval(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/submit-comparative", response_model=ContractRead)
def submit_comparative_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = comparatives_service.submit(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/rebuild-comparative", response_model=ContractRead)
def rebuild_comparative_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = comparatives_service.rebuild(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/approve-comparative", response_model=ContractRead)
def approve_comparative_endpoint(
    contract_id: int,
    payload: ApprovalDecision,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = comparatives_service.approve(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
        comment=payload.comment,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/reject-comparative", response_model=ContractRead)
def reject_comparative_endpoint(
    contract_id: int,
    payload: ComparativeRejectRequest,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = comparatives_service.reject(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
        reason=payload.reason,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/return-comparative", response_model=ContractRead)
def return_comparative_endpoint(
    contract_id: int,
    payload: ComparativeReturnRequest,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    """Gerencia devuelve comparativo al creador con comentario (NEEDS_CHANGES)."""
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = comparatives_service.return_comparative(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
        comment=payload.comment,
    )
    return contracts_service.build_read(session, contract)

