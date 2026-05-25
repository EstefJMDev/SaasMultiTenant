from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlmodel import Session

from app.domains.org import repo
from app.domains.org.service_people_helpers import (
    apply_department_hours,
    resolve_department_project_percentage,
    resolve_employee_availability_for_year,
)
from app.models.hr import EmployeeAllocation
from app.models.user import User
from app.schemas.hr import (
    EmployeeAllocationCreate,
    EmployeeAllocationRead,
    EmployeeAllocationUpdate,
)


def _ensure_same_tenant(tenant_id: int, user: User) -> None:
    if user.is_super_admin:
        return
    if not user.tenant_id or user.tenant_id != tenant_id:
        raise PermissionError("No tienes permisos para gestionar este tenant")


def _resolve_primary_department_id(session: Session, employee_id: int) -> Optional[int]:
    links = repo.list_employee_departments_by_employee_id(session, employee_id)
    primary = next((link for link in links if link.is_primary), None)
    if primary:
        return primary.department_id
    if links:
        return links[0].department_id
    return None


def _validate_employee_allocation_capacity(
    session: Session,
    *,
    tenant_id: int,
    employee_id: int,
    year: int,
    allocated_hours: Optional[Decimal],
    department_id: Optional[int],
    exclude_allocation_id: Optional[int] = None,
    override_limit_authorized: bool = False,
) -> None:
    if allocated_hours is None:
        return

    profile = repo.get_employee_profile(session, employee_id)
    if not profile or profile.tenant_id != tenant_id:
        raise ValueError("Empleado no encontrado en el tenant indicado")

    target_department_id = department_id or _resolve_primary_department_id(session, employee_id)
    department_percentage = Decimal(100)
    if target_department_id is not None:
        department = repo.get_department(session, target_department_id)
        if department and department.tenant_id == tenant_id:
            department_percentage = resolve_department_project_percentage(department)

    year_hours, year_pct, _ = resolve_employee_availability_for_year(
        session,
        profile=profile,
        year=year,
    )
    max_hours = apply_department_hours(year_hours, year_pct, department_percentage)
    if max_hours is None:
        return

    existing_total = repo.sum_employee_allocated_hours_by_year(
        session,
        tenant_id=tenant_id,
        employee_id=employee_id,
        year=year,
        exclude_allocation_id=exclude_allocation_id,
    )
    next_total = Decimal(existing_total) + Decimal(allocated_hours)
    if next_total > Decimal(max_hours):
        if override_limit_authorized:
            return
        raise ValueError(
            "Las horas asignadas superan el maximo justificable del empleado para ese anio. "
            "Confirma autorizacion para continuar."
        )


def list_employee_allocations(
    session: Session,
    current_user: User,
    tenant_id: Optional[int] = None,
    project_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    year: Optional[int] = None,
) -> list[EmployeeAllocationRead]:
    if not current_user.is_super_admin:
        tenant_id = current_user.tenant_id

    allocations = repo.list_employee_allocations(
        session,
        tenant_id=tenant_id,
        project_id=project_id,
        employee_id=employee_id,
        year=year,
    )
    return [
        EmployeeAllocationRead(
            id=a.id,
            tenant_id=a.tenant_id,
            employee_id=a.employee_id,
            department_id=a.department_id,
            project_id=a.project_id,
            milestone=a.milestone,
            year=a.year,
            allocated_hours=a.allocated_hours,
            allocation_percentage=a.allocation_percentage,
            notes=a.notes,
            created_at=a.created_at,
            updated_at=a.updated_at,
        )
        for a in allocations
    ]


def create_employee_allocation(
    session: Session,
    current_user: User,
    data: EmployeeAllocationCreate,
) -> EmployeeAllocationRead:
    _ensure_same_tenant(data.tenant_id, current_user)
    _validate_employee_allocation_capacity(
        session,
        tenant_id=data.tenant_id,
        employee_id=data.employee_id,
        year=data.year,
        allocated_hours=data.allocated_hours,
        department_id=data.department_id,
        override_limit_authorized=bool(data.override_limit_authorized),
    )

    allocation = EmployeeAllocation(
        tenant_id=data.tenant_id,
        employee_id=data.employee_id,
        department_id=data.department_id,
        project_id=data.project_id,
        milestone=data.milestone,
        year=data.year,
        allocated_hours=data.allocated_hours,
        allocation_percentage=data.allocation_percentage,
        notes=data.notes,
    )
    session.add(allocation)
    session.commit()
    session.refresh(allocation)

    return EmployeeAllocationRead(
        id=allocation.id,
        tenant_id=allocation.tenant_id,
        employee_id=allocation.employee_id,
        department_id=allocation.department_id,
        project_id=allocation.project_id,
        milestone=allocation.milestone,
        year=allocation.year,
        allocated_hours=allocation.allocated_hours,
        allocation_percentage=allocation.allocation_percentage,
        notes=allocation.notes,
        created_at=allocation.created_at,
        updated_at=allocation.updated_at,
    )


def update_employee_allocation(
    session: Session,
    current_user: User,
    allocation_id: int,
    data: EmployeeAllocationUpdate,
) -> EmployeeAllocationRead:
    allocation = repo.get_employee_allocation(session, allocation_id)
    if not allocation:
        raise ValueError("Asignacion no encontrada")
    _ensure_same_tenant(allocation.tenant_id, current_user)

    next_department_id = (
        data.department_id if data.department_id is not None else allocation.department_id
    )
    next_year = data.year if data.year is not None else allocation.year
    next_allocated_hours = (
        data.allocated_hours if data.allocated_hours is not None else allocation.allocated_hours
    )
    _validate_employee_allocation_capacity(
        session,
        tenant_id=allocation.tenant_id,
        employee_id=allocation.employee_id,
        year=next_year,
        allocated_hours=next_allocated_hours,
        department_id=next_department_id,
        exclude_allocation_id=allocation.id,
        override_limit_authorized=bool(data.override_limit_authorized),
    )

    if data.department_id is not None:
        allocation.department_id = data.department_id
    if data.project_id is not None:
        allocation.project_id = data.project_id
    if data.milestone is not None:
        allocation.milestone = data.milestone
    if data.year is not None:
        allocation.year = data.year
    if data.allocated_hours is not None:
        allocation.allocated_hours = data.allocated_hours
    if data.allocation_percentage is not None:
        allocation.allocation_percentage = data.allocation_percentage
    if data.notes is not None:
        allocation.notes = data.notes

    allocation.updated_at = datetime.now(timezone.utc)
    session.add(allocation)
    session.commit()
    session.refresh(allocation)

    return EmployeeAllocationRead(
        id=allocation.id,
        tenant_id=allocation.tenant_id,
        employee_id=allocation.employee_id,
        department_id=allocation.department_id,
        project_id=allocation.project_id,
        milestone=allocation.milestone,
        year=allocation.year,
        allocated_hours=allocation.allocated_hours,
        allocation_percentage=allocation.allocation_percentage,
        notes=allocation.notes,
        created_at=allocation.created_at,
        updated_at=allocation.updated_at,
    )


def delete_employee_allocation(
    session: Session,
    current_user: User,
    allocation_id: int,
) -> None:
    allocation = repo.get_employee_allocation(session, allocation_id)
    if not allocation:
        raise ValueError("Asignacion no encontrada")
    _ensure_same_tenant(allocation.tenant_id, current_user)
    session.delete(allocation)
    session.commit()
