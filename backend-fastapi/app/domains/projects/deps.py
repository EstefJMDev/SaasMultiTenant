import logging
from typing import Annotated, Optional

from fastapi import Depends, Header, Request, Response
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.core.db import get_db
from app.domains.projects.service import resolve_projects_permission
from app.core.legacy_tracking import mark_legacy_route
from app.models.user import User
from app.platform.tools.deps import require_perm, require_tool, resolve_tenant_scope


logger = logging.getLogger(__name__)

LEGACY_PROJECTS_SUNSET = "Wed, 31 Dec 2026 23:59:59 GMT"


def tenant_for_read(
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Annotated[Optional[str], Header(alias="X-Tenant-Id")] = None,
) -> Optional[int]:
    return resolve_tenant_scope(current_user, x_tenant_id, require_header=True)


def tenant_for_write(
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Annotated[Optional[str], Header(alias="X-Tenant-Id")] = None,
) -> Optional[int]:
    return resolve_tenant_scope(current_user, x_tenant_id, require_header=True)


def mark_legacy_projects_alias(request: Request, response: Response) -> None:
    logger.warning("Legacy projects route used: %s", request.url.path)
    tenant_id = request.headers.get("X-Tenant-Id")
    resolved_tenant = int(tenant_id) if tenant_id and tenant_id.isdigit() else None
    mark_legacy_route("projects_legacy", None, resolved_tenant)
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = LEGACY_PROJECTS_SUNSET


def require_projects_access(
    request: Request,
    current_user: User = Depends(require_tool("projects")),
    session: Session = Depends(get_db),
    scoped_tenant_id: Optional[int] = Depends(tenant_for_read),
) -> User:
    permission = resolve_projects_permission(request.method)
    checker = require_perm(permission)
    return checker(
        current_user=current_user,
        session=session,
        scoped_tenant_id=scoped_tenant_id,
    )
