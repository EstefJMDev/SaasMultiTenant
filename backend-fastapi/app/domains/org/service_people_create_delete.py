from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select, func

from app.core.audit import log_action
from app.core.user_me_cache import invalidate_user_me_cache
from app.domains.org import repo
from app.domains.org.service_people_helpers import (
    apply_department_hours,
    compose_employee_full_name,
    ensure_same_tenant,
    load_department_allocations,
    resolve_department_project_percentage,
    resolve_employee_availability_for_year,
    set_employee_department_allocations,
    sync_gerencia_role,
)
from app.models.hr import EmployeeDepartment, EmployeeProfile
from app.models.erp import TimeEntry, TimeSession
from app.models.hr import EmployeeAllocation, EmployeeYearAvailability
from app.models.user import User
from app.schemas.hr import EmployeeProfileCreate, EmployeeProfileRead


def create_employee_profile(
    session: Session,
    current_user: User,
    tenant_id: int,
    data: EmployeeProfileCreate,
) -> EmployeeProfileRead:
    ensure_same_tenant(tenant_id, current_user)

    user = None
    if data.user_id is not None:
        user = repo.get_user(session, data.user_id)
        if not user or user.tenant_id != tenant_id:
            raise ValueError("El usuario debe pertenecer al tenant")

        existing = session.exec(
            select(EmployeeProfile).where(
                EmployeeProfile.user_id == user.id,
                EmployeeProfile.is_active.is_(True),
            ),
        ).one_or_none()
        if existing:
            raise ValueError("Ya existe un perfil de empleado activo para este usuario")
    else:
        if not ((data.first_name and data.first_name.strip()) or (data.full_name and data.full_name.strip())):
            raise ValueError("El nombre es obligatorio si no hay usuario asociado")

    first_name = (data.first_name or "").strip() or None
    last_name = (data.last_name or "").strip() or None
    full_name = compose_employee_full_name(
        first_name,
        last_name,
        data.full_name or (user.full_name if user else None),
    )

    email_value = data.email or (user.email if user else None)
    email = (email_value or "").strip().lower() or None
    if email:
        existing_email = session.exec(
            select(EmployeeProfile).where(
                EmployeeProfile.tenant_id == tenant_id,
                func.lower(EmployeeProfile.email) == email,
            ),
        ).one_or_none()
        if existing_email:
            raise ValueError("Ya existe un empleado con ese correo en este tenant")

        existing_user_email = session.exec(
            select(User).where(
                User.tenant_id == tenant_id,
                func.lower(User.email) == email,
            ),
        ).one_or_none()
        if existing_user_email and (not user or existing_user_email.id != user.id):
            raise ValueError("El correo ya pertenece a un usuario del tenant")

    position_id_value: Optional[int] = None
    if data.position_id:
        from app.models.hr import Position
        pos = session.get(Position, data.position_id)
        if not pos or pos.tenant_id != tenant_id:
            raise ValueError("El puesto debe pertenecer al mismo tenant")
        position_id_value = data.position_id

    profile = EmployeeProfile(
        tenant_id=tenant_id,
        user_id=user.id if user else None,
        first_name=first_name,
        last_name=last_name,
        full_name=full_name,
        email=email,
        hourly_rate=data.hourly_rate,
        available_hours=data.available_hours,
        availability_percentage=data.availability_percentage,
        position_id=position_id_value,
        titulacion=data.titulacion,
        employment_type=data.employment_type,
        hire_date=data.hire_date,
        end_date=data.end_date,
        is_active=data.is_active,
    )
    session.add(profile)
    session.commit()
    session.refresh(profile)
    invalidate_user_me_cache(profile.user_id)

    primary_department_id: Optional[int] = None
    if data.department_allocations:
        primary_department_id = set_employee_department_allocations(
            session,
            profile=profile,
            tenant_id=tenant_id,
            allocations=data.department_allocations,
        )
    elif data.primary_department_id is not None:
        dept = repo.get_department(session, data.primary_department_id)
        if not dept or dept.tenant_id != tenant_id:
            raise ValueError("El departamento principal debe pertenecer al tenant")
        session.add(
            EmployeeDepartment(
                employee_id=profile.id,
                department_id=dept.id,
                is_primary=True,
                allocation_percentage=Decimal(100),
            ),
        )
        session.commit()
        primary_department_id = data.primary_department_id
    if primary_department_id is not None:
        sync_gerencia_role(
            session,
            profile=profile,
            primary_department_id=primary_department_id,
        )

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="hr.employee.create",
        details=(
            f"Perfil empleado creado para user_id={user.id}"
            if user
            else f"Perfil empleado creado para {profile.full_name}"
        ),
    )

    dept_percentage = None
    if primary_department_id is not None:
        dept = repo.get_department(session, primary_department_id)
        if dept:
            dept_percentage = resolve_department_project_percentage(dept)
    target_year = datetime.now(timezone.utc).year
    year_hours, year_pct, year_rate = resolve_employee_availability_for_year(
        session,
        profile=profile,
        year=target_year,
    )
    effective_hours = apply_department_hours(
        year_hours,
        year_pct,
        dept_percentage,
    )

    return EmployeeProfileRead(
        id=profile.id,
        tenant_id=profile.tenant_id,
        user_id=profile.user_id,
        first_name=profile.first_name,
        last_name=profile.last_name,
        full_name=profile.full_name or (user.full_name if user else None),
        email=profile.email or (user.email if user else None),
        hourly_rate=year_rate,
        available_hours=effective_hours,
        availability_percentage=year_pct,
        position_id=profile.position_id,
        titulacion=profile.titulacion,
        employment_type=profile.employment_type,
        hire_date=profile.hire_date,
        end_date=profile.end_date,
        is_active=profile.is_active,
        created_at=profile.created_at,
        primary_department_id=primary_department_id,
        department_allocations=load_department_allocations(session, profile.id),
    )


