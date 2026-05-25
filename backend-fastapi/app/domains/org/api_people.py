from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlmodel import Session

from app.core.db import get_db
from app.core.tenancy import tenant_required_for_superadmin
from app.domains.org.schemas import EmployeeProfileCreate, EmployeeProfileRead, EmployeeProfileUpdate
from app.domains.org.service import (
    create_employee_profile,
    delete_employee_profile,
    list_employee_profiles,
    list_directores_tecnicos,
    update_employee_profile,
)
from app.models.user import User
from app.platform.tools.deps import require_perm


router = APIRouter()

def _resolve_tenant_id(
    current_user: User,
    x_tenant_id: Optional[int],
    tenant_id: Optional[int],
) -> int:
    return tenant_required_for_superadmin(
        current_user,
        x_tenant_id if x_tenant_id is not None else tenant_id,
    )


@router.get("/directores-tecnicos")
def api_list_directores_tecnicos(
    tenant_id: Optional[int] = Query(default=None, description="Filtrar por tenant (solo Super Admin)."),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:people:read")),
) -> list[dict]:
    """Listado simplificado de empleados activos con puesto Director Técnico (role_code='DT')."""
    try:
        effective_tenant_id = _resolve_tenant_id(current_user, x_tenant_id, tenant_id)
        return list_directores_tecnicos(
            session=session,
            current_user=current_user,
            tenant_id=effective_tenant_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.get("", response_model=list[EmployeeProfileRead])
def api_list_people(
    tenant_id: Optional[int] = Query(default=None, description="Filtrar por tenant (solo Super Admin)."),
    year: Optional[int] = Query(default=None, description="Año para calcular disponibilidad efectiva."),
    limit: int = Query(default=500, ge=1, le=1000, description="Número máximo de empleados a devolver."),
    offset: int = Query(default=0, ge=0, description="Número de registros a saltar (para paginación)."),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:people:read")),
) -> list[EmployeeProfileRead]:
    try:
        effective_tenant_id = _resolve_tenant_id(current_user, x_tenant_id, tenant_id)
        return list_employee_profiles(
            session=session,
            current_user=current_user,
            tenant_id=effective_tenant_id,
            year=year,
            limit=limit,
            offset=offset,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post("", response_model=EmployeeProfileRead, status_code=status.HTTP_201_CREATED)
def api_create_person(
    data: EmployeeProfileCreate,
    tenant_id: Optional[int] = Query(default=None, description="Tenant objetivo (solo Super Admin)."),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:people:write")),
) -> EmployeeProfileRead:
    target_tenant_id = _resolve_tenant_id(current_user, x_tenant_id, tenant_id)
    try:
        return create_employee_profile(
            session=session,
            current_user=current_user,
            tenant_id=target_tenant_id,
            data=data,
        )
    except (PermissionError, ValueError) as exc:
        status_code = (
            status.HTTP_403_FORBIDDEN
            if isinstance(exc, PermissionError)
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@router.patch("/{profile_id}", response_model=EmployeeProfileRead)
def api_update_person(
    profile_id: int,
    data: EmployeeProfileUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:people:write")),
) -> EmployeeProfileRead:
    try:
        return update_employee_profile(
            session=session,
            current_user=current_user,
            profile_id=profile_id,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_person(
    profile_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:people:write")),
) -> None:
    try:
        delete_employee_profile(
            session=session,
            current_user=current_user,
            profile_id=profile_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
