from typing import Optional

from sqlmodel import Field, SQLModel


class Permission(SQLModel, table=True):
    """
    Permiso específico dentro del sistema.

    La combinación Roles + Permisos permite definir un RBAC detallado.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True, description="Código interno del permiso")
    description: str | None = Field(default=None)

