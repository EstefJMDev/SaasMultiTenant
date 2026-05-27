from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Header
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.domains.procurement.contracts.routers.router_common import tenant_for_write
from app.models.user import User

from .schemas import (
    ContratoDatosProveedorV2Read,
    ContratoHitoV2Read,
    ContratoOfertaAdjudicadaDetalleRead,
    ContratoV2DetalleRead,
    ContratoV2Update,
)
from .service import ContratosV2Service


router = APIRouter()


@router.get("/by-comparativo/{comparativo_id}", response_model=ContratoV2DetalleRead)
def get_contrato_by_comparativo_endpoint(
    comparativo_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContratoV2DetalleRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ContratosV2Service(session)
    return service.obtener_contrato_por_comparativo(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )


@router.get("/{contrato_id}", response_model=ContratoV2DetalleRead)
def get_contrato_v2_endpoint(
    contrato_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContratoV2DetalleRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ContratosV2Service(session)
    return service.obtener_contrato(
        tenant_id=tenant_id,
        contrato_id=contrato_id,
    )


@router.get(
    "/{contrato_id}/datos-proveedor",
    response_model=Optional[ContratoDatosProveedorV2Read],
)
def get_contrato_datos_proveedor_endpoint(
    contrato_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Optional[ContratoDatosProveedorV2Read]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ContratosV2Service(session)
    return service.obtener_datos_proveedor(
        tenant_id=tenant_id,
        contrato_id=contrato_id,
    )


@router.get("/{contrato_id}/hitos", response_model=list[ContratoHitoV2Read])
def get_contrato_hitos_endpoint(
    contrato_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ContratoHitoV2Read]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ContratosV2Service(session)
    return service.obtener_hitos(
        tenant_id=tenant_id,
        contrato_id=contrato_id,
    )


@router.get(
    "/{contrato_id}/oferta-adjudicada",
    response_model=ContratoOfertaAdjudicadaDetalleRead,
)
def get_contrato_oferta_adjudicada_endpoint(
    contrato_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContratoOfertaAdjudicadaDetalleRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ContratosV2Service(session)
    return service.obtener_oferta_adjudicada(
        tenant_id=tenant_id,
        contrato_id=contrato_id,
    )


@router.patch("/{contrato_id}", response_model=ContratoV2DetalleRead)
def patch_contrato_v2_endpoint(
    contrato_id: int,
    payload: ContratoV2Update,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContratoV2DetalleRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ContratosV2Service(session)
    return service.actualizar_contrato(
        tenant_id=tenant_id,
        contrato_id=contrato_id,
        payload=payload,
    )


@router.get("/{contrato_id}/template-context", response_model=dict[str, Any])
def get_contrato_template_context_endpoint(
    contrato_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, Any]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service = ContratosV2Service(session)
    return service.obtener_template_context_v2(
        tenant_id=tenant_id,
        contrato_id=contrato_id,
    )

