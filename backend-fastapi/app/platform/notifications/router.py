
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.schemas.notification import (
    NotificationCleanupResponse,
    NotificationListResponse,
    NotificationRead,
    NotificationUnreadCountResponse,
)
from app.services.notification_service import (
    cleanup_read_notifications,
    count_unread_for_user,
    list_notifications_for_user,
    mark_all_as_read,
    mark_notification_as_read,
)


router = APIRouter()


@router.get(
    "",
    response_model=NotificationListResponse,
    summary="Listar notificaciones del usuario actual",
)
def api_list_notifications(
    only_unread: bool = Query(
        default=False,
        description="Si es true, solo devuelve notificaciones no leídas.",
    ),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user=Depends(get_current_active_user),
) -> NotificationListResponse:
    return list_notifications_for_user(
        session=session,
        user=current_user,
        only_unread=only_unread,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/{notification_id}/read",
    response_model=NotificationRead,
    summary="Marcar una notificación como leída",
)
def api_mark_notification_read(
    notification_id: int,
    session: Session = Depends(get_session),
    current_user=Depends(get_current_active_user),
) -> NotificationRead:
    try:
        return mark_notification_as_read(
            session=session,
            user=current_user,
            notification_id=notification_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.get(
    "/unread-count",
    response_model=NotificationUnreadCountResponse,
    summary="Devuelve el conteo de notificaciones no leídas",
)
def api_unread_count(
    session: Session = Depends(get_session),
    current_user=Depends(get_current_active_user),
) -> NotificationUnreadCountResponse:
    return NotificationUnreadCountResponse(
        unread=count_unread_for_user(session=session, user=current_user)
    )


@router.post(
    "/read-all",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Marcar todas las notificaciones como leídas",
)
def api_mark_all_read(
    session: Session = Depends(get_session),
    current_user=Depends(get_current_active_user),
) -> None:
    mark_all_as_read(session=session, user=current_user)


@router.post(
    "/cleanup-read",
    response_model=NotificationCleanupResponse,
    summary="Eliminar notificaciones leidas antiguas del usuario actual",
)
def api_cleanup_read_notifications(
    days: int = Query(default=30, ge=1, le=3650),
    session: Session = Depends(get_session),
    current_user=Depends(get_current_active_user),
) -> NotificationCleanupResponse:
    deleted = cleanup_read_notifications(
        session=session,
        user=current_user,
        older_than_days=days,
    )
    return NotificationCleanupResponse(deleted=deleted)

