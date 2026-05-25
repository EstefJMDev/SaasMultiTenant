from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.models.user import User
from app.platform.tools.deps import require_perm, require_tool
from app.api.deps import require_any_permissions, require_permissions
from app.platform.tools.service import resolve_entitlements


def _seed_user_with_access(session: Session) -> tuple[User, Tenant, Tool, Permission]:
    suffix = uuid4().hex[:8]
    tenant = Tenant(name=f"tenant-{suffix}", subdomain=f"t-{suffix}", is_active=True)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    role = Role(name=f"ROLE_{suffix}", description="role for entitlements tests")
    session.add(role)
    session.commit()
    session.refresh(role)

    permission = Permission(code=f"procurement:contracts:approve:{suffix}", description="test")
    session.add(permission)
    session.commit()
    session.refresh(permission)

    session.add(RolePermission(role_id=role.id, permission_id=permission.id))
    session.commit()

    tool = Tool(
        name=f"Procurement {suffix}",
        slug=f"procurement-{suffix}",
        base_url="https://tool.local",
        description="test tool",
    )
    session.add(tool)
    session.commit()
    session.refresh(tool)

    session.add(TenantTool(tenant_id=tenant.id, tool_id=tool.id, is_enabled=True))
    session.commit()

    user = User(
        email=f"user-{suffix}@example.com",
        full_name="User Entitlements",
        hashed_password="hashed",
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        role_id=role.id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user, tenant, tool, permission


def _seed_user_with_permission(
    session: Session,
    *,
    permission_code: str,
    role_name: str,
    tool_slug: str,
) -> tuple[User, Tenant, Tool]:
    tenant = Tenant(name=f"tenant-{uuid4().hex[:6]}", subdomain=f"t-{uuid4().hex[:6]}", is_active=True)
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    role = Role(name=role_name, description="role for alias tests")
    session.add(role)
    session.commit()
    session.refresh(role)

    perm = session.exec(select(Permission).where(Permission.code == permission_code)).one_or_none()
    if not perm:
        perm = Permission(code=permission_code, description="alias test perm")
        session.add(perm)
        session.commit()
        session.refresh(perm)

    session.add(RolePermission(role_id=role.id, permission_id=perm.id))
    session.commit()

    tool = Tool(
        name=tool_slug,
        slug=tool_slug,
        base_url="https://tool.local",
        description="test tool",
    )
    session.add(tool)
    session.commit()
    session.refresh(tool)

    session.add(TenantTool(tenant_id=tenant.id, tool_id=tool.id, is_enabled=True))
    session.commit()

    user = User(
        email=f"user-{uuid4().hex[:6]}@example.com",
        full_name="User Alias",
        hashed_password="hashed",
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        role_id=role.id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user, tenant, tool


def test_resolve_entitlements_returns_tools_and_permissions(db_session_fixture: Session) -> None:
    user, tenant, tool, permission = _seed_user_with_access(db_session_fixture)

    entitlements = resolve_entitlements(db_session_fixture, user, tenant_id=tenant.id)

    assert entitlements.tenantId == tenant.id
    assert permission.code in entitlements.permissions
    assert any(item.slug == tool.slug for item in entitlements.tools)


def test_require_tool_and_require_perm_enforce_access(db_session_fixture: Session) -> None:
    user, tenant, tool, permission = _seed_user_with_access(db_session_fixture)

    assert require_tool(tool.slug)(
        current_user=user,
        session=db_session_fixture,
        scoped_tenant_id=tenant.id,
    ) == user
    assert require_perm(permission.code)(
        current_user=user,
        session=db_session_fixture,
        scoped_tenant_id=tenant.id,
    ) == user

    with pytest.raises(HTTPException) as tool_exc:
        require_tool("missing-tool")(
            current_user=user,
            session=db_session_fixture,
            scoped_tenant_id=tenant.id,
        )
    assert tool_exc.value.status_code == 403

    with pytest.raises(HTTPException) as perm_exc:
        require_perm("missing:permission")(
            current_user=user,
            session=db_session_fixture,
            scoped_tenant_id=tenant.id,
        )
    assert perm_exc.value.status_code == 403


def test_require_perm_accepts_legacy_alias(db_session_fixture: Session) -> None:
    user, tenant, _tool = _seed_user_with_permission(
        db_session_fixture,
        permission_code="contracts:read",
        role_name=f"ROLE_ALIAS_{uuid4().hex[:6]}",
        tool_slug=f"tool-{uuid4().hex[:6]}",
    )

    assert require_perm("signatures:read")(
        current_user=user,
        session=db_session_fixture,
        scoped_tenant_id=tenant.id,
    ) == user


def test_require_perm_rejects_without_alias(db_session_fixture: Session) -> None:
    user, tenant, _tool = _seed_user_with_permission(
        db_session_fixture,
        permission_code="contracts:read",
        role_name=f"ROLE_ALIAS_{uuid4().hex[:6]}",
        tool_slug=f"tool-{uuid4().hex[:6]}",
    )

    with pytest.raises(HTTPException) as perm_exc:
        require_perm("signatures:admin")(
            current_user=user,
            session=db_session_fixture,
            scoped_tenant_id=tenant.id,
        )
    assert perm_exc.value.status_code == 403


def test_require_permissions_and_accepts_alias(db_session_fixture: Session) -> None:
    tenant = Tenant(name=f"tenant-{uuid4().hex[:6]}", subdomain=f"t-{uuid4().hex[:6]}", is_active=True)
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    role = Role(name=f"ROLE_AND_{uuid4().hex[:6]}", description="role for and alias tests")
    db_session_fixture.add(role)
    db_session_fixture.commit()
    db_session_fixture.refresh(role)

    perm_legacy = db_session_fixture.exec(
        select(Permission).where(Permission.code == "contracts:read")
    ).one_or_none()
    if not perm_legacy:
        perm_legacy = Permission(code="contracts:read", description="legacy read")
        db_session_fixture.add(perm_legacy)
        db_session_fixture.commit()
        db_session_fixture.refresh(perm_legacy)

    perm_users = db_session_fixture.exec(
        select(Permission).where(Permission.code == "users:read")
    ).one_or_none()
    if not perm_users:
        perm_users = Permission(code="users:read", description="users read")
        db_session_fixture.add(perm_users)
        db_session_fixture.commit()
        db_session_fixture.refresh(perm_users)

    db_session_fixture.add(RolePermission(role_id=role.id, permission_id=perm_legacy.id))
    db_session_fixture.add(RolePermission(role_id=role.id, permission_id=perm_users.id))
    db_session_fixture.commit()

    user = User(
        email=f"user-and-{uuid4().hex[:6]}@example.com",
        full_name="User And",
        hashed_password="hashed",
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        role_id=role.id,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)

    assert require_permissions(["signatures:read", "users:read"])(
        current_user=user,
        session=db_session_fixture,
    ) == user


def test_require_any_permissions_or_accepts_alias(db_session_fixture: Session) -> None:
    user, tenant, _tool = _seed_user_with_permission(
        db_session_fixture,
        permission_code="contracts:read",
        role_name=f"ROLE_OR_{uuid4().hex[:6]}",
        tool_slug=f"tool-{uuid4().hex[:6]}",
    )

    assert require_any_permissions(["signatures:read", "missing:perm"])(
        current_user=user,
        session=db_session_fixture,
    ) == user
