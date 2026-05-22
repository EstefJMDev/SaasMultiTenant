from typing import Optional

from sqlmodel import Field, SQLModel


class Tool(SQLModel, table=True):
    """
    Herramienta externa que puede asignarse a uno o varios tenants.

    Ejemplos:
    - Moodle
    - ERP
    - n8n
    - BI
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    slug: str = Field(
        index=True,
        unique=True,
        description="Identificador corto (ej: moodle, erp, n8n, bi)",
    )
    base_url: str = Field(description="URL base del servicio externo")
    description: str | None = Field(default=None)

