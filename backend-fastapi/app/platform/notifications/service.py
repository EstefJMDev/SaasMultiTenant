from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy import delete, func, update
from sqlmodel import Session, select

from app.models.notification import Notification, NotificationType
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationRead


def _to_read(n: Notification) -> NotificationRead:
    return NotificationRead(
        id=n.id,
        tenant_id=n.tenant_id,
        user_id=n.user_id,
        type=n.type,
        title=n.title,
        body=n.body,
        reference=n.reference,
        meta=n.meta,
        is_read=n.is_read,
        created_at=n.created_at,
        read_at=n.read_at,
    )


def create_notification(
    session: Session,
    *,
    tenant_id: int,
    user_id: int,
    type: NotificationType,
    title: str,
    body: str | None = None,
    reference: str | None = None,
    meta: dict[str, Any] | None = None,
) -> Notification:
    notification_type = type.value if isinstance(type, NotificationType) else str(type)
    notification = Notification(
        tenant_id=tenant_id,
        user_id=user_id,
        type=notification_type,
        title=title,
        body=body,
        reference=reference,
        meta=meta,
    )
    session.add(notification)
    session.commit()
    session.refresh(notification)
    return notification


def list_notifications_for_user(
    session: Session,
    *,
    user: User,
    only_unread: bool = False,
    limit: int = 20,
    offset: int = 0,
) -> NotificationListResponse:
    stmt = (
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
    )
    if only_unread:
        stmt = stmt.where(Notification.is_read.is_(False))

    count_stmt = select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id
    )
    if only_unread:
        count_stmt = count_stmt.where(Notification.is_read.is_(False))
    total = int(session.exec(count_stmt).one())

    unread_count_stmt = (
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
    )
    unread_total = int(session.exec(unread_count_stmt).one())

    notifications: Iterable[Notification] = session.exec(
        stmt.offset(offset).limit(limit),
    ).all()

    items = [_to_read(n) for n in notifications]
    return NotificationListResponse(items=items, total=total, unread_total=unread_total)


def count_unread_for_user(session: Session, *, user: User) -> int:
    stmt = (
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
    )
    return int(session.exec(stmt).one())


def mark_notification_as_read(
    session: Session,
    *,
    user: User,
    notification_id: int,
) -> NotificationRead:
    notification = session.get(Notification, notification_id)
    if not notification or notification.user_id != user.id:
        raise ValueError("Notificación no encontrada")

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        session.add(notification)
        session.commit()
        session.refresh(notification)

    return _to_read(notification)


def mark_all_as_read(session: Session, *, user: User) -> int:
    now = datetime.now(timezone.utc)
    stmt = (
        update(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True, read_at=now)
    )
    result = session.exec(stmt)
    session.commit()
    return int(getattr(result, "rowcount", 0) or 0)


def cleanup_read_notifications(
    session: Session,
    *,
    user: User,
    older_than_days: int = 30,
) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, older_than_days))
    stmt = (
        delete(Notification)
        .where(
            Notification.user_id == user.id,
            Notification.is_read.is_(True),
            (
                (Notification.read_at.is_not(None) & (Notification.read_at <= cutoff))
                | (Notification.read_at.is_(None) & (Notification.created_at <= cutoff))
            ),
        )
    )
    result = session.exec(stmt)
    session.commit()
    return int(getattr(result, "rowcount", 0) or 0)
