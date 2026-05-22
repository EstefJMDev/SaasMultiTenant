from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.core.db import get_db
from app.domains.projects.deps import tenant_for_read, tenant_for_write
from app.domains.projects.exceptions import (
    ProjectBudgetLineNotFoundError,
    ProjectBudgetMilestoneNotFoundError,
    ProjectNotFoundError,
    ProjectValidationError,
)
from app.domains.projects.schemas import (
    ProjectBudgetLineCreate,
    ProjectBudgetLineRead,
    ProjectBudgetLineUpdate,
    ProjectBudgetMilestoneCreate,
    ProjectBudgetMilestoneRead,
    ProjectBudgetMilestoneUpdate,
)
from app.domains.projects.service import (
    create_project_budget_line,
    create_project_budget_milestone,
    delete_project_budget_line,
    delete_project_budget_milestone,
    get_project,
    list_project_budget_lines,
    list_project_budget_milestones,
    to_project_budget_line_read,
    update_project_budget_line,
    update_project_budget_milestone,
)


router = APIRouter()


@router.get("/{project_id}/budgets", response_model=list[ProjectBudgetLineRead])
def api_list_project_budgets(
    project_id: int,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
) -> list[ProjectBudgetLineRead]:
    try:
        get_project(session, project_id, tenant_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    lines, milestones_by_line = list_project_budget_lines(session, project_id, tenant_id)
    return [to_project_budget_line_read(line, milestones_by_line.get(line.id, [])) for line in lines]


@router.post(
    "/{project_id}/budgets",
    response_model=ProjectBudgetLineRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_project_budget_line(
    project_id: int,
    payload: ProjectBudgetLineCreate,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> ProjectBudgetLineRead:
    try:
        get_project(session, project_id, tenant_id)
        line = create_project_budget_line(session, project_id, payload, tenant_id)
        milestones = getattr(line, "milestones", [])
        return to_project_budget_line_read(line, milestones)
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/{project_id}/budgets/{budget_id}", response_model=ProjectBudgetLineRead)
def api_update_project_budget_line(
    project_id: int,
    budget_id: int,
    payload: ProjectBudgetLineUpdate,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> ProjectBudgetLineRead:
    try:
        line = update_project_budget_line(session, project_id, budget_id, payload, tenant_id)
        milestones = getattr(line, "milestones", [])
        return to_project_budget_line_read(line, milestones)
    except ProjectBudgetLineNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{project_id}/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_project_budget_line(
    project_id: int,
    budget_id: int,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> None:
    try:
        delete_project_budget_line(session, project_id, budget_id, tenant_id)
    except ProjectBudgetLineNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{project_id}/budget-milestones", response_model=list[ProjectBudgetMilestoneRead])
def api_list_project_budget_milestones(
    project_id: int,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
) -> list[ProjectBudgetMilestoneRead]:
    try:
        get_project(session, project_id, tenant_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return list_project_budget_milestones(session, project_id, tenant_id)


@router.post(
    "/{project_id}/budget-milestones",
    response_model=ProjectBudgetMilestoneRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_project_budget_milestone(
    project_id: int,
    payload: ProjectBudgetMilestoneCreate,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> ProjectBudgetMilestoneRead:
    try:
        return create_project_budget_milestone(session, project_id, payload, tenant_id)
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch(
    "/{project_id}/budget-milestones/{milestone_id}",
    response_model=ProjectBudgetMilestoneRead,
)
def api_update_project_budget_milestone(
    project_id: int,
    milestone_id: int,
    payload: ProjectBudgetMilestoneUpdate,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> ProjectBudgetMilestoneRead:
    try:
        return update_project_budget_milestone(session, project_id, milestone_id, payload, tenant_id)
    except ProjectBudgetMilestoneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{project_id}/budget-milestones/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_project_budget_milestone(
    project_id: int,
    milestone_id: int,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> None:
    try:
        delete_project_budget_milestone(session, project_id, milestone_id, tenant_id)
    except ProjectBudgetMilestoneNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
