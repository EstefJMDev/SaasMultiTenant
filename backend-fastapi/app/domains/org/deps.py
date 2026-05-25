import logging

from fastapi import Depends, Request, Response

from app.core.legacy_tracking import mark_legacy_route
from app.models.user import User
from app.platform.tools.deps import require_tool


logger = logging.getLogger(__name__)

LEGACY_HR_SUNSET = "Wed, 31 Dec 2026 23:59:59 GMT"


def mark_legacy_hr_alias(request: Request, response: Response) -> None:
    logger.warning("Legacy HR route used: %s", request.url.path)
    tenant_id = request.headers.get("X-Tenant-Id")
    mark_legacy_route("hr_legacy", None, int(tenant_id) if tenant_id else None)
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = LEGACY_HR_SUNSET


def require_org_tool(
    current_user: User = Depends(require_tool("org")),
) -> User:
    return current_user
