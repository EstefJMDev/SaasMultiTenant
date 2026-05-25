from datetime import datetime
from typing import Dict, List, Optional

from sqlalchemy import Column, JSON
from sqlmodel import Field, SQLModel


class SummaryYear(SQLModel, table=True):
    __tablename__ = "erp_summary"

    id: Optional[int] = Field(default=None, primary_key=True)
    year: int = Field(index=True, unique=True)
    project_justify: Dict[str, float] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default=dict),
    )
    project_justified: Dict[str, float] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default=dict),
    )
    summary_milestones: Dict[str, List[Dict[str, float]]] = Field(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default=dict),
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
