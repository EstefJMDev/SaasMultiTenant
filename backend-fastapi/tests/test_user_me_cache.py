from uuid import uuid4

from sqlmodel import Session, select

from app.core.user_me_cache import invalidate_user_me_cache
from app.core.security import hash_password
from app.models.hr import EmployeeProfile
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.services.user_service import get_user_me


def test_get_user_me_does_not_promote_role_by_position_text(
    db_session_fixture: Session,
) -> None:
    suffix = uuid4().hex[:8]
    tenant = Tenant(name=f"Tenant User Me {suffix}", subdomain=f"tenant-user-me-{suffix}")
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    user_role = db_session_fixture.exec(
        select(Role).where(Role.name == "user"),
    ).one()

    user = User(
        email=f"user.me.position.{suffix}@example.com",
        full_name="User Me Position",
        hashed_password=hash_password("user-me-pass"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        role_id=user_role.id,
        mfa_enabled=False,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)

    profile = EmployeeProfile(
        tenant_id=tenant.id,
        user_id=user.id,
        full_name=user.full_name,
        email=user.email,
        position="Gerente de almacén",
        is_active=True,
    )
    db_session_fixture.add(profile)
    db_session_fixture.commit()

    invalidate_user_me_cache(user.id)
    me = get_user_me(db_session_fixture, user)
    assert me.role_name == "user"


def test_get_user_me_cache_can_be_invalidated(
    db_session_fixture: Session,
) -> None:
    suffix = uuid4().hex[:8]
    tenant = Tenant(
        name=f"Tenant User Me Cache {suffix}",
        subdomain=f"tenant-user-me-cache-{suffix}",
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    user_role = db_session_fixture.exec(
        select(Role).where(Role.name == "user"),
    ).one()
    tenant_admin_role = db_session_fixture.exec(
        select(Role).where(Role.name == "tenant_admin"),
    ).one()

    user = User(
        email=f"user.me.cache.{suffix}@example.com",
        full_name="User Me Cache",
        hashed_password=hash_password("user-me-cache-pass"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        role_id=user_role.id,
        mfa_enabled=False,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)

    invalidate_user_me_cache(user.id)
    first = get_user_me(db_session_fixture, user)
    assert first.role_name == "user"

    user.role_id = tenant_admin_role.id
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)

    second = get_user_me(db_session_fixture, user)
    assert second.role_name == "user"

    invalidate_user_me_cache(user.id)
    third = get_user_me(db_session_fixture, user)
    assert third.role_name == "tenant_admin"
