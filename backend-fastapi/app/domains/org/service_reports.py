from typing import Optional

from sqlmodel import Session

from app.domains.org import repo
from app.models.user import User
from app.schemas.hr import HeadcountItem


def get_headcount_by_department(
    session: Session,
    current_user: User,
    tenant_id: Optional[int] = None,
) -> list[HeadcountItem]:
    if not current_user.is_super_admin:
        tenant_id = current_user.tenant_id
    elif tenant_id is None:
        return []

    if tenant_id is None:
        return []

    rows = repo.headcount_rows(session, tenant_id)
    return [
        HeadcountItem(
            department_id=row[0],
            department_name=row[1],
            total_employees=row[2],
        )
        for row in rows
    ]
