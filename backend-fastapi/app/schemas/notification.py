from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel

from app.models.notification import NotificationType


class NotificationRead(BaseModel):
    id: int
    tenant_id: int
    user_id: int
    type: NotificationType
    title: str
    body: Optional[str] = None
    reference: Optional[str] = None
    meta: Optional[dict[str, Any]] = None
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime] = None


class NotificationListResponse(BaseModel):
    items: list[NotificationRead]
    total: int
    unread_total: int = 0


class NotificationCleanupResponse(BaseModel):
    deleted: int


class NotificationUnreadCountResponse(BaseModel):
    unread: int
