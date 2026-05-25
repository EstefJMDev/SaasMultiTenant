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
from app.models.user import User
from app.schemas.hr import EmployeeProfileRead, EmployeeProfileUpdate


def update_employee_profile(
    session: Session,
    current_user: User,
    profile_id: int,
    data: EmployeeProfileUpdate,
) -> EmployeeProfileRead:
    profile = repo.get_employee_profile(session, profile_id)
    if not profile:
        raise ValueError("Perfil de empleado no encontrado")

    ensure_same_tenant(profile.tenant_id, current_user)

    if data.email is not None:
        email = data.email.strip().lower() or None
        current_email = (profile.email or "").strip().lower() or None
        if email != current_email and email:
            existing_email = session.exec(
                select(EmployeeProfile).where(
                    EmployeeProfile.tenant_id == profile.tenant_id,
                    func.lower(EmployeeProfile.email) == email,
                    EmployeeProfile.id != profile.id,
                ),
            ).first()
            if existing_email:
                raise ValueError("Ya existe un empleado con ese correo en este tenant")

            existing_user_email = session.exec(
                select(User).where(
                    User.tenant_id == profile.tenant_id,
                    func.lower(User.email) == email,
                    User.id != profile.user_id,
                ),
            ).first()
            if existing_user_email:
                raise ValueError("El correo ya pertenece a un usuario del tenant")

        profile.email = email

    if data.position_id is not None:
        from app.models.hr import Position
        if data.position_id == 0:
            profile.position_id = None
            profile.director_tecnico_id = None
        else:
            pos = session.get(Position, data.position_id)
            if not pos or pos.tenant_id != profile.tenant_id:
                raise ValueError("El puesto debe pertenecer al mismo tenant")
            profile.position_id = data.position_id
            if (pos.role_code or "").upper() != "JO":
                profile.director_tecnico_id = None

    if data.director_tecnico_id is not None:
        from app.models.hr import Position
        if data.director_tecnico_id == 0:
            profile.director_tecnico_id = None
        else:
            target_position_id = profile.position_id
            target_position = (
                session.get(Position, target_position_id) if target_position_id else None
            )
            if not target_position or (target_position.role_code or "").upper() != "JO":
                raise ValueError(
                    "Solo los empleados con puesto Jefe de Obra (role_code='JO') pueden tener Director Técnico asignado"
                )

            if data.director_tecnico_id == profile.id:
                raise ValueError("Un empleado no puede ser su propio Director Técnico")

            dt = repo.get_employee_profile(session, data.director_tecnico_id)
            if not dt or dt.tenant_id != profile.tenant_id:
                raise ValueError("El Director Técnico debe pertenecer al mismo tenant")
            dt_pos = session.get(Position, dt.position_id) if dt.position_id else None
            if not dt_pos or (dt_pos.role_code or "").upper() != "DT":
                raise ValueError(
                    "El empleado seleccionado no tiene puesto de Director Técnico (role_code='DT')"
                )
            profile.director_tecnico_id = data.director_tecnico_id

    if data.titulacion is not None:
        profile.titulacion = data.titulacion
    if data.first_name is not None:
        profile.first_name = data.first_name.strip() or None
    if data.last_name is not None:
        profile.last_name = data.last_name.strip() or None
    if data.full_name is not None:
        profile.full_name = data.full_name.strip() or None
    profile.full_name = compose_employee_full_name(
        profile.first_name,
        profile.last_name,
        profile.full_name,
    )
    if data.hourly_rate is not None:
        profile.hourly_rate = data.hourly_rate
    if data.employment_type is not None:
        profile.employment_type = data.employment_type
    if data.hire_date is not None:
        profile.hire_date = data.hire_date
    if data.end_date is not None:
        profile.end_date = data.end_date
    if data.is_active is not None:
        profile.is_active = data.is_active
    if data.available_hours is not None:
        profile.available_hours = data.available_hours
    if data.availability_percentage is not None:
        profile.availability_percentage = data.availability_percentage

    session.add(profile)
    session.commit()
    session.refresh(profile)
    invalidate_user_me_cache(profile.user_id)

    primary_department_id: Optional[int] = None
    if data.department_allocations is not None:
        primary_department_id = set_employee_department_allocations(
            session,
            profile=profile,
            tenant_id=profile.tenant_id,
            allocations=data.department_allocations,
        )
    elif data.primary_department_id is not None:
        dept = repo.get_department(session, data.primary_department_id)
        if not dept or dept.tenant_id != profile.tenant_id:
            raise ValueError("El departamento principal debe pertenecer al tenant")

        existing = repo.list_employee_departments_by_employee_id(session, profile.id)
        for link in existing:
            link.is_primary = False
            session.add(link)

        link = session.exec(
            select(EmployeeDepartment).where(
                EmployeeDepartment.employee_id == profile.id,
                EmployeeDepartment.department_id == dept.id,
            ),
        ).one_or_none()
        if not link:
            link = EmployeeDepartment(
                employee_id=profile.id,
                department_id=dept.id,
                is_primary=True,
                allocation_percentage=Decimal(100),
            )
            session.add(link)
        else:
            link.is_primary = True
            if not link.allocation_percentage:
                link.allocation_percentage = Decimal(100)
            session.add(link)

        session.commit()
        primary_department_id = dept.id

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=profile.tenant_id,
        action="hr.employee.update",
        details=f"Perfil empleado actualizado id={profile.id}",
    )

    if primary_department_id is None:
        link = session.exec(
            select(EmployeeDepartment).where(
                EmployeeDepartment.employee_id == profile.id,
                EmployeeDepartment.is_primary.is_(True),
            ),
        ).one_or_none()
        if link:
            primary_department_id = link.department_id

    if primary_department_id is not None:
        sync_gerencia_role(
            session,
            profile=profile,
            primary_department_id=primary_department_id,
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
        full_name=profile.full_name,
        email=profile.email,
        hourly_rate=year_rate,
        available_hours=effective_hours,
        availability_percentage=year_pct,
        position_id=profile.position_id,
        director_tecnico_id=profile.director_tecnico_id,
        titulacion=profile.titulacion,
        employment_type=profile.employment_type,
        hire_date=profile.hire_date,
        end_date=profile.end_date,
        is_active=profile.is_active,
        created_at=profile.created_at,
        primary_department_id=primary_department_id,
        department_allocations=load_department_allocations(session, profile.id),
    )
