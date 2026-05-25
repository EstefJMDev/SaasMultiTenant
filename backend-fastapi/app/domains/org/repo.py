from datetime import datetime, timezone
from decimal import Decimal
from typing import Iterable, Optional

from sqlmodel import Session, select, func

from app.platform.contracts_core.models import ContractWorkflowApproval, ContractWorkflowStep
from app.domains.invoices.models import Invoice
from app.models.erp import Project, TimeEntryDepartmentSplit
from app.models.hr import (
    Department,
    EmployeeAllocation,
    EmployeeDepartment,
    EmployeeProfile,
    EmployeeYearAvailability,
)
from app.models.role import Role
from app.models.user import User


def get_department(session: Session, dept_id: int) -> Optional[Department]:
    return session.get(Department, dept_id)


def list_departments(session: Session, tenant_id: Optional[int]) -> list[Department]:
    stmt = select(Department)
    if tenant_id is not None:
        stmt = stmt.where(Department.tenant_id == tenant_id)
    return session.exec(stmt).all()


def list_employee_profiles(
    session: Session,
    tenant_id: Optional[int],
    limit: int = 500,
    offset: int = 0,
) -> list[EmployeeProfile]:
    stmt = select(EmployeeProfile)
    if tenant_id is not None:
        stmt = stmt.where(EmployeeProfile.tenant_id == tenant_id)
    stmt = stmt.offset(offset).limit(limit)
    return session.exec(stmt).all()


def get_employee_profile(session: Session, profile_id: int) -> Optional[EmployeeProfile]:
    return session.get(EmployeeProfile, profile_id)


def get_employee_year_availability(
    session: Session,
    *,
    employee_id: int,
    year: int,
) -> Optional[EmployeeYearAvailability]:
    return session.exec(
        select(EmployeeYearAvailability).where(
            EmployeeYearAvailability.employee_id == employee_id,
            EmployeeYearAvailability.year == year,
        )
    ).one_or_none()


def list_employee_year_availability(
    session: Session,
    *,
    employee_id: int,
) -> list[EmployeeYearAvailability]:
    return session.exec(
        select(EmployeeYearAvailability)
        .where(EmployeeYearAvailability.employee_id == employee_id)
        .order_by(EmployeeYearAvailability.year.asc())
    ).all()


def list_employee_year_availabilities_for_year(
    session: Session,
    *,
    employee_ids: Iterable[int],
    year: int,
) -> list[EmployeeYearAvailability]:
    """Batch fetch EmployeeYearAvailability for multiple employees in a single query."""
    ids = list(employee_ids)
    if not ids:
        return []
    return session.exec(
        select(EmployeeYearAvailability).where(
            EmployeeYearAvailability.employee_id.in_(ids),
            EmployeeYearAvailability.year == year,
        )
    ).all()


def upsert_employee_year_availability(
    session: Session,
    *,
    tenant_id: int,
    employee_id: int,
    year: int,
    available_hours: Optional[Decimal],
    availability_percentage: Optional[Decimal],
    hourly_rate: Optional[Decimal],
) -> EmployeeYearAvailability:
    record = get_employee_year_availability(
        session,
        employee_id=employee_id,
        year=year,
    )
    if record is None:
        record = EmployeeYearAvailability(
            tenant_id=tenant_id,
            employee_id=employee_id,
            year=year,
            available_hours=available_hours,
            availability_percentage=availability_percentage,
            hourly_rate=hourly_rate,
        )
    else:
        record.available_hours = available_hours
        record.availability_percentage = availability_percentage
        record.hourly_rate = hourly_rate
        record.updated_at = datetime.now(timezone.utc)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def list_employee_allocations(
    session: Session,
    *,
    tenant_id: Optional[int],
    project_id: Optional[int],
    employee_id: Optional[int],
    year: Optional[int],
) -> list[EmployeeAllocation]:
    stmt = select(EmployeeAllocation)
    if tenant_id is not None:
        stmt = stmt.where(EmployeeAllocation.tenant_id == tenant_id)
    if project_id is not None:
        stmt = stmt.where(EmployeeAllocation.project_id == project_id)
    if employee_id is not None:
        stmt = stmt.where(EmployeeAllocation.employee_id == employee_id)
    if year is not None:
        stmt = stmt.where(EmployeeAllocation.year == year)
    return session.exec(stmt).all()


def get_employee_allocation(session: Session, allocation_id: int) -> Optional[EmployeeAllocation]:
    return session.get(EmployeeAllocation, allocation_id)


def sum_employee_allocated_hours_by_year(
    session: Session,
    *,
    tenant_id: int,
    employee_id: int,
    year: int,
    exclude_allocation_id: Optional[int] = None,
) -> Decimal:
    stmt = select(func.coalesce(func.sum(EmployeeAllocation.allocated_hours), 0)).where(
        EmployeeAllocation.tenant_id == tenant_id,
        EmployeeAllocation.employee_id == employee_id,
        EmployeeAllocation.year == year,
    )
    if exclude_allocation_id is not None:
        stmt = stmt.where(EmployeeAllocation.id != exclude_allocation_id)
    total = session.exec(stmt).one()
    return Decimal(total or 0)


