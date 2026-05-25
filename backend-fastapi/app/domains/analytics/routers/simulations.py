from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.user import User
from app.core.tenancy import tenant_required_for_superadmin
from app.schemas.simulations import (
    SimulationExpenseCreate,
    SimulationExpenseRead,
    SimulationExpenseUpdate,
    SimulationProjectCreate,
    SimulationProjectRead,
    SimulationProjectUpdate,
)
from app.services.simulations_service import (
    create_simulation_expense,
    create_simulation_project,
    delete_simulation_expense,
    delete_simulation_project,
    list_simulation_projects,
    update_simulation_expense,
    update_simulation_project,
)


router = APIRouter()


def _tenant_for_read(current_user: User, x_tenant_id: Optional[str]) -> Optional[int]:
    return tenant_required_for_superadmin(current_user, x_tenant_id)


def _tenant_for_write(current_user: User, x_tenant_id: Optional[str]) -> int:
    return tenant_required_for_superadmin(current_user, x_tenant_id)


@router.get("/simulations", response_model=list[SimulationProjectRead])
def api_list_simulations(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> list[SimulationProjectRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return list_simulation_projects(session, tenant_id)


@router.post(
    "/simulations",
    response_model=SimulationProjectRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_simulation_project(
    payload: SimulationProjectCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> SimulationProjectRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    try:
        return create_simulation_project(session, tenant_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/simulations/{project_id}", response_model=SimulationProjectRead)
def api_update_simulation_project(
    project_id: int,
    payload: SimulationProjectUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> SimulationProjectRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    try:
        return update_simulation_project(session, tenant_id, project_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/simulations/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_simulation_project(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    try:
        delete_simulation_project(session, tenant_id, project_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/simulations/{project_id}/expenses",
    response_model=SimulationExpenseRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_simulation_expense(
    project_id: int,
    payload: SimulationExpenseCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> SimulationExpenseRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    try:
        return create_simulation_expense(session, tenant_id, project_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch(
    "/simulations/{project_id}/expenses/{expense_id}",
    response_model=SimulationExpenseRead,
)
def api_update_simulation_expense(
    project_id: int,
    expense_id: int,
    payload: SimulationExpenseUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> SimulationExpenseRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    try:
        return update_simulation_expense(
            session, tenant_id, project_id, expense_id, payload
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete(
    "/simulations/{project_id}/expenses/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def api_delete_simulation_expense(
    project_id: int,
    expense_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    tenant_id = _tenant_for_write(current_user, x_tenant_id)
    try:
        delete_simulation_expense(session, tenant_id, project_id, expense_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
