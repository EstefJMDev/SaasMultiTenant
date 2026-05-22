from typing import Annotated, Callable, Optional

from fastapi import Depends, Header, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.core.db import get_db
from app.models.user import User
from app.core.permissions import has_permission
from app.platform.tools.service import resolve_entitlements
from app.core.tenancy import tenant_required_for_superadmin


def resolve_tenant_scope(
    current_user: User,
    x_tenant_id: Optional[str],
    *,
    require_header: bool = False,
) -> Optional[int]:
    if require_header:
        return tenant_required_for_superadmin(current_user, x_tenant_id)

    if current_user.is_super_admin:
        if x_tenant_id is not None:
            return tenant_required_for_superadmin(current_user, x_tenant_id)
        if current_user.tenant_id is not None:
            return current_user.tenant_id
        return None

    return tenant_required_for_superadmin(current_user, x_tenant_id)


def tenant_scope(*, require_header: bool = False) -> Callable[..., Optional[int]]:
    def _dependency(
        current_user: User = Depends(get_current_active_user),
        x_tenant_id: Annotated[Optional[str], Header(alias="X-Tenant-Id")] = None,
    ) -> Optional[int]:
        return resolve_tenant_scope(
            current_user,
            x_tenant_id,
            require_header=require_header,
        )

    return _dependency


def require_tool(*tool_slugs: str) -> Callable[..., User]:
    required = {slug.strip().lower() for slug in tool_slugs if slug and slug.strip()}
    if not required:
        raise ValueError("Debe indicarse al menos un tool_slug")

    def _dependency(
        current_user: User = Depends(get_current_active_user),
        session: Session = Depends(get_db),
        scoped_tenant_id: Optional[int] = Depends(tenant_scope()),
    ) -> User:
        if current_user.is_super_admin and scoped_tenant_id is None:
            return current_user

        entitlements = resolve_entitlements(
            session=session,
            user=current_user,
            tenant_id=scoped_tenant_id,
        )
        enabled = {tool.slug.lower() for tool in entitlements.tools if tool.enabled}
        if required.isdisjoint(enabled):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Herramienta no habilitada para el tenant.",
            )
        return current_user

    return _dependency


def require_perm(permission_code: str) -> Callable[..., User]:
    def _dependency(
        current_user: User = Depends(get_current_active_user),
        session: Session = Depends(get_db),
        scoped_tenant_id: Optional[int] = Depends(tenant_scope()),
    ) -> User:
        if current_user.is_super_admin:
            return current_user

        entitlements = resolve_entitlements(
            session=session,
            user=current_user,
            tenant_id=scoped_tenant_id,
        )
        if not has_permission(entitlements.permissions, permission_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes para realizar esta accion.",
            )
        return current_user

    return _dependency
