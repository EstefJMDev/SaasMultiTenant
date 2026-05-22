from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class MFAEmailCode(SQLModel, table=True):
    """
    Código MFA enviado por correo electrónico para un usuario.

    Se usa para el segundo paso del login en usuarios no Super Admin.
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    user_id: int = Field(
        index=True,
        description="ID del usuario al que pertenece el código",
    )
    code_hash: str = Field(description="Hash del código MFA enviado por email")
    expires_at: datetime = Field(description="Fecha/hora de expiración del código")
    failed_attempts: int = Field(default=0, description="Intentos fallidos para este código")
    created_at: datetime = Field(default_factory=datetime.utcnow)

