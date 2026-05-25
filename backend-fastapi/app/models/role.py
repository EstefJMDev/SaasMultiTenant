from typing import Optional

from sqlmodel import Field, SQLModel


class Role(SQLModel, table=True):
    """
    Rol de usuario dentro del sistema.

    Ejemplos:
    - SUPER_ADMIN  -> Acceso global, fuera de tenant.
    - TENANT_ADMIN -> Admin dentro de un tenant.
    - USER         -> Usuario estándar dentro de un tenant.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    description: str | None = Field(default=None)

