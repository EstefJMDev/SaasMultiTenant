from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from sqlmodel import Session

from app.domains.time.repo import get_report
from app.models.erp import Project, Task, TimeEntry, TimeSession
from app.models.tenant import Tenant
from app.models.user import User


def test_get_report_filters_by_work_date_not_entry_created_at(
    db_session_fixture: Session,
) -> None:
    tenant = Tenant(
        name="Tenant Time Filter",
        subdomain=f"time-filter-{uuid4().hex[:8]}",
        is_active=True,
    )
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    user = User(
        email=f"time-filter-{uuid4().hex[:8]}@example.com",
        full_name="Time Filter User",
        hashed_password="unused-in-tests",
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)

    project = Project(
        tenant_id=tenant.id,
        name="Proyecto Time Filter",
    )
    db_session_fixture.add(project)
    db_session_fixture.commit()
    db_session_fixture.refresh(project)

    task = Task(
        id=9001,
        tenant_id=tenant.id,
        project_id=project.id,
        title="Tarea Time Filter",
    )
    db_session_fixture.add(task)

    work_started = datetime(2026, 2, 10, 9, 0, tzinfo=timezone.utc)
    entry_created = datetime(2026, 3, 12, 12, 0, tzinfo=timezone.utc)

    time_session = TimeSession(
        id=9101,
        tenant_id=tenant.id,
        task_id=task.id,
        user_id=user.id,
        started_at=work_started,
        ended_at=work_started + timedelta(hours=2),
        duration_seconds=7200,
        is_active=False,
        created_at=entry_created,
    )
    db_session_fixture.add(time_session)

    time_entry = TimeEntry(
        id=9201,
        tenant_id=tenant.id,
        task_id=task.id,
        user_id=user.id,
        time_session_id=time_session.id,
        hours=Decimal("2.00"),
        created_at=entry_created,
    )
    db_session_fixture.add(time_entry)
    db_session_fixture.commit()

    # Rango por fecha de trabajo (started_at) debe incluir la entrada.
    by_work_date = get_report(
        db_session_fixture,
        tenant_id=tenant.id,
        date_from=work_started - timedelta(minutes=30),
        date_to=work_started + timedelta(minutes=30),
    )
    assert len(by_work_date) == 1

    # Rango por fecha de creación no debe incluirla al filtrar por fecha de trabajo.
    by_created_date = get_report(
        db_session_fixture,
        tenant_id=tenant.id,
        date_from=entry_created - timedelta(minutes=30),
        date_to=entry_created + timedelta(minutes=30),
    )
    assert by_created_date == []

