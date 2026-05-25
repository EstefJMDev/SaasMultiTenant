"""Permisos oficiales de la plataforma y aliases legacy."""

# Signatures (nuevo dominio)
SIGNATURES_READ = "signatures:read"
SIGNATURES_WRITE = "signatures:write"
SIGNATURES_CONFIG = "signatures:config"
SIGNATURES_ADMIN = "signatures:admin"

# Org (nuevo dominio)
ORG_DEPARTMENTS_READ = "org:departments:read"
ORG_DEPARTMENTS_WRITE = "org:departments:write"
ORG_PEOPLE_READ = "org:people:read"
ORG_PEOPLE_WRITE = "org:people:write"
ORG_ALLOCATIONS_READ = "org:allocations:read"
ORG_ALLOCATIONS_WRITE = "org:allocations:write"
ORG_REPORTS_READ = "org:reports:read"
ORG_POSITIONS_READ = "org:positions:read"
ORG_POSITIONS_WRITE = "org:positions:write"

# Time (nuevo dominio)
TIME_READ = "time:read"
TIME_TRACK = "time:track"
TIME_REPORTS_READ = "time:reports:read"

# Work (nuevo dominio)
WORK_READ = "work:read"
WORK_WRITE = "work:write"

# Tickets (nuevo dominio)
TICKETS_CREATE = "tickets:create"
TICKETS_READ_OWN = "tickets:read_own"
TICKETS_READ_TENANT = "tickets:read_tenant"
TICKETS_MANAGE = "tickets:manage"

# Projects (nuevo dominio)
PROJECTS_READ = "projects:read"
PROJECTS_WRITE = "projects:write"

# Procurement (nuevo dominio)
PROCUREMENT_READ = "procurement:read"
PROCUREMENT_CREATE = "procurement:create"
PROCUREMENT_EDIT = "procurement:edit"
PROCUREMENT_APPROVE = "procurement:approve"
PROCUREMENT_REJECT = "procurement:reject"

# Legacy / compat
CONTRACTS_READ = "contracts:read"
CONTRACTS_CREATE = "contracts:create"
CONTRACTS_EDIT = "contracts:edit"
CONTRACTS_APPROVE = "contracts:approve"
CONTRACTS_REJECT = "contracts:reject"
HR_READ = "hr:read"
HR_MANAGE = "hr:manage"
HR_REPORTS = "hr:reports"
ERP_READ = "erp:read"
ERP_TRACK = "erp:track"
ERP_REPORTS_READ = "erp:reports:read"
ERP_MANAGE = "erp:manage"

# Aliases: permiso nuevo -> lista de permisos legacy equivalentes.
PERMISSION_ALIASES: dict[str, list[str]] = {
    SIGNATURES_READ: [CONTRACTS_READ],
    SIGNATURES_WRITE: [CONTRACTS_APPROVE],
    SIGNATURES_CONFIG: [CONTRACTS_APPROVE],
    SIGNATURES_ADMIN: [CONTRACTS_APPROVE],
    ORG_DEPARTMENTS_READ: [HR_READ],
    ORG_DEPARTMENTS_WRITE: [HR_MANAGE],
    ORG_PEOPLE_READ: [HR_READ],
    ORG_PEOPLE_WRITE: [HR_MANAGE],
    ORG_ALLOCATIONS_READ: [HR_READ],
    ORG_ALLOCATIONS_WRITE: [HR_MANAGE],
    ORG_REPORTS_READ: [HR_REPORTS],
    ORG_POSITIONS_READ: [HR_READ],
    ORG_POSITIONS_WRITE: [HR_MANAGE],
    TIME_READ: [ERP_READ],
    TIME_TRACK: [ERP_TRACK],
    TIME_REPORTS_READ: [ERP_REPORTS_READ],
    WORK_READ: [ERP_READ],
    WORK_WRITE: [ERP_MANAGE],
    PROJECTS_READ: [ERP_READ],
    PROJECTS_WRITE: [ERP_MANAGE],
    PROCUREMENT_READ: [CONTRACTS_READ],
    PROCUREMENT_CREATE: [CONTRACTS_CREATE],
    PROCUREMENT_EDIT: [CONTRACTS_EDIT],
    PROCUREMENT_APPROVE: [CONTRACTS_APPROVE],
    PROCUREMENT_REJECT: [CONTRACTS_REJECT],
}


def has_permission(user_permissions: list[str] | set[str] | tuple[str, ...], perm: str) -> bool:
    normalized = (perm or "").strip().lower()
    if not normalized:
        return False
    permissions = {p.lower() for p in user_permissions}
    if normalized in permissions:
        return True
    for alias in PERMISSION_ALIASES.get(normalized, []):
        if alias.lower() in permissions:
            return True
    return False
