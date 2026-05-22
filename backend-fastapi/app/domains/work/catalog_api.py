from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_, text
from sqlmodel import Session, select

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.user import User
from app.models.work_catalog import WorkSite
from app.services.user_service import resolve_user_domain_caps


router = APIRouter(prefix="/work/catalog", tags=["work-catalog"])


class WorkSiteRead(BaseModel):
    id: int
    tenant_id: int
    code: str
    name: str
    client_name: str
    created_at: datetime
    updated_at: datetime


class WorkSiteWrite(BaseModel):
    code: str
    name: str
    client_name: str


class ProviderRead(BaseModel):
    id: str
    cif: str
    razon_social: str
    empresa: Optional[str] = None
    nombre_gerente: Optional[str] = None
    nif_gerente: Optional[str] = None
    direccion_empresa: Optional[str] = None
    tipo_escritura: Optional[str] = None
    fecha_escritura: Optional[str] = None
    nombre_notario: Optional[str] = None
    numero_protocolo: Optional[str] = None


class ProviderWrite(BaseModel):
    cif: str
    razon_social: str
    empresa: Optional[str] = None
    nombre_gerente: Optional[str] = None
    nif_gerente: Optional[str] = None
    direccion_empresa: Optional[str] = None
    tipo_escritura: Optional[str] = None
    fecha_escritura: Optional[str] = None
    nombre_notario: Optional[str] = None
    numero_protocolo: Optional[str] = None


class ProviderListResponse(BaseModel):
    items: list[ProviderRead]
    total: int


def _tenant_id_or_403(user: User) -> int:
    if user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario sin tenant asociado.",
        )
    return int(user.tenant_id)


def _require_catalog_read(session: Session, user: User, *, resource: str) -> None:
    if user.is_super_admin:
        return
    caps = resolve_user_domain_caps(session, user)
    cap_name = "can_view_worksite" if resource == "worksite" else "can_view_provider"
    if bool(caps.get(cap_name)):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Sin permisos para consultar este catálogo.",
    )


def _require_catalog_write(session: Session, user: User, *, resource: str) -> None:
    if user.is_super_admin:
        return
    caps = resolve_user_domain_caps(session, user)
    cap_name = "can_edit_worksite" if resource == "worksite" else "can_edit_provider"
    if bool(caps.get(cap_name)):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Sin permisos para modificar este catálogo.",
    )


def _norm_code(value: str) -> str:
    return "".join(ch for ch in str(value).strip() if ch.isdigit())[:4]


def _validate_worksite_code(value: str) -> str:
    normalized = _norm_code(value)
    if not normalized:
        raise HTTPException(status_code=400, detail="El número de obra es obligatorio.")
    return normalized


def _norm_text(value: Optional[str]) -> str:
    return str(value or "").strip()


@router.get("/worksites", response_model=list[WorkSiteRead])
def list_worksites(
    search: str = Query(default=""),
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[WorkSiteRead]:
    _require_catalog_read(session, current_user, resource="worksite")
    tenant_id = _tenant_id_or_403(current_user)
    stmt = select(WorkSite).where(WorkSite.tenant_id == tenant_id)
    q = _norm_text(search)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                WorkSite.code.ilike(like),
                WorkSite.name.ilike(like),
                WorkSite.client_name.ilike(like),
            )
        )
    stmt = stmt.order_by(WorkSite.code.asc(), WorkSite.id.asc()).limit(limit)
    return list(session.exec(stmt).all())


