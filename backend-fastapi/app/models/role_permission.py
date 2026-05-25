from typing import Optional

from sqlmodel import Field, SQLModel


class RolePermission(SQLModel, table=True):
    """
    Relación N a N entre roles y permisos.

    Permite definir qué permisos concretos tiene cada rol del sistema.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    role_id: int = Field(foreign_key="role.id", description="Rol asociado")
    permission_id: int = Field(
        foreign_key="permission.id",
        description="Permiso incluido en el rol",
    )

