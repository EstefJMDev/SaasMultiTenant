import logging
from typing import Optional

from fastapi import Depends, Request, Response
from sqlmodel import Session

from app.core.db import get_db
from app.core.legacy_tracking import mark_legacy_route
from app.models.user import User
from app.platform.tools.deps import require_tool, tenant_scope


logger = logging.getLogger(__name__)

LEGACY_CONTRACTS_SUNSET = "Wed, 31 Dec 2026 23:59:59 GMT"


def mark_legacy_contracts_alias(
    request: Request,
    response: Response,
) -> None:
    logger.warning("Legacy contracts route used: %s", request.url.path)
    tenant_id = request.headers.get("X-Tenant-Id")
    resolved_tenant = int(tenant_id) if tenant_id and tenant_id.isdigit() else None
    mark_legacy_route("contracts_legacy", None, resolved_tenant)
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = LEGACY_CONTRACTS_SUNSET


def require_procurement_access(
    request: Request,
    current_user: User = Depends(require_tool("procurement")),
    session: Session = Depends(get_db),
    scoped_tenant_id: Optional[int] = Depends(tenant_scope(require_header=True)),
) -> User:
    # Autorización granular: los servicios validan Position caps + EmployeeProfile.
    # Aquí solo verificamos que el tenant tiene procurement habilitado y la
    # cabecera X-Tenant-Id está presente (gestionado por require_tool + tenant_scope).
    return current_user
