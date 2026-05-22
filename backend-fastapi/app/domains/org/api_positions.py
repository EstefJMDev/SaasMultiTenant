from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlmodel import Session

from app.core.db import get_db
from app.core.tenancy import tenant_required_for_superadmin
from app.domains.org.schemas import PositionCreate, PositionRead, PositionUpdate
from app.domains.org.service_positions import (
    create_position,
    delete_position,
    list_positions,
    update_position,
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


@router.get("/positions", response_model=list[PositionRead])
def api_list_positions(
    include_inactive: bool = Query(default=False),
    tenant_id: Optional[int] = Query(default=None, description="Filtrar por tenant (solo Super Admin)."),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:positions:read")),
) -> list[PositionRead]:
    try:
        effective_tenant_id = _resolve_tenant_id(current_user, x_tenant_id, tenant_id)
        return list_positions(
            session=session,
            current_user=current_user,
            tenant_id=effective_tenant_id,
            include_inactive=include_inactive,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.post("/positions", response_model=PositionRead, status_code=status.HTTP_201_CREATED)
def api_create_position(
    data: PositionCreate,
    tenant_id: Optional[int] = Query(default=None, description="Tenant objetivo (solo Super Admin)."),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:positions:write")),
) -> PositionRead:
    target_tenant_id = _resolve_tenant_id(current_user, x_tenant_id, tenant_id)
    try:
        return create_position(
            session=session,
            current_user=current_user,
            tenant_id=target_tenant_id,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/positions/{position_id}", response_model=PositionRead)
def api_update_position(
    position_id: int,
    data: PositionUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:positions:write")),
) -> PositionRead:
    try:
        return update_position(
            session=session,
            current_user=current_user,
            position_id=position_id,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete("/positions/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_position(
    position_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:positions:write")),
) -> None:
    try:
        delete_position(
            session=session,
            current_user=current_user,
            position_id=position_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
