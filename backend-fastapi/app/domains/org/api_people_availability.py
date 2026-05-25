from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.db import get_db
from app.domains.org.schemas import EmployeeYearAvailabilityRead, EmployeeYearAvailabilityUpsert
from app.domains.org.service_people_availability import (
    list_employee_year_availability,
    upsert_employee_year_availability,
)
from app.models.user import User
from app.platform.tools.deps import require_perm


router = APIRouter()


@router.get("/{profile_id}/availability", response_model=list[EmployeeYearAvailabilityRead])
def api_list_person_availability(
    profile_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:people:read")),
) -> list[EmployeeYearAvailabilityRead]:
    try:
        return list_employee_year_availability(
            session=session,
            current_user=current_user,
            profile_id=profile_id,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/{profile_id}/availability/{year}", response_model=EmployeeYearAvailabilityRead)
def api_upsert_person_availability(
    profile_id: int,
    year: int,
    data: EmployeeYearAvailabilityUpsert,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm("org:people:write")),
) -> EmployeeYearAvailabilityRead:
    try:
        return upsert_employee_year_availability(
            session=session,
            current_user=current_user,
            profile_id=profile_id,
            year=year,
            data=data,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        detail = str(exc)
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "no encontrado" in detail.lower()
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
