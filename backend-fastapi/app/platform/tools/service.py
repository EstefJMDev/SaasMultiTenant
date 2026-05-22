from sqlmodel import Session, select

from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.tool import Tool
from app.models.user import User
from app.platform.tools.schemas import MeEntitlementsRead, ToolEntitlementRead


def _collect_effective_permissions(session: Session, user: User) -> set[str]:
    if user.is_super_admin:
        permissions = session.exec(select(Permission.code)).all()
        return {code for code in permissions if code}

    if user.role_id is None:
        return set()

    rows = session.exec(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == user.role_id)
    ).all()
    return {code for code in rows if code}


def _list_enabled_tools_for_tenant(session: Session, tenant_id: int) -> list[ToolEntitlementRead]:
    # Restricciones por tenant desactivadas: todas las herramientas del catálogo
    # se devuelven como habilitadas para cualquier tenant.
    catalog = session.exec(select(Tool).order_by(Tool.name.asc())).all()
    return [
        ToolEntitlementRead(id=tool.id, slug=tool.slug, name=tool.name, enabled=True)
        for tool in catalog
    ]


def resolve_entitlements(
    session: Session,
    user: User,
    tenant_id: int | None = None,
) -> MeEntitlementsRead:
    effective_tenant = tenant_id if user.is_super_admin else user.tenant_id
    tools: list[ToolEntitlementRead] = []
    if effective_tenant is not None:
        tools = _list_enabled_tools_for_tenant(session, effective_tenant)
    elif user.is_super_admin:
        catalog = session.exec(select(Tool).order_by(Tool.name.asc())).all()
        tools = [
            ToolEntitlementRead(id=tool.id, slug=tool.slug, name=tool.name, enabled=True)
            for tool in catalog
        ]

    role_name = None
    if user.role_id:
        role = session.get(Role, user.role_id)
        role_name = role.name if role else None

    return MeEntitlementsRead(
        tenantId=effective_tenant,
        departmentId=None,
        role=role_name,
        tools=tools,
        permissions=sorted(_collect_effective_permissions(session, user)),
    )
