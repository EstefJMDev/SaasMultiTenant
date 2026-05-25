from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class UserInvitation(SQLModel, table=True):
    """
    Invitación para crear un usuario por email.

    La invitación está ligada a un tenant y a un rol lógico
    (por ejemplo: tenant_admin, gerencia, user).
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    email: str = Field(index=True)
    full_name: Optional[str] = Field(default=None)

    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    role_name: str = Field(
        description="Nombre lógico del rol (tenant_admin, gerencia, user, etc.)",
        max_length=50,
    )

    token: str = Field(
        unique=True,
        index=True,
        description="Token de invitación firmado/aleatorio para el alta",
    )

    created_by_id: int = Field(
        foreign_key="user.id",
        description="Usuario que generó la invitación",
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=7),
        description="Fecha de caducidad de la invitación",
    )
    used_at: Optional[datetime] = Field(
        default=None,
        description="Momento en el que se aceptó la invitación",
    )

