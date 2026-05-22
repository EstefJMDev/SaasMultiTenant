from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Column, DateTime
from sqlalchemy import event
from sqlmodel import Field, SQLModel

from app.core.mfa_crypto import encrypt_mfa_secret


class User(SQLModel, table=True):
    """
    Usuario de la plataforma.

    Para usuarios asociados a un tenant, se rellena `tenant_id`.
    Para SUPER_ADMIN global, `tenant_id` puede ser `None`.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    full_name: str
    hashed_password: str
    is_active: bool = Field(default=True)
    is_super_admin: bool = Field(
        default=False,
        description="Indica si el usuario es un Super Admin global",
    )

    tenant_id: Optional[int] = Field(
        default=None,
        foreign_key="tenant.id",
        description="Tenant al que pertenece el usuario (si aplica)",
    )

    role_id: Optional[int] = Field(
        default=None,
        foreign_key="role.id",
        description="Rol principal del usuario dentro del tenant",
    )

    # Campos para MFA
    mfa_enabled: bool = Field(default=False)
    mfa_secret: Optional[str] = Field(
        default=None,
        description="Clave secreta TOTP para MFA. Solo se guarda si MFA está habilitado.",
    )

    # Idioma preferido del usuario.
    language: str = Field(default="en")
    # URL de la foto de perfil del usuario (opcional).
    avatar_url: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )
    last_seen_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True, index=True),
    )
    tokens_valid_after: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
        description=(
            "Marca de revocacion de tokens. Tokens con iat anterior se rechazan; "
            "fuerza re-login tras cambios de rol u otras invalidaciones."
        ),
    )


class UserRead(SQLModel):
    """
    Esquema de salida para usuario.

    No incluye campos sensibles como `hashed_password` ni `mfa_secret`.
    """

    id: int
    email: str
    full_name: str
    is_active: bool
    is_super_admin: bool
    tenant_id: Optional[int]
    role_id: Optional[int]
    language: str
    avatar_url: Optional[str]


@event.listens_for(User, "before_insert")
@event.listens_for(User, "before_update")
def _encrypt_user_mfa_secret_before_save(_, __, target: User) -> None:
    target.mfa_secret = encrypt_mfa_secret(target.mfa_secret)
