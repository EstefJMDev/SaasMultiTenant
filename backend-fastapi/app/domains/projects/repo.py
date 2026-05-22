from typing import Iterable, Optional

from sqlmodel import Session, select

from app.models.erp import (
    BudgetLineMilestone,
    Project,
    ProjectBudgetLine,
    ProjectBudgetMilestone,
    ProjectDocument,
)


READ_METHODS = {"GET", "HEAD", "OPTIONS"}


def list_active_projects(
    session: Session,
    tenant_id: Optional[int],
    *,
    limit: int,
    offset: int,
) -> list[Project]:
    stmt = select(Project).where(Project.is_active.is_(True))
    if tenant_id is not None:
        stmt = stmt.where(Project.tenant_id == tenant_id)
    stmt = stmt.order_by(Project.created_at.desc()).offset(offset).limit(limit)
    return session.exec(stmt).all()


def get_project_by_id(session: Session, project_id: int) -> Optional[Project]:
    return session.get(Project, project_id)


def list_project_budget_lines(
    session: Session, project_id: int
) -> list[ProjectBudgetLine]:
    stmt = (
        select(ProjectBudgetLine)
        .where(ProjectBudgetLine.project_id == project_id)
        .order_by(ProjectBudgetLine.created_at.asc())
    )
    return session.exec(stmt).all()


def get_project_budget_line(
    session: Session, budget_id: int
) -> Optional[ProjectBudgetLine]:
    return session.get(ProjectBudgetLine, budget_id)


def list_project_budget_milestones(
    session: Session, project_id: int
) -> list[ProjectBudgetMilestone]:
    stmt = (
        select(ProjectBudgetMilestone)
        .where(ProjectBudgetMilestone.project_id == project_id)
        .order_by(ProjectBudgetMilestone.order_index.asc(), ProjectBudgetMilestone.id.asc())
    )
    return session.exec(stmt).all()


def get_project_budget_milestone(
    session: Session, milestone_id: int
) -> Optional[ProjectBudgetMilestone]:
    return session.get(ProjectBudgetMilestone, milestone_id)


def list_budget_line_milestone_links_by_line_ids(
    session: Session, line_ids: Iterable[int]
) -> list[BudgetLineMilestone]:
    stmt = select(BudgetLineMilestone).where(BudgetLineMilestone.budget_line_id.in_(line_ids))
    return session.exec(stmt).all()


def list_budget_line_milestone_links_by_line_id(
    session: Session, line_id: int
) -> list[BudgetLineMilestone]:
    stmt = select(BudgetLineMilestone).where(BudgetLineMilestone.budget_line_id == line_id)
    return session.exec(stmt).all()


def list_budget_line_milestone_links_by_milestone_id(
    session: Session, milestone_id: int
) -> list[BudgetLineMilestone]:
    stmt = select(BudgetLineMilestone).where(BudgetLineMilestone.milestone_id == milestone_id)
    return session.exec(stmt).all()


def list_project_documents_query(
    project_id: int,
    tenant_id: Optional[int],
    doc_type: Optional[str] = None,
):
    stmt = select(ProjectDocument).where(ProjectDocument.project_id == project_id)
    if tenant_id is not None:
        stmt = stmt.where(ProjectDocument.tenant_id == tenant_id)
    if doc_type:
        stmt = stmt.where(ProjectDocument.doc_type == doc_type)
    return stmt
