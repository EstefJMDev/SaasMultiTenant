from sqlmodel import Session

from app.domains.org import repo
from app.domains.org.service_people_helpers import ensure_same_tenant
from app.models.user import User
from app.schemas.hr import EmployeeYearAvailabilityRead, EmployeeYearAvailabilityUpsert


def list_employee_year_availability(
    session: Session,
    current_user: User,
    profile_id: int,
) -> list[EmployeeYearAvailabilityRead]:
    profile = repo.get_employee_profile(session, profile_id)
    if not profile:
        raise ValueError("Perfil de empleado no encontrado")
    ensure_same_tenant(profile.tenant_id, current_user)

    rows = repo.list_employee_year_availability(session, employee_id=profile_id)
    return [
        EmployeeYearAvailabilityRead(
            id=row.id,
            tenant_id=row.tenant_id,
            employee_id=row.employee_id,
            year=row.year,
            available_hours=row.available_hours,
            availability_percentage=row.availability_percentage,
            hourly_rate=row.hourly_rate,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


def upsert_employee_year_availability(
    session: Session,
    current_user: User,
    profile_id: int,
    year: int,
    data: EmployeeYearAvailabilityUpsert,
) -> EmployeeYearAvailabilityRead:
    profile = repo.get_employee_profile(session, profile_id)
    if not profile:
        raise ValueError("Perfil de empleado no encontrado")
    ensure_same_tenant(profile.tenant_id, current_user)

    if data.year != year:
        raise ValueError("El anio del path debe coincidir con el payload")

    row = repo.upsert_employee_year_availability(
        session,
        tenant_id=profile.tenant_id,
        employee_id=profile_id,
        year=year,
        available_hours=data.available_hours,
        availability_percentage=data.availability_percentage,
        hourly_rate=data.hourly_rate,
    )
    return EmployeeYearAvailabilityRead(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        year=row.year,
        available_hours=row.available_hours,
        availability_percentage=row.availability_percentage,
        hourly_rate=row.hourly_rate,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )
