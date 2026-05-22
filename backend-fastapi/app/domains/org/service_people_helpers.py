from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
import unicodedata

from sqlmodel import Session

from app.domains.org import repo
from app.core.permission_cache import invalidate_role_permissions_cache
from app.core.user_me_cache import invalidate_user_me_cache
from app.models.hr import Department, EmployeeDepartment, EmployeeProfile
from app.models.role import Role
from app.models.user import User
from app.schemas.hr import (
    EmployeeDepartmentAllocationInput,
    EmployeeDepartmentAllocationRead,
)


def ensure_same_tenant(tenant_id: int, user: User) -> None:
    if user.is_super_admin:
        return
    if not user.tenant_id or user.tenant_id != tenant_id:
        raise PermissionError("No tienes permisos para gestionar este tenant")


def normalize_percentage(value: Optional[Decimal]) -> Decimal:
    return repo.normalize_decimal(value)


def compose_employee_full_name(
    first_name: Optional[str],
    last_name: Optional[str],
    fallback: Optional[str] = None,
) -> Optional[str]:
    parts = [part.strip() for part in (first_name, last_name) if part and part.strip()]
    if parts:
        return " ".join(parts)
    if fallback and fallback.strip():
        return fallback.strip()
    return None


def apply_department_hours(
    available_hours: Optional[Decimal],
    _availability_percentage: Optional[Decimal],
    department_percentage: Optional[Decimal],
) -> Optional[Decimal]:
    if available_hours is None:
        return None
    pct_department = normalize_percentage(department_percentage)
    return Decimal(available_hours) * (pct_department / Decimal(100))


def _normalize_department_name(name: Optional[str]) -> str:
    if not name:
        return ""
    normalized = unicodedata.normalize("NFKD", name)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_only.strip().lower().split())


def resolve_department_project_percentage(department: Optional[Department]) -> Decimal:
    if not department:
        return Decimal(100)

    name = _normalize_department_name(department.name)
    manual = (
        Decimal(department.project_allocation_percentage)
        if department.project_allocation_percentage is not None
        else Decimal(100)
    )

    if "jefes de obra" in name or ("jefe" in name and "obra" in name):
        return Decimal(30)
    if "estudio" in name:
        return Decimal(50)
    if "i+d" in name or name == "id" or " i d " in f" {name} ":
        return Decimal(100)
    if "especiales" in name:
        return manual
    return manual


def resolve_employee_availability_for_year(
    session: Session,
    *,
    profile: EmployeeProfile,
    year: int,
) -> tuple[Optional[Decimal], Optional[Decimal], Optional[Decimal]]:
    annual = repo.get_employee_year_availability(
        session,
        employee_id=profile.id,
        year=year,
    )
    if annual:
        return annual.available_hours, annual.availability_percentage, annual.hourly_rate
    return profile.available_hours, profile.availability_percentage, profile.hourly_rate


def normalize_allocations(
    allocations: list[EmployeeDepartmentAllocationInput],
) -> list[EmployeeDepartmentAllocationInput]:
    if not allocations:
        raise ValueError("Debes indicar al menos un departamento.")
    seen: set[int] = set()
    total = Decimal("0")
    primary_count = 0
    normalized: list[EmployeeDepartmentAllocationInput] = []
    for item in allocations:
        if item.department_id in seen:
            raise ValueError("No se puede repetir departamento en la distribucion.")
        if item.percentage <= 0:
            raise ValueError("Cada porcentaje debe ser mayor que 0.")
        seen.add(item.department_id)
        total += Decimal(item.percentage)
        if item.is_primary:
            primary_count += 1
        normalized.append(item)
    if len(normalized) > 2:
        raise ValueError("Solo se permiten hasta 2 departamentos por empleado.")
    if total.quantize(Decimal("0.01")) != Decimal("100.00"):
        raise ValueError("La suma de porcentajes de departamentos debe ser 100.")
    if primary_count == 0:
        normalized.sort(key=lambda it: Decimal(it.percentage), reverse=True)
        normalized[0].is_primary = True
    elif primary_count > 1:
        raise ValueError("Solo un departamento puede ser principal.")
    return normalized


def load_department_allocations(
    session: Session,
    employee_id: int,
) -> list[EmployeeDepartmentAllocationRead]:
    links = repo.list_employee_departments_by_employee_id(session, employee_id)
    return [
        EmployeeDepartmentAllocationRead(
            department_id=link.department_id,
            percentage=link.allocation_percentage or Decimal(100),
            is_primary=bool(link.is_primary),
        )
        for link in links
    ]


def set_employee_department_allocations(
    session: Session,
    *,
    profile: EmployeeProfile,
    tenant_id: int,
    allocations: list[EmployeeDepartmentAllocationInput],
) -> int:
    normalized = normalize_allocations(allocations)
    department_ids = [item.department_id for item in normalized]
    departments = repo.list_departments_by_ids(session, department_ids)
    valid_ids = {dept.id for dept in departments if dept.tenant_id == tenant_id}
    if len(valid_ids) != len(set(department_ids)):
        raise ValueError("Todos los departamentos deben pertenecer al tenant.")

    existing = repo.list_employee_departments_by_employee_id(session, profile.id)
    by_dept = {link.department_id: link for link in existing}
    keep_ids = set(department_ids)
    for link in existing:
        if link.department_id not in keep_ids:
            session.delete(link)

    for item in normalized:
        link = by_dept.get(item.department_id)
        if not link:
            link = EmployeeDepartment(
                employee_id=profile.id,
                department_id=item.department_id,
            )
        link.is_primary = bool(item.is_primary)
        link.allocation_percentage = Decimal(item.percentage)
        session.add(link)

    session.commit()
    primary = next((item for item in normalized if item.is_primary), normalized[0])
    return primary.department_id


def sync_gerencia_role(
    session: Session,
    *,
    profile: EmployeeProfile,
    primary_department_id: Optional[int],
) -> None:
    if not profile.user_id or not primary_department_id:
        return

    user = repo.get_user(session, profile.user_id)
    if not user or user.is_super_admin:
        return

    dept = repo.get_department(session, primary_department_id)
    if not dept or not dept.name:
        return

    dept_key = dept.name.strip().lower()
    is_gerencia = "gerencia" in dept_key

    role = session.get(Role, user.role_id) if user.role_id else None
    role_name = role.name if role else None
    if role_name == "tenant_admin":
        return

    roles = repo.list_roles_by_name(session, ["gerencia", "user"])
    by_name = {r.name: r for r in roles}
    gerencia_role = by_name.get("gerencia")
    user_role = by_name.get("user")
    if not gerencia_role or not user_role:
        return

    previous_role_id = user.role_id

    if is_gerencia and role_name != "gerencia":
        user.role_id = gerencia_role.id
        user.tokens_valid_after = datetime.now(timezone.utc)
        session.add(user)
        session.commit()
        invalidate_user_me_cache(user.id)
        if previous_role_id:
            invalidate_role_permissions_cache(previous_role_id)
        invalidate_role_permissions_cache(gerencia_role.id)
        return

    if not is_gerencia and role_name == "gerencia":
        user.role_id = user_role.id
        user.tokens_valid_after = datetime.now(timezone.utc)
        session.add(user)
        session.commit()
        invalidate_user_me_cache(user.id)
        if previous_role_id:
            invalidate_role_permissions_cache(previous_role_id)
        invalidate_role_permissions_cache(user_role.id)
