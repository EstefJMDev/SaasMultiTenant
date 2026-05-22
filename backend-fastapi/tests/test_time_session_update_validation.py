from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlmodel import Session

from app.domains.time.repo import update_session
from app.models.erp import Project, Task, TimeSession
from app.models.tenant import Tenant
from app.models.user import User


def _seed_time_entities(db: Session) -> tuple[Tenant, User, Task]:
    tenant = Tenant(
        name="Tenant Time Update",
        subdomain=f"time-update-{uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    user = User(
        email=f"time-update-{uuid4().hex[:8]}@example.com",
        full_name="Time Update User",
        hashed_password="unused-in-tests",
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    project = Project(
        tenant_id=tenant.id,
        name="Proyecto Time Update",
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    task = Task(
        id=(uuid4().int % 1_000_000_000) + 1,
        tenant_id=tenant.id,
        project_id=project.id,
        title="Tarea Time Update",
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    return tenant, user, task


def test_update_session_rejects_date_edits_for_active_session(
    db_session_fixture: Session,
) -> None:
    tenant, user, task = _seed_time_entities(db_session_fixture)
    now = datetime.now(timezone.utc)

    active_session = TimeSession(
        id=9401,
        tenant_id=tenant.id,
        task_id=task.id,
        user_id=user.id,
        started_at=now - timedelta(hours=1),
        ended_at=None,
        duration_seconds=0,
        is_active=True,
        created_at=now - timedelta(hours=1),
    )
    db_session_fixture.add(active_session)
    db_session_fixture.commit()

    with pytest.raises(ValueError, match="sesion activa"):
        update_session(
            db_session_fixture,
            user,
            session_id=active_session.id,
            started_at=now + timedelta(hours=1),
            tenant_id=tenant.id,
        )


def test_update_session_rejects_invalid_date_range_for_inactive_session(
    db_session_fixture: Session,
) -> None:
    tenant, user, task = _seed_time_entities(db_session_fixture)
    now = datetime.now(timezone.utc)

    closed_session = TimeSession(
        id=9501,
        tenant_id=tenant.id,
        task_id=task.id,
        user_id=user.id,
        started_at=now - timedelta(hours=2),
        ended_at=now - timedelta(hours=1),
        duration_seconds=3600,
        is_active=False,
        created_at=now - timedelta(hours=2),
    )
    db_session_fixture.add(closed_session)
    db_session_fixture.commit()

    with pytest.raises(ValueError, match="posterior al inicio"):
        update_session(
            db_session_fixture,
            user,
            session_id=closed_session.id,
            started_at=now,
            ended_at=now - timedelta(minutes=30),
            tenant_id=tenant.id,
        )
