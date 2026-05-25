from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class Tenant(SQLModel, table=True):
    """
    Representa una empresa / cliente dentro del sistema.

    La clave `subdomain` permite trabajar con subdominios del tipo:
    - `cliente1.empresa.com`
    - `cliente2.empresa.com`
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, description="Nombre comercial del tenant")
    subdomain: str = Field(
        index=True,
        unique=True,
        description="Subdominio asignado al tenant (ej: acme)",
    )
    is_active: bool = Field(default=True)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Fecha de creación del tenant",
    )

