from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from app.domains.org import repo
from app.domains.org.service_people_helpers import (
    apply_department_hours,
    compose_employee_full_name,
    resolve_department_project_percentage,
)
from app.models.hr import EmployeeProfile, Position
from app.models.user import User
from app.schemas.hr import EmployeeDepartmentAllocationRead, EmployeeProfileRead


def list_directores_tecnicos(
    session: Session,
    current_user: User,
    tenant_id: Optional[int] = None,
) -> list[dict]:
    """Devuelve [{id, full_name}] de empleados activos cuyo puesto tiene role_code='DT'."""
    if not current_user.is_super_admin:
        tenant_id = current_user.tenant_id

    stmt = (
        select(EmployeeProfile, Position)
        .join(Position, Position.id == EmployeeProfile.position_id)
        .where(
            Position.role_code == "DT",
            Position.is_active.is_(True),
            EmployeeProfile.is_active.is_(True),
        )
    )
    if tenant_id is not None:
        stmt = stmt.where(EmployeeProfile.tenant_id == tenant_id)

    rows = session.exec(stmt).all()
    result: list[dict] = []
    for emp, _pos in rows:
        display = compose_employee_full_name(emp.first_name, emp.last_name, emp.full_name)
        result.append({"id": emp.id, "full_name": display or emp.email or f"Empleado {emp.id}"})
    result.sort(key=lambda r: (r["full_name"] or "").lower())
    return result


def list_employee_profiles(
    session: Session,
    current_user: User,
    tenant_id: Optional[int] = None,
    year: Optional[int] = None,
    limit: int = 500,
    offset: int = 0,
) -> list[EmployeeProfileRead]:
    if not current_user.is_super_admin:
        tenant_id = current_user.tenant_id
    profiles = repo.list_employee_profiles(session, tenant_id, limit=limit, offset=offset)

    user_ids = [p.user_id for p in profiles if p.user_id]
    user_map = {u.id: u for u in repo.list_users_by_ids(session, user_ids)} if user_ids else {}

    if profiles:
        emp_ids = [p.id for p in profiles]
        links = repo.list_employee_departments_by_employee_ids(session, emp_ids)
        allocations_by_emp: dict[int, list[EmployeeDepartmentAllocationRead]] = {}
        primary_by_emp: dict[int, int] = {}
        for link in links:
            allocations_by_emp.setdefault(link.employee_id, []).append(
                EmployeeDepartmentAllocationRead(
                    department_id=link.department_id,
                    percentage=link.allocation_percentage or Decimal(100),
                    is_primary=bool(link.is_primary),
                )
            )
            if link.is_primary:
                primary_by_emp[link.employee_id] = link.department_id
        for emp_id, allocs in allocations_by_emp.items():
            if emp_id not in primary_by_emp and allocs:
                top = sorted(allocs, key=lambda a: Decimal(a.percentage), reverse=True)[0]
                primary_by_emp[emp_id] = top.department_id
    else:
        allocations_by_emp = {}
        primary_by_emp = {}

    target_year = year or datetime.now(timezone.utc).year

    dept_percentages: dict[int, Decimal] = {}
    if primary_by_emp:
        dept_ids = list({dept_id for dept_id in primary_by_emp.values() if dept_id})
        if dept_ids:
            depts = repo.list_departments_by_ids(session, dept_ids)
            dept_percentages = {
                d.id: resolve_department_project_percentage(d) for d in depts
            }

    # Batch load year availability for all employees — avoids N+1.
    emp_ids_for_year = [p.id for p in profiles]
    year_avail_map: dict[int, object] = {}
    if emp_ids_for_year:
        year_avail_rows = repo.list_employee_year_availabilities_for_year(
            session, employee_ids=emp_ids_for_year, year=target_year
        )
        year_avail_map = {row.employee_id: row for row in year_avail_rows}

    result: list[EmployeeProfileRead] = []
    for p in profiles:
        annual = year_avail_map.get(p.id)
        if annual:
            year_hours, year_pct, year_rate = annual.available_hours, annual.availability_percentage, annual.hourly_rate
        else:
            year_hours, year_pct, year_rate = p.available_hours, p.availability_percentage, p.hourly_rate
        dept_percentage = dept_percentages.get(primary_by_emp.get(p.id, 0))
        effective_hours = apply_department_hours(
            year_hours,
            year_pct,
            dept_percentage,
        )
        result.append(
            EmployeeProfileRead(
                id=p.id,
                tenant_id=p.tenant_id,
                user_id=p.user_id,
                first_name=p.first_name,
                last_name=p.last_name,
                full_name=compose_employee_full_name(
                    p.first_name,
                    p.last_name,
                    p.full_name or (user_map.get(p.user_id).full_name if p.user_id else None),
                ),
                email=p.email or (user_map.get(p.user_id).email if p.user_id else None),
                hourly_rate=year_rate,
                available_hours=effective_hours,
                availability_percentage=year_pct,
                position_id=p.position_id,
                director_tecnico_id=p.director_tecnico_id,
                titulacion=p.titulacion,
                employment_type=p.employment_type,
                hire_date=p.hire_date,
                end_date=p.end_date,
                is_active=p.is_active,
                created_at=p.created_at,
                primary_department_id=primary_by_emp.get(p.id),
                department_allocations=allocations_by_emp.get(p.id, []),
            ),
        )

    return result
