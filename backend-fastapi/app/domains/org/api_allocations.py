from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlmodel import Session

from app.core.db import get_db
from app.core.tenancy import tenant_required_for_superadmin
from app.domains.org.schemas import (
    EmployeeAllocationCreate,
    EmployeeAllocationRead,
    EmployeeAllocationUpdate,
)
from app.domains.org.service import (
    create_employee_allocation,
    delete_employee_allocation,
    list_employee_allocations,
    update_employee_allocation,
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


@router.get("", response_model=list[EmployeeAllocationRead])
def api_list_allocations(
    tenant_id: Optional[int] = Query(default=None, description="Filtrar por tenant (solo Super Admin)."),
    project_id: Optional[int] = Query(default=None, description="Filtrar por proyecto"),
    employee_id: Optional[int] = Query(default=None, description="Filtrar por empleado"),
    year: Optional[int] = Query(default=None, description="Año de las asignaciones"),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:allocations:read")),
) -> list[EmployeeAllocationRead]:
    try:
        effective_tenant_id = _resolve_tenant_id(current_user, x_tenant_id, tenant_id)
        return list_employee_allocations(
            session=session,
            current_user=current_user,
            tenant_id=effective_tenant_id,
            project_id=project_id,
            employee_id=employee_id,
            year=year,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post("", response_model=EmployeeAllocationRead, status_code=status.HTTP_201_CREATED)
def api_create_allocation(
    data: EmployeeAllocationCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:allocations:write")),
) -> EmployeeAllocationRead:
    try:
        return create_employee_allocation(
            session=session,
            current_user=current_user,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/{allocation_id}", response_model=EmployeeAllocationRead)
def api_update_allocation(
    allocation_id: int,
    data: EmployeeAllocationUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:allocations:write")),
) -> EmployeeAllocationRead:
    try:
        return update_employee_allocation(
            session=session,
            current_user=current_user,
            allocation_id=allocation_id,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        detail = str(exc)
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "no encontrada" in detail.lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc


@router.delete("/{allocation_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_allocation(
    allocation_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:allocations:write")),
) -> None:
    try:
        delete_employee_allocation(
            session=session,
            current_user=current_user,
            allocation_id=allocation_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        detail = str(exc)
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "no encontrada" in detail.lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
