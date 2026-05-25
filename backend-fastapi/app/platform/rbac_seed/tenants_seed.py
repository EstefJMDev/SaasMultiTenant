from __future__ import annotations

from sqlmodel import Session, select

from app.models.tenant import Tenant


def ensure_default_tenant(session: Session) -> Tenant:
    tenant = session.exec(
        select(Tenant).where(Tenant.subdomain == "urdecon.es")
    ).one_or_none()
    if tenant:
        return tenant

    tenant = session.exec(
        select(Tenant).where(Tenant.name == "URDECON")
    ).one_or_none()
    if tenant:
        if tenant.subdomain != "urdecon.es":
            tenant.subdomain = "urdecon.es"
            session.add(tenant)
            session.commit()
            session.refresh(tenant)
        return tenant

    tenant = Tenant(
        name="URDECON",
        subdomain="urdecon.es",
        is_active=True,
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)
    return tenant
