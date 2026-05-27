from __future__ import annotations

from pathlib import Path
from typing import Any, Optional
from zipfile import BadZipFile

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from openpyxl.utils.exceptions import InvalidFileException
from pydantic import BaseModel
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.domains.procurement.comparatives.excel_import import parse_comparative_excel
from app.domains.procurement.contracts.routers.router_common import tenant_for_write
from app.models.user import User
from app.platform.contracts_core.models import ContractType
from app.storage.local import save_comparative_source_bytes

from .service import ComparativoDetalleRead, ComparativosV2Service
from .ui_flow import (
    build_create_payload_from_ui,
    build_ui_approvals,
    build_ui_comparative_payload,
    build_update_payload_from_ui,
    delete_comparativo_if_allowed,
    resolve_source_file,
    sync_children_from_ui_payload,
    validate_rea_for_comparativo,
)


router = APIRouter()


class ComparativoDecisionBody(BaseModel):
    comentario: Optional[str] = None
    aprobacion_id: Optional[int] = None


class ComparativoRejectBody(BaseModel):
    motivo: str
    comentario: Optional[str] = None
    aprobacion_id: Optional[int] = None


class ComparativoUiDraftBody(BaseModel):
    type: Optional[ContractType] = None
    title: Optional[str] = None
    comparative_data: Optional[dict[str, Any]] = None


def _build_ui_response(session: Session, detalle: ComparativoDetalleRead) -> dict[str, Any]:
    return build_ui_comparative_payload(
        session,
        detalle=detalle.model_dump(),
    )


