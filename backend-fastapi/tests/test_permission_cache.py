from uuid import uuid4

from sqlmodel import Session, select

from app.core.permission_cache import invalidate_role_permissions_cache
from app.core.role_permissions import collect_user_permission_codes
from app.core.security import hash_password
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.tenant import Tenant
from app.models.user import User


def test_role_permissions_are_cached_and_can_be_invalidated(
    db_session_fixture: Session,
) -> None:
    suffix = uuid4().hex[:8]
    tenant = Tenant(name="Tenant Permissions Cache", subdomain=f"tenant-perm-cache-{suffix}")
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    role = Role(name=f"role_perm_cache_test_{suffix}", description="role for cache test")
    db_session_fixture.add(role)
    db_session_fixture.commit()
    db_session_fixture.refresh(role)

    permission = Permission(
        code=f"perm:cache:test:{suffix}",
        description="Permission cache test",
    )
    db_session_fixture.add(permission)
    db_session_fixture.commit()
    db_session_fixture.refresh(permission)

    db_session_fixture.add(RolePermission(role_id=role.id, permission_id=permission.id))
    db_session_fixture.commit()

    user = User(
        email=f"perm.cache.{suffix}@example.com",
        full_name="Permission Cache User",
        hashed_password=hash_password("perm-cache-pass"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        role_id=role.id,
        mfa_enabled=False,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)

    invalidate_role_permissions_cache(role.id)
    first = collect_user_permission_codes(db_session_fixture, user)
    assert permission.code in first

    existing = db_session_fixture.exec(
        select(RolePermission).where(
            RolePermission.role_id == role.id,
            RolePermission.permission_id == permission.id,
        )
    ).one()
    db_session_fixture.delete(existing)
    db_session_fixture.commit()

    second = collect_user_permission_codes(db_session_fixture, user)
    assert permission.code in second

    invalidate_role_permissions_cache(role.id)
    third = collect_user_permission_codes(db_session_fixture, user)
    assert permission.code not in third
