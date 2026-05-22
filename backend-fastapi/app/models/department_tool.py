from typing import Optional

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class DepartmentTool(SQLModel, table=True):
    """
    Estado de habilitacion de tools a nivel departamento.
    """

    __tablename__ = "department_tool"

    id: Optional[int] = Field(default=None, primary_key=True)
    department_id: int = Field(foreign_key="department.id", index=True)
    tool_id: int = Field(foreign_key="tool.id", index=True)
    enabled: bool = Field(default=True)
    config_json: dict | None = Field(default=None, sa_column=Column(JSONB))
