from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.models.user import User
from app.core.tenancy import tenant_required_for_superadmin
from app.schemas.erp import (
    ExternalCollaborationCreate,
    ExternalCollaborationRead,
    ExternalCollaborationUpdate,
)
from app.services.external_collaboration_service import (
    create_external_collaboration,
    delete_external_collaboration,
    list_external_collaborations,
    update_external_collaboration,
)


router = APIRouter()


def _tenant_for_read(current_user: User, x_tenant_id: Optional[str]) -> Optional[int]:
    return tenant_required_for_superadmin(current_user, x_tenant_id)


def _tenant_for_write(current_user: User, x_tenant_id: Optional[str]) -> int:
    return tenant_required_for_superadmin(current_user, x_tenant_id)


@router.get("/external-collaborations", response_model=list[ExternalCollaborationRead])
def api_list_external_collaborations(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> list[ExternalCollaborationRead]:
    tenant_id = _tenant_for_read(current_user, x_tenant_id)
    return list_external_collaborations(session, tenant_id)


@router.post(
    "/external-collaborations",
    response_model=ExternalCollaborationRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_external_collaboration(
    payload: ExternalCollaborationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> ExternalCollaborationRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return create_external_collaboration(session, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch(
    "/external-collaborations/{collaboration_id}",
    response_model=ExternalCollaborationRead,
)
def api_update_external_collaboration(
    collaboration_id: int,
    payload: ExternalCollaborationUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> ExternalCollaborationRead:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        return update_external_collaboration(session, collaboration_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.delete(
    "/external-collaborations/{collaboration_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def api_delete_external_collaboration(
    collaboration_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[str] = Header(default=None, alias="X-Tenant-Id"),
) -> None:
    try:
        tenant_id = _tenant_for_write(current_user, x_tenant_id)
        delete_external_collaboration(session, collaboration_id, tenant_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
