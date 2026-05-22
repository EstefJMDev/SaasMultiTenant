from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from sqlalchemy import Column, Enum as SAEnum, JSON
from sqlmodel import Field, SQLModel

from app.models.tenant import Tenant  # noqa: F401
from app.models.user import User  # noqa: F401


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class NotificationType(str, Enum):
    TICKET_ASSIGNED = "ticket_assigned"
    TICKET_COMMENT = "ticket_comment"
    TICKET_STATUS = "ticket_status"
    GENERIC = "generic"


class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    tenant_id: int = Field(
        foreign_key="tenant.id",
        index=True,
        description="Tenant al que pertenece la notificación",
    )
    user_id: int = Field(
        foreign_key="user.id",
        index=True,
        description="Usuario destinatario de la notificación",
    )

    type: NotificationType = Field(
        default=NotificationType.GENERIC,
        sa_column=Column(
            SAEnum(
                NotificationType,
                name="notificationtype",
                values_callable=lambda enum_cls: [item.value for item in enum_cls],
            ),
            nullable=False,
            index=True,
        ),
        description="Tipo lógico de la notificación",
    )
    title: str = Field(max_length=200)
    body: Optional[str] = None
    reference: Optional[str] = Field(
        default=None,
        description="Referencia textual legada (ej. contract_id=123).",
    )
    meta: Optional[dict[str, Any]] = Field(
        default=None,
        sa_column=Column("meta", JSON, nullable=True),
        description="Payload estructurado para enrutado del frontend.",
    )

    is_read: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=_utcnow, index=True)
    read_at: Optional[datetime] = None
