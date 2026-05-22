from __future__ import annotations

from typing import Optional, Set

from fastapi import HTTPException

from sqlmodel import Session, select

from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User
from app.models.hr import Department, EmployeeDepartment, EmployeeProfile, Position
from app.platform.contracts_core.models import ContractDepartment


def _get_role_name(session: Session, user: User) -> Optional[str]:
    """Devuelve nombre del rol del usuario (lowercase) o None."""
    if not user.role_id:
        return None
    role = session.get(Role, user.role_id)
    return role.name.lower() if role else None


# Legacy role-name aliases. Mantenido solo para routing del workflow de contratos
# (review_service / workflow_service) — NO se usa en gates de comparativos.
ROLE_GERENCIA_ALIASES = {"gerencia", "gerente", "manager", "management", "tenant_admin"}
ROLE_ADMIN_ALIASES = {"administracion", "admin", "administration"}
ROLE_COMPRAS_ALIASES = {"compras", "purchase", "purchasing"}
ROLE_JURIDICO_ALIASES = {"juridico", "legal"}


def ensure_tenant_access(user: User, tenant_id: int) -> None:
    if user.is_super_admin:
        return
    if not user.tenant_id or user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=403,
            detail="El usuario no pertenece al tenant del contrato",
        )


def _user_has_permission(session: Session, user: User, code: str) -> bool:
    if user.is_super_admin:
        return True
    if not user.role_id:
        return False
    statement = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == user.role_id)
    )
    permissions = {
        row if isinstance(row, str) else row[0]
        for row in session.exec(statement).all()
        if row
    }
    return code in permissions


def _is_tenant_admin(session: Session, user: User) -> bool:
    """Devuelve True si el user tiene rol 'tenant_admin'. Los tenant admin son
    administradores internos del tenant: bypassean los checks de Position/Department
    igual que super_admin pero acotados a su propio tenant (ensure_tenant_access
    sigue aplicando).
    """
    return _get_role_name(session, user) == "tenant_admin"


def _get_employee(session: Session, user: User) -> Optional[EmployeeProfile]:
    if not user.tenant_id:
        return None
    return session.exec(
        select(EmployeeProfile).where(
            EmployeeProfile.user_id == user.id,
            EmployeeProfile.tenant_id == user.tenant_id,
            EmployeeProfile.is_active.is_(True),
        )
    ).one_or_none()


def _user_department_ids(session: Session, employee: EmployeeProfile) -> Set[int]:
    rows = session.exec(
        select(EmployeeDepartment.department_id).where(
            EmployeeDepartment.employee_id == employee.id
        )
    ).all()
    return {row if isinstance(row, int) else row[0] for row in rows if row is not None}


# ─────────────────────────────────────────────────────────────────────────────
# Comparative capabilities (Department + Position, AND inheritance)
# ─────────────────────────────────────────────────────────────────────────────


def _has_comparative_cap(session: Session, user: User, cap: str) -> bool:
    """
    Effective capability = super_admin OR (
        employee active AND
        position active with cap=True
    ).

    Solo super_admin bypassea los checks por puesto. tenant_admin NO bypassea:
    si necesita aprobar/editar comparativos, debe tener una Position con la
    capacidad correspondiente. Esto evita que un admin de tenant herede caps
    de comparativo simplemente por su rol del sistema.

    El departamento no condiciona la cap: cada puesto la concede de forma
    independiente. El dept solo informa de las acciones existentes.
    """
    if user.is_super_admin:
        return True

    employee = _get_employee(session, user)
    if not employee or not employee.position_id:
        return False

    pos = session.get(Position, employee.position_id)
    if not pos or not pos.is_active or pos.tenant_id != user.tenant_id:
        return False
    return bool(getattr(pos, cap, False))


def can_create_comparative(session: Session, user: User) -> bool:
    return _has_comparative_cap(session, user, "can_create_comparative")


def can_edit_comparative(session: Session, user: User) -> bool:
    return _has_comparative_cap(session, user, "can_edit_comparative")


def can_delete_comparative(session: Session, user: User) -> bool:
    return _has_comparative_cap(session, user, "can_delete_comparative")


def can_approve_comparative(session: Session, user: User) -> bool:
    return _has_comparative_cap(session, user, "can_approve_comparative")


def can_reject_comparative(session: Session, user: User) -> bool:
    return _has_comparative_cap(session, user, "can_reject_comparative")


def can_view_all_comparatives(session: Session, user: User) -> bool:
    """True si el puesto del usuario tiene visibilidad global de comparativos/contratos.
    Si False, el listado/detalle se restringe a `created_by_id == user.id`.
    """
    return _has_comparative_cap(session, user, "can_view_all_comparatives")


def can_read_comparative(session: Session, user: User) -> bool:
    """Reading: super_admin, tenant_admin, or any user with an active employee
    linked to a position."""
    if user.is_super_admin:
        return True
    if _is_tenant_admin(session, user):
        return True
    employee = _get_employee(session, user)
    return bool(employee and employee.position_id)


# Legacy aliases kept for compatibility while UI/services migrate.
def can_upload_comparative(session: Session, user: User) -> bool:
    return can_create_comparative(session, user)


