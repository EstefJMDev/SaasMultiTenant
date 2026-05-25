from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_active_user, require_permissions
from app.platform.tools import router as legacy_tools
from app.core.db import get_db
from app.models.user import User
from app.platform.tools.deps import resolve_tenant_scope
from app.platform.tools.schemas import MeEntitlementsRead
from app.platform.tools.service import resolve_entitlements
from app.schemas.tool import ToolEnableUpdate, ToolRead
from app.services.tool_service import get_tools_by_tenant, set_tool_enabled_for_tenant


router = APIRouter()
router.include_router(legacy_tools.router, prefix="/tools", tags=["tools"])


@router.get("/me/entitlements", response_model=MeEntitlementsRead, tags=["tools"])
def get_me_entitlements(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
) -> MeEntitlementsRead:
    tenant_id = resolve_tenant_scope(current_user, x_tenant_id)
    return resolve_entitlements(session=session, user=current_user, tenant_id=tenant_id)


@router.get(
    "/tenants/{tenant_id}/tools",
    response_model=list[ToolRead],
    tags=["tools"],
)
def list_tools_by_tenant_id(
    tenant_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(["tools:read"])),
) -> list[ToolRead]:
    try:
        return get_tools_by_tenant(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.put(
    "/tenants/{tenant_id}/tools/{tool_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["tools"],
)
def set_tenant_tool_state(
    tenant_id: int,
    tool_id: int,
    payload: ToolEnableUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(["tools:configure"])),
) -> None:
    try:
        set_tool_enabled_for_tenant(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
            tool_id=tool_id,
            is_enabled=payload.is_enabled,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
