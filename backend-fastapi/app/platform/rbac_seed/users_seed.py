from __future__ import annotations

from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.user import User


def assign_tenant_admin_to_first_users(session: Session, roles: dict) -> None:
    tenant_admin_role = roles.get("tenant_admin")
    if not tenant_admin_role:
        return

    tenants = session.exec(select(Tenant)).all()

    for tenant in tenants:
        users = session.exec(
            select(User)
            .where(
                User.tenant_id == tenant.id,
                User.is_super_admin.is_(False),
                User.role_id.is_(None),
            )
            .order_by(User.created_at),
        ).all()

        if not users:
            continue

        first_user = users[0]
        first_user.role_id = tenant_admin_role.id
        session.add(first_user)

    session.commit()


def ensure_super_admin_user(session: Session, roles: dict) -> None:
    if settings.env == "production":
        return
    if not settings.allow_bootstrap_superadmin:
        return

    superadmin_role = roles.get("super_admin")

    existing = session.exec(
        select(User).where(User.email == settings.superadmin_email),
    ).one_or_none()

    if existing:
        changed = False
        if not existing.is_super_admin:
            existing.is_super_admin = True
            changed = True
        if superadmin_role and existing.role_id != superadmin_role.id:
            existing.role_id = superadmin_role.id
            changed = True
        if changed:
            session.add(existing)
            session.commit()
        return

    hashed_password = hash_password(settings.superadmin_password)

    user = User(
        email=settings.superadmin_email,
        full_name="Super Admin",
        hashed_password=hashed_password,
        is_active=True,
        is_super_admin=True,
        tenant_id=None,
        role_id=superadmin_role.id if superadmin_role else None,
        mfa_enabled=False,
    )

    session.add(user)
    session.commit()
