from __future__ import annotations

from typing import Dict, Iterable

from app.core.permission_cache import invalidate_role_permissions_cache
from app.core.permissions import (
    PROCUREMENT_APPROVE,
    PROCUREMENT_CREATE,
    PROCUREMENT_EDIT,
    PROCUREMENT_READ,
    PROCUREMENT_REJECT,
    PROJECTS_READ,
    PROJECTS_WRITE,
    SIGNATURES_ADMIN,
    SIGNATURES_CONFIG,
    SIGNATURES_READ,
    SIGNATURES_WRITE,
    TIME_READ,
    TIME_REPORTS_READ,
    TIME_TRACK,
    WORK_READ,
    WORK_WRITE,
)


BASE_PERMISSIONS: Dict[str, str] = {
    "tenants:read": "Ver listado de tenants",
    "tenants:create": "Crear nuevos tenants",
    "tenants:update": "Editar tenants",
    "tenants:delete": "Eliminar tenants",
    "users:read": "Ver usuarios",
    "users:create": "Crear usuarios",
    "users:delete": "Eliminar usuarios",
    "users:update": "Editar usuarios",
    "tools:read": "Ver cat?logo de herramientas",
    "tools:launch": "Lanzar herramientas externas (ej. Moodle)",
    "tools:configure": "Configurar herramientas para tenants",
    "audit:read": "Consultar registros de auditor?a",
}

BASE_PERMISSION_KEYS = tuple(BASE_PERMISSIONS.keys())

TICKET_PERMISSIONS: Dict[str, str] = {
    "tickets:create": "Crear tickets de soporte",
    "tickets:read_own": "Ver sus propios tickets de soporte",
    "tickets:read_tenant": "Ver todos los tickets del tenant",
    "tickets:manage": "Gestionar tickets del tenant (estado, asignaci?n, notas internas)",
}

HR_PERMISSIONS: Dict[str, str] = {
    "hr:read": "Ver departamentos y empleados del tenant",
    "hr:manage": "Gestionar departamentos y perfiles de empleado del tenant",
    "hr:reports": "Acceder a informes agregados de RRHH",
}

ERP_PERMISSIONS: Dict[str, str] = {
    "erp:read": "Ver proyectos, tareas e informes del ERP",
    "erp:track": "Iniciar/detener control de tiempo",
    "erp:manage": "Gestionar proyectos y tareas del ERP",
    "erp:reports:read": "Ver informes del ERP",
    "can_create_time_reports": "Crear informes de horas",
}

CONTRACTS_PERMISSIONS: Dict[str, str] = {
    "contracts:create": "Crear contratos del tenant",
    "contracts:read": "Ver contratos del tenant",
    "contracts:edit": "Editar contratos en borrador",
    "contracts:approve": "Aprobar contratos del tenant",
    "contracts:reject": "Rechazar contratos del tenant",
}

SIGNATURES_PERMISSIONS: Dict[str, str] = {
    SIGNATURES_READ: "Ver solicitudes y estado de firmas",
    SIGNATURES_WRITE: "Crear y actualizar solicitudes de firma",
    SIGNATURES_CONFIG: "Configurar proveedores y ajustes de firma",
    SIGNATURES_ADMIN: "Administrar evidencias y descargas de firmas",
}

TIME_PERMISSIONS: Dict[str, str] = {
    TIME_READ: "Ver datos de control de tiempo",
    TIME_TRACK: "Iniciar/detener control de tiempo",
    TIME_REPORTS_READ: "Ver informes de tiempo",
}

WORK_PERMISSIONS: Dict[str, str] = {
    WORK_READ: "Ver actividades, tareas y entregables",
    WORK_WRITE: "Crear/editar actividades, tareas y entregables",
}

PROJECTS_PERMISSIONS: Dict[str, str] = {
    PROJECTS_READ: "Ver proyectos y presupuestos",
    PROJECTS_WRITE: "Crear/editar proyectos y presupuestos",
}

PROCUREMENT_PERMISSIONS: Dict[str, str] = {
    PROCUREMENT_READ: "Ver solicitudes y contratos",
    PROCUREMENT_CREATE: "Crear solicitudes o contratos",
    PROCUREMENT_EDIT: "Editar contratos en borrador",
    PROCUREMENT_APPROVE: "Aprobar contratos del tenant",
    PROCUREMENT_REJECT: "Rechazar contratos del tenant",
}

