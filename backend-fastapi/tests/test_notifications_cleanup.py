from datetime import datetime, timedelta, timezone
import uuid

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import create_access_token, hash_password
from app.models.notification import Notification, NotificationType
from app.models.tenant import Tenant
from app.models.user import User


def _create_user_and_token(db: Session) -> tuple[User, dict[str, str]]:
    suffix = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"Tenant Notifications {suffix}",
        subdomain=f"tenant-notifications-{suffix}",
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    user = User(
        email=f"notifications+{suffix}@example.com",
        full_name="Notifications User",
        hashed_password=hash_password("Pass!123456789"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        mfa_enabled=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=str(user.id))
    return user, {"Authorization": f"Bearer {token}"}


def test_cleanup_read_notifications_removes_only_old_read(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    user, headers = _create_user_and_token(db_session_fixture)
    now = datetime.now(timezone.utc)

    old_read = Notification(
        tenant_id=user.tenant_id,
        user_id=user.id,
        type=NotificationType.GENERIC,
        title="Old read",
        body="old",
        is_read=True,
        created_at=now - timedelta(days=45),
        read_at=now - timedelta(days=40),
    )
    old_unread = Notification(
        tenant_id=user.tenant_id,
        user_id=user.id,
        type=NotificationType.GENERIC,
        title="Old unread",
        body="old unread",
        is_read=False,
        created_at=now - timedelta(days=45),
        read_at=None,
    )
    recent_read = Notification(
        tenant_id=user.tenant_id,
        user_id=user.id,
        type=NotificationType.GENERIC,
        title="Recent read",
        body="recent",
        is_read=True,
        created_at=now - timedelta(days=5),
        read_at=now - timedelta(days=4),
    )
    db_session_fixture.add(old_read)
    db_session_fixture.add(old_unread)
    db_session_fixture.add(recent_read)
    db_session_fixture.commit()

    response = client.post(
        "/api/v1/notifications/cleanup-read",
        params={"days": 30},
        headers=headers,
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["deleted"] == 1

    remaining = db_session_fixture.exec(
        select(Notification).where(Notification.user_id == user.id),
    ).all()
    assert len(remaining) == 2
    titles = {n.title for n in remaining}
    assert titles == {"Old unread", "Recent read"}