def can_write_comparative(session: Session, user: User) -> bool:
    return can_create_comparative(session, user) or can_edit_comparative(session, user)


# ─────────────────────────────────────────────────────────────────────────────
# Contract capabilities (Department OR Position).
#
# Regla: para cada cap el usuario la tiene si:
#   - super_admin, o
#   - Position activa con cap=True, o
#   - cualquier Department asignado con cap=True
#
# NO se exige herencia estricta Position ⊆ Department: Jefe de Obra y
# Director Técnico tienen aprobar/rechazar sin pertenecer a Admin/Jurídico.
# ─────────────────────────────────────────────────────────────────────────────


def _has_employee(session: Session, user: User) -> bool:
    return _get_employee(session, user) is not None


def _position_has_cap(session: Session, employee: EmployeeProfile, cap: str) -> bool:
    if not employee.position_id:
        return False
    pos = session.get(Position, employee.position_id)
    if not pos or not pos.is_active or pos.tenant_id != employee.tenant_id:
        return False
    return bool(getattr(pos, cap, False))


def _any_department_has_cap(
    session: Session, employee: EmployeeProfile, cap: str
) -> bool:
    dept_ids = _user_department_ids(session, employee)
    if not dept_ids:
        return False
    rows = session.exec(
        select(Department).where(Department.id.in_(dept_ids))
    ).all()
    for dept in rows:
        if dept and bool(getattr(dept, cap, False)):
            return True
    return False


def _has_contract_cap(session: Session, user: User, cap: str) -> bool:
    if user.is_super_admin:
        return True
    employee = _get_employee(session, user)
    if not employee:
        return False
    if _position_has_cap(session, employee, cap):
        return True
    if _any_department_has_cap(session, employee, cap):
        return True
    return False


def can_view_contract(session: Session, user: User) -> bool:
    return _has_contract_cap(session, user, "can_view_contract")


def can_edit_contract(session: Session, user: User) -> bool:
    return _has_contract_cap(session, user, "can_edit_contract")


def can_regenerate_contract(session: Session, user: User) -> bool:
    return _has_contract_cap(session, user, "can_regenerate_contract") or _has_contract_cap(
        session, user, "can_edit_contract"
    )


def can_approve_contract(session: Session, user: User) -> bool:
    return _has_contract_cap(session, user, "can_approve_contract")


def can_reject_contract(session: Session, user: User) -> bool:
    return _has_contract_cap(session, user, "can_reject_contract")


def can_create_contract(session: Session, user: User) -> bool:
    """Crear contrato: misma cap que editar (no es acción separada en este flujo)."""
    return can_edit_contract(session, user)


def can_view_all_contracts(session: Session, user: User) -> bool:
    """True si el usuario ve TODOS los contratos del tenant.
    La visibilidad global no debe heredarse solo por tener
    ``can_view_contract=True`` en Position, porque JO/DT necesitan entrar al
    formulario del contrato sin por ello abrir todo el listado del tenant.
    Se reserva a departamentos globales como Administración, Jurídico o
    Gerencia.
    """
    if user.is_super_admin:
        return True
    if _is_tenant_admin(session, user):
        return True
    employee = _get_employee(session, user)
    if not employee:
        return False
    dept_ids = _user_department_ids(session, employee)
    if not dept_ids:
        return False
    rows = session.exec(
        select(Department).where(Department.id.in_(dept_ids))
    ).all()
    global_names = {
        "administracion",
        "administración",
        "admin",
        "juridico",
        "jurídico",
        "legal",
        "gerencia",
    }
    for dept in rows:
        if not dept or not bool(getattr(dept, "can_view_contract", False)):
            continue
        if (dept.name or "").strip().lower() in global_names:
            return True
    return False


def get_user_departments(session: Session, user: User) -> Set[ContractDepartment]:
    """All ContractDepartment values the user can act on (workflow routing)."""
    if user.is_super_admin:
        return {dept for dept in ContractDepartment}
    if _is_tenant_admin(session, user):
        return {dept for dept in ContractDepartment}

    employee = _get_employee(session, user)
    if not employee:
        return set()

    dept_ids = _user_department_ids(session, employee)
    if not dept_ids:
        return set()

    rows = session.exec(
        select(Department.name).where(Department.id.in_(dept_ids))
    ).all()

    name_map = {
        "gerencia": ContractDepartment.GERENCIA,
        "gerente": ContractDepartment.GERENCIA,
        "administracion": ContractDepartment.ADMIN,
        "compras": ContractDepartment.COMPRAS,
        "juridico": ContractDepartment.JURIDICO,
    }
    out: Set[ContractDepartment] = set()
    for row in rows:
        name = (row if isinstance(row, str) else row[0]) or ""
        key = name.strip().lower()
        mapped = name_map.get(key)
        if isinstance(mapped, ContractDepartment):
            out.add(mapped)
    return out


def department_for_user(session: Session, user: User) -> Optional[ContractDepartment]:
    if user.is_super_admin:
        return None
    departments = get_user_departments(session, user)
    if departments:
        return sorted(departments, key=lambda d: d.value)[0]
    return None
