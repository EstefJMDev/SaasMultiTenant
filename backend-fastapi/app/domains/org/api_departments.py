from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlmodel import Session

from app.core.db import get_db
from app.core.tenancy import tenant_required_for_superadmin
from app.domains.org.service import (
    create_department,
    delete_department,
    list_departments,
    update_department,
    get_headcount_by_department,
)
from app.domains.org.schemas import DepartmentCreate, DepartmentRead, DepartmentUpdate, HeadcountItem
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


@router.get("/departments", response_model=list[DepartmentRead])
def api_list_departments(
    tenant_id: Optional[int] = Query(default=None, description="Filtrar por tenant (solo Super Admin)."),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:departments:read")),
) -> list[DepartmentRead]:
    try:
        effective_tenant_id = _resolve_tenant_id(current_user, x_tenant_id, tenant_id)
        return list_departments(
            session=session,
            current_user=current_user,
            tenant_id=effective_tenant_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post("/departments", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED)
def api_create_department(
    data: DepartmentCreate,
    tenant_id: Optional[int] = Query(default=None, description="Tenant objetivo (solo Super Admin)."),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:departments:write")),
) -> DepartmentRead:
    target_tenant_id = _resolve_tenant_id(current_user, x_tenant_id, tenant_id)
    try:
        return create_department(
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


@router.patch("/departments/{dept_id}", response_model=DepartmentRead)
def api_update_department(
    dept_id: int,
    data: DepartmentUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:departments:write")),
) -> DepartmentRead:
    try:
        return update_department(
            session=session,
            current_user=current_user,
            dept_id=dept_id,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/departments/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_department(
    dept_id: int,
    cascade: bool = Query(default=True, description="Eliminar limpiando referencias relacionadas."),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:departments:write")),
) -> None:
    try:
        delete_department(
            session=session,
            current_user=current_user,
            dept_id=dept_id,
            cascade=cascade,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/reports/headcount", response_model=list[HeadcountItem])
def api_headcount_report(
    tenant_id: Optional[int] = Query(default=None, description="Filtrar por tenant (solo Super Admin)."),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:reports:read")),
) -> list[HeadcountItem]:
    try:
        effective_tenant_id = _resolve_tenant_id(current_user, x_tenant_id, tenant_id)
        return get_headcount_by_department(
            session=session,
            current_user=current_user,
            tenant_id=effective_tenant_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
