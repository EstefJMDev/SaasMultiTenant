from datetime import datetime, timezone
from typing import Dict, List

from sqlmodel import Session, select

from app.models.summary import SummaryYear
from app.schemas.summary import MilestoneSummary, SummaryYearlyData


def _serialize_numeric_map(mapping: Dict[int, float]) -> Dict[str, float]:
    return {str(key): value for key, value in (mapping or {}).items()}


def _serialize_milestones(
    mapping: Dict[int, List[MilestoneSummary]],
) -> Dict[str, List[Dict[str, float]]]:
    result: Dict[str, List[Dict[str, float]]] = {}
    for project_id, items in (mapping or {}).items():
        normalized_items = [
            {"label": item.label, "hours": item.hours} for item in (items or [])
        ]
        result[str(project_id)] = normalized_items
    return result


def get_summary_by_year(session: Session, year: int) -> SummaryYearlyData:
    record = session.exec(
        select(SummaryYear).where(SummaryYear.year == year),
    ).one_or_none()
    if record is None:
        return SummaryYearlyData()
    return SummaryYearlyData(
        projectJustify=record.project_justify or {},
        projectJustified=record.project_justified or {},
        summaryMilestones=record.summary_milestones or {},
    )


def upsert_summary_by_year(
    session: Session,
    year: int,
    payload: SummaryYearlyData,
) -> SummaryYearlyData:
    record = session.exec(
        select(SummaryYear).where(SummaryYear.year == year),
    ).one_or_none()
    now = datetime.now(timezone.utc)
    if record is None:
        record = SummaryYear(year=year)
        record.created_at = now

    record.project_justify = _serialize_numeric_map(payload.projectJustify)
    record.project_justified = _serialize_numeric_map(payload.projectJustified)
    record.summary_milestones = _serialize_milestones(payload.summaryMilestones)
    record.updated_at = now

    session.add(record)
    session.commit()
    session.refresh(record)

    return SummaryYearlyData(
        projectJustify=record.project_justify or {},
        projectJustified=record.project_justified or {},
        summaryMilestones=record.summary_milestones or {},
    )
