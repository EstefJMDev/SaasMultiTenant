from datetime import datetime

from pydantic import BaseModel, EmailStr


class AuditLogRead(BaseModel):
    """
    Esquema de lectura para registros de auditoria.
    """

    id: int
    created_at: datetime
    user_email: EmailStr | None = None
    source: str | None = None
    action: str
    details: str | None = None