def delete_employee_profile(
    session: Session,
    current_user: User,
    profile_id: int,
) -> None:
    profile = repo.get_employee_profile(session, profile_id)
    if not profile:
        raise ValueError("Perfil de empleado no encontrado")

    ensure_same_tenant(profile.tenant_id, current_user)

    allocations_count = int(
        session.exec(
            select(func.count())
            .select_from(EmployeeAllocation)
            .where(EmployeeAllocation.employee_id == profile.id),
        ).one()
        or 0
    )
    time_entries_count = 0
    time_sessions_count = 0
    if profile.user_id is not None:
        time_entries_count = int(
            session.exec(
                select(func.count())
                .select_from(TimeEntry)
                .where(TimeEntry.user_id == profile.user_id),
            ).one()
            or 0
        )
        time_sessions_count = int(
            session.exec(
                select(func.count())
                .select_from(TimeSession)
                .where(TimeSession.user_id == profile.user_id),
            ).one()
            or 0
        )

    has_historical_data = (
        allocations_count > 0
        or time_entries_count > 0
        or time_sessions_count > 0
    )

    if has_historical_data:
        # Preserve historical allocations/time records; deactivate profile instead of hard delete.
        profile.is_active = False
        if profile.end_date is None:
            profile.end_date = datetime.now(timezone.utc)
    else:
        links = repo.list_employee_departments_by_employee_id(session, profile.id)
        for link in links:
            session.delete(link)
        yearly_rows = session.exec(
            select(EmployeeYearAvailability).where(
                EmployeeYearAvailability.employee_id == profile.id
            )
        ).all()
        for yearly in yearly_rows:
            session.delete(yearly)
        # Flush explícito para que los DELETE de availability se envíen a la BD
        # antes que el DELETE del profile. SQLAlchemy no conoce la relación
        # (no está declarada como relationship) y puede emitir los statements
        # en el orden equivocado, lo que provoca ForeignKeyViolation.
        session.flush()
        session.delete(profile)
    session.commit()
    invalidate_user_me_cache(profile.user_id)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=profile.tenant_id,
        action="hr.employee.delete",
        details=(
            f"Perfil empleado desactivado id={profile.id} por datos historicos"
            if has_historical_data
            else f"Perfil empleado eliminado id={profile.id}"
        ),
    )
