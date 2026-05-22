from typing import Dict, List

from pydantic import BaseModel, Field


class MilestoneSummary(BaseModel):
    label: str
    hours: float


class SummaryYearlyData(BaseModel):
    projectJustify: Dict[int, float] = Field(default_factory=dict)
    projectJustified: Dict[int, float] = Field(default_factory=dict)
    summaryMilestones: Dict[int, List[MilestoneSummary]] = Field(default_factory=dict)
