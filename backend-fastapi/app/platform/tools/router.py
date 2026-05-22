from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlmodel import Session

from app.api.deps import get_current_tenant, require_permissions
from app.db.session import get_session
from app.models.user import User
from app.models.tenant import Tenant
from sqlalchemy import select
from app.schemas.tool import ToolLaunchResponse, ToolRead, ToolEnableUpdate
from app.services.tool_service import (
    get_tool_catalog,
    get_tools_by_tenant,
    launch_tool_for_tenant,
    set_tool_enabled_for_tenant,
)


router = APIRouter()


@router.get(
    "/catalog",
    response_model=List[ToolRead],
    summary="Catálogo global de herramientas",
)
def list_tool_catalog(
    session: Session = Depends(get_session),
    _: User = Depends(require_permissions(["tools:read"])),
) -> list[ToolRead]:
    """
    Devuelve el catálogo global de herramientas disponibles.
    """

    return get_tool_catalog(session=session)


@router.get(
    "/by-tenant",
    response_model=List[ToolRead],
    summary="Herramientas asignadas al tenant actual",
)
def list_tools_by_tenant(
    request: Request,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["tools:read"])),
    tenant_id: Optional[int] = Query(None),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> list[ToolRead]:
    """
    Lista las herramientas activas para el tenant actual.
    """

    resolved_tenant = None
    if current_user.is_super_admin:
        resolved_id = tenant_id or x_tenant_id
        if resolved_id is None:
            statement = select(Tenant).where(Tenant.is_active.is_(True)).limit(1)
            resolved = session.exec(statement).one_or_none()
            if not resolved:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No hay tenants activos configurados",
                )
            resolved_id = resolved.id
        resolved_tenant = session.get(Tenant, resolved_id)
        if not resolved_tenant or not resolved_tenant.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant no encontrado o inactivo",
            )
    else:
        resolved_tenant = get_current_tenant(
            request,
            x_tenant_id=x_tenant_id,
            session=session,
        )

    try:
        return get_tools_by_tenant(
            session=session,
            current_user=current_user,
            tenant_id=resolved_tenant.id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.post(
    "/{tool_id}/launch",
    response_model=ToolLaunchResponse,
    summary="Generar URL de lanzamiento SSO para una herramienta (ej. Moodle)",
)
def launch_tool(
    tool_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["tools:launch"])),
    tenant=Depends(get_current_tenant),
) -> ToolLaunchResponse:
    """
    Genera una URL de lanzamiento firmada para una herramienta externa.
    """

    try:
        return launch_tool_for_tenant(
            session=session,
            current_user=current_user,
            tenant_id=tenant.id,
            tool_id=tool_id,
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
    "/{tool_id}/by-tenant/{tenant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Habilitar o deshabilitar una herramienta para un tenant",
)
def update_tool_for_tenant(
    tool_id: int,
    tenant_id: int,
    payload: ToolEnableUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["tools:configure"])),
) -> None:
    """
    Permite a un Super Admin o a un admin de tenant
    habilitar o deshabilitar una herramienta concreta para un tenant.
    """

    try:
        return set_tool_enabled_for_tenant(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
            tool_id=tool_id,
            is_enabled=payload.is_enabled,
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
