import logging
from typing import Annotated, Optional

from fastapi import Depends, Header, Request, Response

from app.api.deps import get_current_active_user
from app.core.legacy_tracking import mark_legacy_route
from app.models.user import User
from app.core.tenancy import tenant_required_for_superadmin


logger = logging.getLogger(__name__)

LEGACY_WORK_SUNSET = "Wed, 31 Dec 2026 23:59:59 GMT"


def tenant_for_read(
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Annotated[Optional[str], Header(alias="X-Tenant-Id")] = None,
) -> Optional[int]:
    return tenant_required_for_superadmin(current_user, x_tenant_id)


def tenant_for_write(
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Annotated[Optional[str], Header(alias="X-Tenant-Id")] = None,
) -> Optional[int]:
    return tenant_required_for_superadmin(current_user, x_tenant_id)


def mark_legacy_work_alias(request: Request, response: Response) -> None:
    logger.warning("Legacy work route used: %s", request.url.path)
    tenant_id = request.headers.get("X-Tenant-Id")
    resolved_tenant = int(tenant_id) if tenant_id and tenant_id.isdigit() else None
    mark_legacy_route("work_legacy", None, resolved_tenant)
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = LEGACY_WORK_SUNSET
