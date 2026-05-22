from datetime import datetime
from typing import Optional

from sqlmodel import Session

from app.domains.time import repo
from app.models.user import User


def get_active_tracking(session: Session, user: User, tenant_id: Optional[int]):
    return repo.get_active_session(session, user, tenant_id)


def start_tracking(
    session: Session,
    user: User,
    *,
    task_id: Optional[int],
    tenant_id: Optional[int],
    payload_tenant_id: Optional[int] = None,
):
    return repo.start_session(
        session,
        user,
        task_id=task_id,
        tenant_id=tenant_id,
        payload_tenant_id=payload_tenant_id,
    )


def stop_tracking(session: Session, user: User, tenant_id: Optional[int]):
    tracked = repo.stop_session(session, user, tenant_id)
    if not tracked:
        raise ValueError("No hay sesion activa.")
    return tracked


def list_sessions(
    session: Session,
    user: User,
    *,
    tenant_id: Optional[int],
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
):
    return repo.list_sessions(
        session,
        user,
        tenant_id=tenant_id,
        date_from=date_from,
        date_to=date_to,
    )


def create_manual_session(
    session: Session,
    user: User,
    *,
    task_id: Optional[int],
    description: Optional[str],
    started_at: datetime,
    ended_at: datetime,
    tenant_id: Optional[int],
):
    return repo.create_manual_session(
        session,
        user,
        task_id=task_id,
        description=description,
        started_at=started_at,
        ended_at=ended_at,
        tenant_id=tenant_id,
    )


def update_session(
    session: Session,
    user: User,
    *,
    session_id: int,
    task_id: Optional[int],
    task_id_provided: bool,
    description: Optional[str],
    started_at: Optional[datetime],
    ended_at: Optional[datetime],
    tenant_id: Optional[int],
):
    return repo.update_session(
        session,
        user,
        session_id=session_id,
        task_id=task_id,
        task_id_provided=task_id_provided,
        description=description,
        started_at=started_at,
        ended_at=ended_at,
        tenant_id=tenant_id,
    )


def delete_session(
    session: Session,
    user: User,
    *,
    session_id: int,
    tenant_id: Optional[int],
) -> None:
    repo.delete_session(
        session,
        user,
        session_id=session_id,
        tenant_id=tenant_id,
    )


def get_reports(
    session: Session,
    *,
    tenant_id: Optional[int],
    project_id: Optional[int],
    user_id: Optional[int],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
):
    return repo.get_report(
        session,
        tenant_id=tenant_id,
        project_id=project_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )


def get_reports_by_department(
    session: Session,
    *,
    tenant_id: Optional[int],
    project_id: Optional[int],
    user_id: Optional[int],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
):
    return repo.get_report_by_department(
        session,
        tenant_id=tenant_id,
        project_id=project_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )
