from __future__ import annotations

from sqlmodel import Session, select

from app.models.tenant import Tenant


def ensure_default_tenant(session: Session) -> Tenant:
    tenant = Tenant(
        name="URDECON",
        subdomain="urdecon.es",
        is_active=True,
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant
