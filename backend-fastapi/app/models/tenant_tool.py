from typing import Optional

from sqlmodel import Field, SQLModel


class TenantTool(SQLModel, table=True):
    """
    Relación entre un tenant y una herramienta externa.

    Permite configurar accesos específicos por tenant.
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    tenant_id: int = Field(
        foreign_key="tenant.id",
        description="Tenant que tiene acceso a la herramienta",
    )
    tool_id: int = Field(
        foreign_key="tool.id",
        description="Herramienta externa disponible para el tenant",
    )

    is_enabled: bool = Field(default=True)

