from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.deps import require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.tenant import TenantCreate, TenantRead, TenantUpdate
from app.services.tenant_service import (
    create_tenant as svc_create_tenant,
    list_tenants as svc_list_tenants,
    delete_tenant as svc_delete_tenant,
    update_tenant as svc_update_tenant,
)


router = APIRouter()


@router.get("/", response_model=List[TenantRead], summary="Listar tenants")
def list_tenants(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["tenants:read"])),
) -> list[TenantRead]:
    """
    Lista todos los tenants (solo usuarios con permiso `tenants:read`).
    """

    return svc_list_tenants(session=session, current_user=current_user)


@router.post(
    "/",
    response_model=TenantRead,
    status_code=status.HTTP_201_CREATED,
)
def create_tenant(
    tenant_in: TenantCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["tenants:create"])),
) -> TenantRead:
    """
    Crea un nuevo tenant.
    """

    try:
        return svc_create_tenant(
            session=session,
            current_user=current_user,
            tenant_in=tenant_in,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{tenant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Desactivar tenant",
)
def delete_tenant_endpoint(
    tenant_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["tenants:delete"])),
) -> None:
    """
    Desactiva un tenant y deja a sus usuarios inactivos.
    """

    try:
        return svc_delete_tenant(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.put(
    "/{tenant_id}",
    response_model=TenantRead,
    summary="Editar tenant",
)
def update_tenant_endpoint(
    tenant_id: int,
    tenant_in: TenantUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["tenants:update"])),
) -> TenantRead:
    """
    Edita un tenant existente (solo Super Admin).
    """

    try:
        return svc_update_tenant(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
            tenant_in=tenant_in,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
