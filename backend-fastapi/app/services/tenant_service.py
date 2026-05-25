from typing import List

from sqlmodel import Session, select

from app.core.audit import log_action
from app.models.tenant import Tenant
from app.models.user import User
from app.models.tenant_tool import TenantTool
from app.models.audit_log import AuditLog
from app.models.tool import Tool
from app.schemas.tenant import TenantCreate, TenantRead, TenantUpdate


def list_tenants(session: Session, current_user: User) -> List[TenantRead]:
    """
    Lista todos los tenants en el sistema.

    Se asume que el control de permisos ya se ha realizado
    (ej: require_permissions en la capa de rutas).
    """

    tenants = session.exec(select(Tenant)).all()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=None,
        action="tenant.list",
        details=f"Listado de {len(tenants)} tenants",
    )

    result: List[TenantRead] = []
    for t in tenants:
        result.append(
            TenantRead(
                id=t.id,
                name=t.name,
                subdomain=t.subdomain,
                is_active=t.is_active,
                created_at=t.created_at,
            ),
        )

    return result


def create_tenant(
    session: Session,
    current_user: User,
    tenant_in: TenantCreate,
) -> TenantRead:
    """
    Crea un nuevo tenant.
    """

    existing = session.exec(
        select(Tenant).where(Tenant.subdomain == tenant_in.subdomain),
    ).one_or_none()
    if existing:
        raise ValueError("Ya existe un tenant con ese subdominio")

    tenant = Tenant(
        name=tenant_in.name,
        subdomain=tenant_in.subdomain,
        is_active=tenant_in.is_active,
    )
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    # Asignamos todas las herramientas existentes al nuevo tenant, habilitadas.
    tools = session.exec(select(Tool)).all()
    for tool in tools:
        tt = TenantTool(tenant_id=tenant.id, tool_id=tool.id, is_enabled=True)
        session.add(tt)
    session.commit()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant.id,
        action="tenant.create",
        details=f"Tenant creado con subdominio '{tenant.subdomain}'",
    )

    return TenantRead(
        id=tenant.id,
        name=tenant.name,
        subdomain=tenant.subdomain,
        is_active=tenant.is_active,
        created_at=tenant.created_at,
    )


def delete_tenant(
    session: Session,
    current_user: User,
    tenant_id: int,
) -> None:
    """
    Desactiva un tenant y deja a sus usuarios inactivos.
    Solo deberia poder hacerlo un Super Admin.
    """

    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise LookupError("Tenant no encontrado")

    if not current_user.is_super_admin:
        raise PermissionError("Solo un Super Admin puede eliminar tenants")

    # Deshabilitamos herramientas del tenant
    tenant_tools = session.exec(
        select(TenantTool).where(TenantTool.tenant_id == tenant_id),
    ).all()
    for tt in tenant_tools:
        tt.is_enabled = False
        session.add(tt)

    # Obtenemos usuarios del tenant
    users = session.exec(
        select(User).where(User.tenant_id == tenant_id),
    ).all()

    # En lugar de borrar usuarios, los dejamos inactivos
    for user in users:
        user.is_active = False
        session.add(user)

    tenant.is_active = False
    session.add(tenant)

    # Persistimos cambios
    session.commit()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=None,
        action="tenant.deactivate",
        details=f"Tenant desactivado con subdominio '{tenant.subdomain}'",
    )


def update_tenant(
    session: Session,
    current_user: User,
    tenant_id: int,
    tenant_in: TenantUpdate,
) -> TenantRead:
    """
    Actualiza un tenant (solo Super Admin).
    """

    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise LookupError("Tenant no encontrado")

    if not current_user.is_super_admin:
        raise PermissionError("Solo un Super Admin puede editar tenants")

    changes: list[str] = []

    if tenant_in.subdomain and tenant_in.subdomain != tenant.subdomain:
        existing = session.exec(
            select(Tenant).where(Tenant.subdomain == tenant_in.subdomain),
        ).one_or_none()
        if existing and existing.id != tenant.id:
            raise ValueError("Ya existe un tenant con ese subdominio")
        changes.append("subdomain")
        tenant.subdomain = tenant_in.subdomain

    if tenant_in.name is not None and tenant_in.name != tenant.name:
        changes.append("name")
        tenant.name = tenant_in.name

    if tenant_in.is_active is not None and tenant_in.is_active != tenant.is_active:
        changes.append("is_active")
        tenant.is_active = tenant_in.is_active

    if changes:
        session.add(tenant)
        session.commit()
        session.refresh(tenant)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant.id,
        action="tenant.update",
        details=(
            "Tenant actualizado"
            if not changes
            else f"Tenant actualizado (campos: {', '.join(changes)})"
        ),
    )

    return TenantRead(
        id=tenant.id,
        name=tenant.name,
        subdomain=tenant.subdomain,
        is_active=tenant.is_active,
        created_at=tenant.created_at,
    )