def list_employee_departments_by_employee_id(
    session: Session,
    employee_id: int,
) -> list[EmployeeDepartment]:
    return session.exec(
        select(EmployeeDepartment).where(EmployeeDepartment.employee_id == employee_id),
    ).all()


def list_employee_departments_by_employee_ids(
    session: Session,
    employee_ids: Iterable[int],
) -> list[EmployeeDepartment]:
    return session.exec(
        select(EmployeeDepartment).where(EmployeeDepartment.employee_id.in_(list(employee_ids))),
    ).all()


def list_departments_by_ids(session: Session, dept_ids: Iterable[int]) -> list[Department]:
    return session.exec(select(Department).where(Department.id.in_(list(dept_ids)))).all()


def list_users_by_ids(session: Session, user_ids: Iterable[int]) -> list[User]:
    return session.exec(select(User).where(User.id.in_(list(user_ids)))).all()


def get_user(session: Session, user_id: int) -> Optional[User]:
    return session.get(User, user_id)


def list_roles_by_name(session: Session, names: Iterable[str]) -> list[Role]:
    return session.exec(select(Role).where(Role.name.in_(list(names)))).all()


def count_department_links(session: Session, dept_id: int) -> list[tuple[str, int]]:
    return [
        (
            "empleados",
            int(
                session.exec(
                    select(func.count()).select_from(EmployeeDepartment).where(
                        EmployeeDepartment.department_id == dept_id
                    )
                ).one()
                or 0
            ),
        ),
        (
            "asignaciones",
            int(
                session.exec(
                    select(func.count()).select_from(EmployeeAllocation).where(
                        EmployeeAllocation.department_id == dept_id
                    )
                ).one()
                or 0
            ),
        ),
        (
            "proyectos",
            int(
                session.exec(
                    select(func.count()).select_from(Project).where(Project.department_id == dept_id)
                ).one()
                or 0
            ),
        ),
        (
            "facturas",
            int(
                session.exec(
                    select(func.count()).select_from(Invoice).where(Invoice.department_id == dept_id)
                ).one()
                or 0
            ),
        ),
        (
            "repartos de horas",
            int(
                session.exec(
                    select(func.count()).select_from(TimeEntryDepartmentSplit).where(
                        TimeEntryDepartmentSplit.department_id == dept_id
                    )
                ).one()
                or 0
            ),
        ),
        (
            "flujo de contratos",
            int(
                session.exec(
                    select(func.count()).select_from(ContractWorkflowStep).where(
                        ContractWorkflowStep.department_id == dept_id
                    )
                ).one()
                or 0
            ),
        ),
        (
            "aprobaciones de contratos",
            int(
                session.exec(
                    select(func.count()).select_from(ContractWorkflowApproval).where(
                        ContractWorkflowApproval.department_id == dept_id
                    )
                ).one()
                or 0
            ),
        ),
    ]


def list_department_links(
    session: Session,
    dept_id: int,
) -> dict[str, list]:
    return {
        "employee_departments": session.exec(
            select(EmployeeDepartment).where(EmployeeDepartment.department_id == dept_id)
        ).all(),
        "allocations": session.exec(
            select(EmployeeAllocation).where(EmployeeAllocation.department_id == dept_id)
        ).all(),
        "projects": session.exec(
            select(Project).where(Project.department_id == dept_id)
        ).all(),
        "invoices": session.exec(
            select(Invoice).where(Invoice.department_id == dept_id)
        ).all(),
        "splits": session.exec(
            select(TimeEntryDepartmentSplit).where(TimeEntryDepartmentSplit.department_id == dept_id)
        ).all(),
        "workflow_steps": session.exec(
            select(ContractWorkflowStep).where(ContractWorkflowStep.department_id == dept_id)
        ).all(),
        "workflow_approvals": session.exec(
            select(ContractWorkflowApproval).where(ContractWorkflowApproval.department_id == dept_id)
        ).all(),
    }


def headcount_rows(session: Session, tenant_id: int) -> list[tuple[int, str, int]]:
    stmt = (
        select(
            EmployeeDepartment.department_id,
            Department.name,
            func.count(EmployeeProfile.id),
        )
        .join(EmployeeProfile, EmployeeProfile.id == EmployeeDepartment.employee_id)
        .join(Department, Department.id == EmployeeDepartment.department_id)
        .where(
            EmployeeProfile.tenant_id == tenant_id,
            EmployeeProfile.is_active.is_(True),
            Department.is_active.is_(True),
        )
        .group_by(EmployeeDepartment.department_id, Department.name)
    )
    return session.exec(stmt).all()


def normalize_decimal(value: Optional[Decimal]) -> Decimal:
    return Decimal(100) if value is None else Decimal(value)


