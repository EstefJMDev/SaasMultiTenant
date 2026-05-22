from __future__ import annotations

from typing import Dict, List

from sqlalchemy import delete
from sqlmodel import Session, select

from app.core.permission_cache import invalidate_role_permissions_cache
from app.core.migrate_roles_to_official import migrate_roles
from app.db import session as db_session
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.platform.rbac_seed.permissions_catalog import (
    BASE_PERMISSIONS,
    CONTRACTS_PERMISSIONS,
    CONTRACTS_ROLE_PERMISSIONS,
    ERP_PERMISSIONS,
    ERP_ROLE_PERMISSIONS,
    HR_PERMISSIONS,
    HR_ROLE_PERMISSIONS,
    PROCUREMENT_PERMISSIONS,
    PROCUREMENT_ROLE_PERMISSIONS,
    PROJECTS_PERMISSIONS,
    PROJECTS_ROLE_PERMISSIONS,
    SIGNATURES_PERMISSIONS,
    SIGNATURES_ROLE_PERMISSIONS,
    TICKET_PERMISSIONS,
    TICKET_ROLE_PERMISSIONS,
    TIME_PERMISSIONS,
    TIME_ROLE_PERMISSIONS,
    WORK_PERMISSIONS,
    WORK_ROLE_PERMISSIONS,
    assign_permissions_to_roles,
    ensure_permissions,
)
from app.platform.rbac_seed.roles_catalog import ROLE_PERMISSIONS
from app.platform.rbac_seed.tenants_seed import ensure_default_tenant
from app.platform.rbac_seed.tools_seed import (
    ensure_default_tools_for_all_tenants,
    ensure_default_tools_for_tenant,
)
from app.platform.rbac_seed.users_seed import (
    assign_tenant_admin_to_first_users,
    ensure_super_admin_user,
)


def _get_or_create_roles(session: Session) -> Dict[str, Role]:
    existing_roles = session.exec(select(Role)).all()
    by_name = {role.name: role for role in existing_roles}

    for role_name in ROLE_PERMISSIONS.keys():
        if role_name in by_name:
            continue
        role = Role(
            name=role_name,
            description=f"Rol base: {role_name}",
        )
        session.add(role)
        by_name[role_name] = role

    session.commit()
    for role in by_name.values():
        session.refresh(role)

    return by_name


def _sync_role_permissions(
    session: Session,
    roles: Dict[str, Role],
    permissions: Dict[str, Permission],
) -> None:
    existing = session.exec(select(RolePermission)).all()
    existing_map: Dict[tuple[int, int], RolePermission] = {
        (rp.role_id, rp.permission_id): rp for rp in existing
    }

    to_add: List[RolePermission] = []
    changed_role_ids: set[int] = set()

    for role_name, perm_codes in ROLE_PERMISSIONS.items():
        role = roles[role_name]
        for code in perm_codes:
            perm = permissions.get(code)
            if not perm:
                continue

            key = (role.id, perm.id)
            if key in existing_map:
                continue

            to_add.append(
                RolePermission(
                    role_id=role.id,
                    permission_id=perm.id,
                ),
            )
            if role.id is not None:
                changed_role_ids.add(role.id)

    if to_add:
        session.add_all(to_add)
        session.commit()
        for role_id in changed_role_ids:
            invalidate_role_permissions_cache(role_id)


def _ensure_contracts_roles(session: Session) -> None:
    roles = {r.name: r for r in session.exec(select(Role)).all()}
    required_roles = {
        "gerencia": "Gerencia",
    }
    for role_name, desc in required_roles.items():
        if role_name not in roles:
            role = Role(name=role_name, description=f"Rol contratos: {desc}")
            session.add(role)
            session.commit()
            session.refresh(role)
            roles[role_name] = role


def _prune_gerencia_permissions(session: Session) -> None:
    role = session.exec(select(Role).where(Role.name == "gerencia")).one_or_none()
    if not role:
        return

    perms = session.exec(
        select(Permission).where(
            (Permission.code.like("tickets:%"))
            | (Permission.code.like("tools:%"))
            | (Permission.code.like("tenants:%"))
            | (Permission.code == "audit:read")
            | (Permission.code == "branding:manage")
            | (Permission.code == "users:create")
            | (Permission.code == "users:update")
            | (Permission.code == "users:delete")
        )
    ).all()
    disallowed_ids = {perm.id for perm in perms}
    if not disallowed_ids:
        return

    session.exec(
        delete(RolePermission).where(
            RolePermission.role_id == role.id,
            RolePermission.permission_id.in_(disallowed_ids),
        )
    )
    session.commit()
    if role.id is not None:
        invalidate_role_permissions_cache(role.id)


def seed_rbac(session: Session) -> None:
    permissions = ensure_permissions(
        session,
        BASE_PERMISSIONS,
        update_description_if_empty=True,
    )
    roles = _get_or_create_roles(session)
    _sync_role_permissions(session, roles, permissions)
    ensure_super_admin_user(session, roles)
    assign_tenant_admin_to_first_users(session, roles)

    tenant = ensure_default_tenant(session)
    ensure_default_tools_for_tenant(session, tenant)
    ensure_default_tools_for_all_tenants(session)

    ticket_permissions = ensure_permissions(session, TICKET_PERMISSIONS)
    assign_permissions_to_roles(session, TICKET_ROLE_PERMISSIONS, ticket_permissions)

    hr_permissions = ensure_permissions(session, HR_PERMISSIONS)
    assign_permissions_to_roles(session, HR_ROLE_PERMISSIONS, hr_permissions)

    erp_permissions = ensure_permissions(session, ERP_PERMISSIONS)
    assign_permissions_to_roles(session, ERP_ROLE_PERMISSIONS, erp_permissions)

    _ensure_contracts_roles(session)
    contracts_permissions = ensure_permissions(session, CONTRACTS_PERMISSIONS)
    assign_permissions_to_roles(
        session, CONTRACTS_ROLE_PERMISSIONS, contracts_permissions
    )

    signatures_permissions = ensure_permissions(session, SIGNATURES_PERMISSIONS)
    assign_permissions_to_roles(
        session, SIGNATURES_ROLE_PERMISSIONS, signatures_permissions
    )

    time_permissions = ensure_permissions(session, TIME_PERMISSIONS)
    assign_permissions_to_roles(session, TIME_ROLE_PERMISSIONS, time_permissions)

    work_permissions = ensure_permissions(session, WORK_PERMISSIONS)
    assign_permissions_to_roles(session, WORK_ROLE_PERMISSIONS, work_permissions)

    projects_permissions = ensure_permissions(session, PROJECTS_PERMISSIONS)
    assign_permissions_to_roles(
        session, PROJECTS_ROLE_PERMISSIONS, projects_permissions
    )

    procurement_permissions = ensure_permissions(session, PROCUREMENT_PERMISSIONS)
    assign_permissions_to_roles(
        session, PROCUREMENT_ROLE_PERMISSIONS, procurement_permissions
    )

    _prune_gerencia_permissions(session)
    migrate_roles(session, apply_changes=True)


def run_seed() -> None:
    with Session(db_session.engine) as session:
        seed_rbac(session)