@router.get("", response_model=list[dict[str, Any]])
def list_comparativos_v2_endpoint(
    limit: int = 100,
    offset: int = 0,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[dict[str, Any]]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    return [
        _build_ui_response(session, detalle)
        for detalle in service.listar_comparativos(
            tenant_id=tenant_id,
            limit=limit,
            offset=offset,
        )
    ]


@router.post("", response_model=dict[str, Any])
def create_comparativo_v2_endpoint(
    body: ComparativoUiDraftBody,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    detalle = service.crear_comparativo(
        tenant_id=tenant_id,
        payload=build_create_payload_from_ui(
            session,
            tenant_id=tenant_id,
            usuario_id=current_user.id,
            contract_type=getattr(body.type, "value", body.type),
            title=body.title,
            comparative_data=body.comparative_data,
        ),
        usuario_id=current_user.id,
    )
    sync_children_from_ui_payload(
        session,
        tenant_id=tenant_id,
        comparativo_id=detalle.comparativo.id,
        comparative_data=body.comparative_data,
    )
    session.commit()
    detalle = service.obtener_comparativo(
        tenant_id=tenant_id,
        comparativo_id=detalle.comparativo.id,
    )
    return _build_ui_response(session, detalle)


@router.post("/import-excel", response_model=dict[str, Any])
async def import_comparativo_excel_v2_endpoint(
    file: UploadFile = File(...),
    type: ContractType = Form(...),
    title: Optional[str] = Form(default=None),
    obra_numero: Optional[str] = Form(default=None),
    obra_nombre: Optional[str] = Form(default=None),
    jefe_obra: Optional[str] = Form(default=None),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
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

    manual_obra_numero = (obra_numero or "").strip()
    manual_obra_nombre = (obra_nombre or "").strip()
    manual_jefe_obra = (jefe_obra or "").strip()
    if isinstance(comparative_data, dict):
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

    source_path = save_comparative_source_bytes(
        content=content,
        tenant_id=tenant_id,
        contract_id=0,
        original_filename=file.filename,
    )
    service = ComparativosV2Service(session)
    detalle = service.crear_comparativo(
        tenant_id=tenant_id,
        payload=build_create_payload_from_ui(
            session,
            tenant_id=tenant_id,
            usuario_id=current_user.id,
            contract_type=getattr(type, "value", type),
            title=title,
            comparative_data=comparative_data,
            source_file_path=str(source_path),
            source_filename=file.filename,
        ),
        usuario_id=current_user.id,
    )
    sync_children_from_ui_payload(
        session,
        tenant_id=tenant_id,
        comparativo_id=detalle.comparativo.id,
        comparative_data=comparative_data,
    )
    # Mover el excel a una ruta que incluya el comparativo real una vez existe.
    final_path = save_comparative_source_bytes(
        content=content,
        tenant_id=tenant_id,
        contract_id=int(detalle.comparativo.id),
        original_filename=file.filename,
    )
    detalle = service.editar_comparativo(
        tenant_id=tenant_id,
        comparativo_id=detalle.comparativo.id,
        payload=build_update_payload_from_ui(
            session,
            usuario_id=current_user.id,
            contract_type=getattr(type, "value", type),
            title=title,
            comparative_data=comparative_data,
            source_file_path=str(final_path),
            source_filename=file.filename,
        ),
        usuario_id=current_user.id,
    )
    sync_children_from_ui_payload(
        session,
        tenant_id=tenant_id,
        comparativo_id=detalle.comparativo.id,
        comparative_data=comparative_data,
    )
    session.commit()
    detalle = service.obtener_comparativo(
        tenant_id=tenant_id,
        comparativo_id=detalle.comparativo.id,
    )
    return _build_ui_response(session, detalle)


@router.get("/{comparativo_id}", response_model=dict[str, Any])
def get_comparativo_v2_endpoint(
    comparativo_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    return _build_ui_response(
        session,
        service.obtener_comparativo(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        ),
    )


@router.patch("/{comparativo_id}", response_model=dict[str, Any])
def update_comparativo_v2_endpoint(
    comparativo_id: int,
    body: ComparativoUiDraftBody,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    detalle = service.editar_comparativo(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        payload=build_update_payload_from_ui(
            session,
            usuario_id=current_user.id,
            contract_type=getattr(body.type, "value", body.type),
            title=body.title,
            comparative_data=body.comparative_data,
        ),
        usuario_id=current_user.id,
    )
    sync_children_from_ui_payload(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        comparative_data=body.comparative_data,
    )
    session.commit()
    detalle = service.obtener_comparativo(
        tenant_id=tenant_id,
        comparativo_id=detalle.comparativo.id,
    )
    return _build_ui_response(session, detalle)


@router.delete("/{comparativo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comparativo_v2_endpoint(
    comparativo_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    delete_comparativo_if_allowed(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )


@router.get("/{comparativo_id}/comparative-offers", response_model=list[dict[str, Any]])
def get_comparative_offers_v2_endpoint(
    comparativo_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[dict[str, Any]]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    detalle = service.obtener_comparativo(tenant_id=tenant_id, comparativo_id=comparativo_id)
    return list((_build_ui_response(session, detalle).get("comparative_data") or {}).get("offers") or [])


@router.post("/{comparativo_id}/sync-comparative-offers", response_model=list[dict[str, Any]])
def sync_comparative_offers_v2_endpoint(
    comparativo_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[dict[str, Any]]:
    return get_comparative_offers_v2_endpoint(
        comparativo_id=comparativo_id,
        x_tenant_id=x_tenant_id,
        session=session,
        current_user=current_user,
    )


@router.post("/{comparativo_id}/validate-rea")
def validate_rea_v2_endpoint(
    comparativo_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    detalle = service.obtener_comparativo(tenant_id=tenant_id, comparativo_id=comparativo_id)
    return validate_rea_for_comparativo(session, comparativo=detalle.comparativo)


@router.get("/{comparativo_id}/comparative-source/download")
def download_comparative_source_v2_endpoint(
    comparativo_id: int,
    inline: bool = Query(default=False),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> FileResponse:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    detalle = service.obtener_comparativo(tenant_id=tenant_id, comparativo_id=comparativo_id)
    path_obj, filename = resolve_source_file(detalle.comparativo)
    return FileResponse(
        path=str(path_obj),
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        content_disposition_type="inline" if inline else "attachment",
    )


@router.post("/{comparativo_id}/comparative-source/replace", response_model=dict[str, Any])
async def replace_comparative_source_v2_endpoint(
    comparativo_id: int,
    file: UploadFile = File(...),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Archivo Excel requerido.")
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

    saved_path = save_comparative_source_bytes(
        content=content,
        tenant_id=tenant_id,
        contract_id=comparativo_id,
        original_filename=file.filename,
    )
    service = ComparativosV2Service(session)
    detalle = service.editar_comparativo(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        payload=build_update_payload_from_ui(
            session,
            usuario_id=current_user.id,
            contract_type=None,
            title=None,
            comparative_data=parsed,
            source_file_path=str(saved_path),
            source_filename=file.filename,
        ),
        usuario_id=current_user.id,
    )
    sync_children_from_ui_payload(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        comparative_data=parsed,
    )
    session.commit()
    detalle = service.obtener_comparativo(tenant_id=tenant_id, comparativo_id=comparativo_id)
    return _build_ui_response(session, detalle)


@router.get("/{comparativo_id}/comparative-approvals", response_model=list[dict[str, Any]])
def get_comparative_approvals_v2_endpoint(
    comparativo_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[dict[str, Any]]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    detalle = service.obtener_comparativo(tenant_id=tenant_id, comparativo_id=comparativo_id)
    return build_ui_approvals(detalle.model_dump())


@router.post("/{comparativo_id}/enviar", response_model=dict[str, Any])
def submit_comparativo_v2_endpoint(
    comparativo_id: int,
    body: ComparativoDecisionBody,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    detalle_pre = service.obtener_comparativo(tenant_id=tenant_id, comparativo_id=comparativo_id)
    validation = validate_rea_for_comparativo(session, comparativo=detalle_pre.comparativo)
    if validation["rea"]["estado"] not in {"ALTA", "SKIPPED_NOT_SUBCONTRATACION"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El proveedor no figura como acreditado en REA. Guarda el comparativo en borrador y revisa los datos.",
        )
    detalle = service.enviar_a_aprobacion(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        usuario_id=current_user.id,
        comentario=body.comentario,
        aprobadores_iniciales=None,
    )
    return _build_ui_response(session, detalle)


@router.post("/{comparativo_id}/aprobar", response_model=dict[str, Any])
def approve_comparativo_v2_endpoint(
    comparativo_id: int,
    body: ComparativoDecisionBody,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    detalle = service.aprobar_comparativo(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        usuario_id=current_user.id,
        comentario=body.comentario,
        aprobacion_id=body.aprobacion_id,
    )
    return _build_ui_response(session, detalle)


@router.post("/{comparativo_id}/devolver", response_model=dict[str, Any])
def return_comparativo_v2_endpoint(
    comparativo_id: int,
    body: ComparativoDecisionBody,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    detalle = service.devolver_a_cambios(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        usuario_id=current_user.id,
        comentario=body.comentario or "",
    )
    return _build_ui_response(session, detalle)


@router.post("/{comparativo_id}/rechazar", response_model=dict[str, Any])
def reject_comparativo_v2_endpoint(
    comparativo_id: int,
    body: ComparativoRejectBody,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    detalle = service.rechazar_comparativo(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        usuario_id=current_user.id,
        motivo=body.motivo,
        comentario=body.comentario,
        aprobacion_id=body.aprobacion_id,
    )
    return _build_ui_response(session, detalle)


@router.post("/{comparativo_id}/generar-contrato")
def generate_contract_from_comparativo_v2_endpoint(
    comparativo_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, int]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ComparativosV2Service(session)
    contrato_id = service.generar_contrato_desde_comparativo(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        usuario_id=current_user.id,
    )
    return {"contrato_id": contrato_id}