@router.get("/worksites/by-code/{code}", response_model=Optional[WorkSiteRead])
def get_worksite_by_code(
    code: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> Optional[WorkSiteRead]:
    _require_catalog_read(session, current_user, resource="worksite")
    tenant_id = _tenant_id_or_403(current_user)
    normalized = _norm_code(code)
    if not normalized:
        return None
    stmt = select(WorkSite).where(
        WorkSite.tenant_id == tenant_id,
        WorkSite.code == normalized,
    )
    return session.exec(stmt).one_or_none()


@router.post("/worksites", response_model=WorkSiteRead, status_code=status.HTTP_201_CREATED)
def create_worksite(
    payload: WorkSiteWrite,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> WorkSiteRead:
    _require_catalog_write(session, current_user, resource="worksite")
    tenant_id = _tenant_id_or_403(current_user)
    code = _validate_worksite_code(payload.code)
    name = _norm_text(payload.name)
    client_name = _norm_text(payload.client_name)
    if not name or not client_name:
        raise HTTPException(status_code=400, detail="Nombre de obra y cliente son obligatorios.")
    existing = session.exec(
        select(WorkSite).where(
            WorkSite.tenant_id == tenant_id,
            WorkSite.code == code,
        )
    ).one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe una obra con ese número.")
    row = WorkSite(
        tenant_id=tenant_id,
        code=code,
        name=name,
        client_name=client_name,
        created_by_id=current_user.id,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.patch("/worksites/{worksite_id}", response_model=WorkSiteRead)
def update_worksite(
    worksite_id: int,
    payload: WorkSiteWrite,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> WorkSiteRead:
    _require_catalog_write(session, current_user, resource="worksite")
    tenant_id = _tenant_id_or_403(current_user)
    row = session.get(WorkSite, worksite_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Obra no encontrada.")
    code = _validate_worksite_code(payload.code)
    duplicated = session.exec(
        select(WorkSite).where(
            WorkSite.tenant_id == tenant_id,
            WorkSite.code == code,
            WorkSite.id != worksite_id,
        )
    ).one_or_none()
    if duplicated:
        raise HTTPException(status_code=400, detail="Ya existe una obra con ese número.")
    row.code = code
    row.name = _norm_text(payload.name)
    row.client_name = _norm_text(payload.client_name)
    row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@router.delete("/worksites/{worksite_id}", status_code=status.HTTP_200_OK)
def delete_worksite(
    worksite_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    _require_catalog_write(session, current_user, resource="worksite")
    tenant_id = _tenant_id_or_403(current_user)
    row = session.get(WorkSite, worksite_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Obra no encontrada.")
    session.delete(row)
    session.commit()


@router.get("/providers", response_model=ProviderListResponse)
def list_providers(
    search: str = Query(default=""),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProviderListResponse:
    _require_catalog_read(session, current_user, resource="provider")
    q = _norm_text(search)
    where_sql = ""
    params: dict[str, object] = {"offset": offset, "limit": limit}
    if q:
        where_sql = """
        WHERE UPPER(COALESCE(cif, '')) LIKE UPPER(:needle)
           OR UPPER(COALESCE(razon_social, '')) LIKE UPPER(:needle)
           OR UPPER(COALESCE(empresa, '')) LIKE UPPER(:needle)
           OR UPPER(COALESCE(nombre_gerente, '')) LIKE UPPER(:needle)
        """
        params["needle"] = f"%{q}%"
    count_stmt = text(f"SELECT COUNT(*) FROM proveedores {where_sql}")
    list_stmt = text(
        f"""
        SELECT
            regexp_replace(UPPER(COALESCE(cif, '')), '[^A-Z0-9]', '', 'g') AS id,
            cif,
            razon_social,
            empresa,
            nombre_gerente,
            nif_gerente,
            direccion_empresa,
            tipo_escritura,
            fecha_escritura::text AS fecha_escritura,
            nombre_notario,
            numero_protocolo
        FROM proveedores
        {where_sql}
        ORDER BY razon_social ASC, cif ASC
        OFFSET :offset
        LIMIT :limit
        """
    )
    with session.begin_nested():
        total_row = session.exec(count_stmt, params=params).one()
        if hasattr(total_row, "_mapping"):
            total = int(next(iter(total_row._mapping.values()), 0))
        elif isinstance(total_row, (tuple, list)):
            total = int(total_row[0] if total_row else 0)
        else:
            total = int(total_row)
        rows = session.exec(list_stmt, params=params).all()
    items = [ProviderRead(**dict(row._mapping)) for row in rows]
    return ProviderListResponse(items=items, total=total)


@router.post("/providers", response_model=ProviderRead, status_code=status.HTTP_201_CREATED)
def create_provider(
    payload: ProviderWrite,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProviderRead:
    _require_catalog_write(session, current_user, resource="provider")
    cif = _norm_text(payload.cif).upper()
    if not cif:
        raise HTTPException(status_code=400, detail="El CIF es obligatorio.")
    razon_social = _norm_text(payload.razon_social)
    if not razon_social:
        raise HTTPException(status_code=400, detail="La razón social es obligatoria.")
    stmt = text(
        """
        INSERT INTO proveedores (
            cif, razon_social, empresa, nombre_gerente, nif_gerente,
            direccion_empresa, tipo_escritura, fecha_escritura,
            nombre_notario, numero_protocolo
        ) VALUES (
            :cif, :razon_social, :empresa, :nombre_gerente, :nif_gerente,
            :direccion_empresa, :tipo_escritura, CAST(NULLIF(:fecha_escritura, '') AS DATE),
            :nombre_notario, :numero_protocolo
        )
        """
    )
    params = payload.model_dump()
    params["cif"] = cif
    params["razon_social"] = razon_social
    session.exec(stmt, params=params)
    session.commit()
    return ProviderRead(
        id=cif,
        cif=cif,
        razon_social=razon_social,
        empresa=payload.empresa,
        nombre_gerente=payload.nombre_gerente,
        nif_gerente=payload.nif_gerente,
        direccion_empresa=payload.direccion_empresa,
        tipo_escritura=payload.tipo_escritura,
        fecha_escritura=payload.fecha_escritura,
        nombre_notario=payload.nombre_notario,
        numero_protocolo=payload.numero_protocolo,
    )


@router.patch("/providers/{provider_id}", response_model=ProviderRead)
def update_provider(
    provider_id: str,
    payload: ProviderWrite,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ProviderRead:
    _require_catalog_write(session, current_user, resource="provider")
    cif = _norm_text(payload.cif).upper()
    if not cif:
        raise HTTPException(status_code=400, detail="El CIF es obligatorio.")
    stmt = text(
        """
        UPDATE proveedores
        SET
            cif = :new_cif,
            razon_social = :razon_social,
            empresa = :empresa,
            nombre_gerente = :nombre_gerente,
            nif_gerente = :nif_gerente,
            direccion_empresa = :direccion_empresa,
            tipo_escritura = :tipo_escritura,
            fecha_escritura = CAST(NULLIF(:fecha_escritura, '') AS DATE),
            nombre_notario = :nombre_notario,
            numero_protocolo = :numero_protocolo
        WHERE regexp_replace(UPPER(COALESCE(cif, '')), '[^A-Z0-9]', '', 'g') = :provider_id
        """
    )
    params = payload.model_dump()
    params["provider_id"] = _norm_text(provider_id).upper()
    params["new_cif"] = cif
    result = session.exec(stmt, params=params)
    if result.rowcount == 0:
        session.rollback()
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    session.commit()
    return ProviderRead(
        id=cif,
        cif=cif,
        razon_social=_norm_text(payload.razon_social),
        empresa=payload.empresa,
        nombre_gerente=payload.nombre_gerente,
        nif_gerente=payload.nif_gerente,
        direccion_empresa=payload.direccion_empresa,
        tipo_escritura=payload.tipo_escritura,
        fecha_escritura=payload.fecha_escritura,
        nombre_notario=payload.nombre_notario,
        numero_protocolo=payload.numero_protocolo,
    )


@router.delete("/providers/{provider_id}", status_code=status.HTTP_200_OK)
def delete_provider(
    provider_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    _require_catalog_write(session, current_user, resource="provider")
    stmt = text(
        """
        DELETE FROM proveedores
        WHERE regexp_replace(UPPER(COALESCE(cif, '')), '[^A-Z0-9]', '', 'g') = :provider_id
        """
    )
    result = session.exec(
        stmt, params={"provider_id": _norm_text(provider_id).upper()}
    )
    if result.rowcount == 0:
        session.rollback()
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    session.commit()


def get_worksite_by_code_for_tenant(
    session: Session,
    *,
    tenant_id: int,
    code: Optional[str],
) -> Optional[WorkSite]:
    normalized = _norm_code(code or "")
    if not normalized:
        return None
    return session.exec(
        select(WorkSite).where(
            WorkSite.tenant_id == tenant_id,
            WorkSite.code == normalized,
        )
    ).one_or_none()