TICKET_ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    "super_admin": TICKET_PERMISSIONS.keys(),
    "tenant_admin": TICKET_PERMISSIONS.keys(),
    "support": ("tickets:create", "tickets:read_tenant", "tickets:manage"),
    "user": ("tickets:create", "tickets:read_own"),
}

HR_ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    "super_admin": HR_PERMISSIONS.keys(),
    "tenant_admin": HR_PERMISSIONS.keys(),
    "support": ("hr:read",),
    "gerencia": ("hr:read", "hr:reports"),
}

ERP_ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    "super_admin": ERP_PERMISSIONS.keys(),
    "tenant_admin": ERP_PERMISSIONS.keys(),
    "support": ("erp:read",),
    "gerencia": ("erp:read", "erp:reports:read"),
    "user": ("erp:read", "erp:track"),
}

CONTRACTS_ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    "super_admin": CONTRACTS_PERMISSIONS.keys(),
    "tenant_admin": CONTRACTS_PERMISSIONS.keys(),
    "support": ("contracts:read",),
    "gerencia": ("contracts:read", "contracts:approve", "contracts:reject"),
    "user": ("contracts:read",),
}

SIGNATURES_ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    "super_admin": SIGNATURES_PERMISSIONS.keys(),
    "tenant_admin": SIGNATURES_PERMISSIONS.keys(),
    "support": (SIGNATURES_READ,),
    "gerencia": (SIGNATURES_READ,),
}

TIME_ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    "super_admin": TIME_PERMISSIONS.keys(),
    "tenant_admin": TIME_PERMISSIONS.keys(),
    "support": (TIME_READ,),
    "gerencia": (TIME_READ, TIME_REPORTS_READ),
    "user": (TIME_READ, TIME_TRACK),
}

WORK_ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    "super_admin": WORK_PERMISSIONS.keys(),
    "tenant_admin": WORK_PERMISSIONS.keys(),
    "support": (WORK_READ,),
    "gerencia": (WORK_READ,),
    "user": (WORK_READ,),
}

PROJECTS_ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    "super_admin": PROJECTS_PERMISSIONS.keys(),
    "tenant_admin": PROJECTS_PERMISSIONS.keys(),
    "support": (PROJECTS_READ,),
    "gerencia": (PROJECTS_READ,),
    "user": (PROJECTS_READ,),
}

PROCUREMENT_ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    "super_admin": PROCUREMENT_PERMISSIONS.keys(),
    "tenant_admin": PROCUREMENT_PERMISSIONS.keys(),
    "support": (PROCUREMENT_READ,),
    "gerencia": (PROCUREMENT_READ, PROCUREMENT_APPROVE, PROCUREMENT_REJECT),
    "user": (PROCUREMENT_READ,),
}


def ensure_permissions(
    session,
    permissions: Dict[str, str],
    *,
    update_description_if_empty: bool = False,
):
    from sqlmodel import select

    from app.models.permission import Permission

    existing_permissions = session.exec(select(Permission)).all()
    by_code = {perm.code: perm for perm in existing_permissions}
    changed = False

    for code, description in permissions.items():
        perm = by_code.get(code)
        if perm:
            if update_description_if_empty and not perm.description:
                perm.description = description
                changed = True
            continue
        perm = Permission(code=code, description=description)
        session.add(perm)
        by_code[code] = perm
        changed = True

    if changed:
        session.commit()
        for perm in by_code.values():
            session.refresh(perm)

    return by_code


def assign_permissions_to_roles(
    session,
    role_permission_map: Dict[str, Iterable[str]],
    permissions_by_code,
) -> None:
    from sqlmodel import select

    from app.models.role import Role
    from app.models.role_permission import RolePermission

    roles = {role.name: role for role in session.exec(select(Role)).all()}

    changed_role_ids: set[int] = set()

    for role_name, codes in role_permission_map.items():
        role = roles.get(role_name)
        if not role:
            continue

        existing_rps = session.exec(
            select(RolePermission).where(RolePermission.role_id == role.id),
        ).all()
        existing_pairs = {
            (rp.role_id, rp.permission_id): rp for rp in existing_rps
        }

        for code in codes:
            perm = permissions_by_code.get(code)
            if not perm:
                continue
            key = (role.id, perm.id)
            if key in existing_pairs:
                continue
            session.add(RolePermission(role_id=role.id, permission_id=perm.id))
            if role.id is not None:
                changed_role_ids.add(role.id)

    session.commit()
    for role_id in changed_role_ids:
        invalidate_role_permissions_cache(role_id)
