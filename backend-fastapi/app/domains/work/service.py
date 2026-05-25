from typing import Optional

from sqlmodel import Session

from app.domains.work import repo
from app.models.erp import Activity, Deliverable, Milestone, SubActivity, Task, TaskTemplate
from app.models.user import User
from app.schemas.erp import (
    ActivityCreate,
    ActivityUpdate,
    DeliverableCreate,
    DeliverableUpdate,
    MilestoneCreate,
    MilestoneUpdate,
    SubActivityCreate,
    SubActivityUpdate,
    TaskCreate,
    TaskTemplateCreate,
    TaskUpdate,
)


def list_tasks(session: Session, tenant_id: Optional[int]) -> list[Task]:
    return repo.list_tasks(session, tenant_id)


def create_task(
    session: Session,
    current_user: User,
    data: TaskCreate,
    tenant_id: Optional[int],
) -> Task:
    return repo.create_task(session, current_user, data, tenant_id)


def update_task(
    session: Session,
    current_user: User,
    task_id: int,
    data: TaskUpdate,
    tenant_id: Optional[int],
) -> Task:
    return repo.update_task(session, current_user, task_id, data, tenant_id)


def delete_task(session: Session, task_id: int, tenant_id: Optional[int]) -> None:
    repo.delete_task(session, task_id, tenant_id)


def list_task_templates(session: Session, tenant_id: Optional[int]) -> list[TaskTemplate]:
    return repo.list_task_templates(session, tenant_id)


def create_task_template(
    session: Session,
    data: TaskTemplateCreate,
    tenant_id: Optional[int],
) -> TaskTemplate:
    return repo.create_task_template(session, data, tenant_id)


def list_activities(
    session: Session,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
) -> list[Activity]:
    return repo.list_activities(session, tenant_id, project_id=project_id)


def create_activity(
    session: Session,
    data: ActivityCreate,
    tenant_id: Optional[int],
) -> Activity:
    return repo.create_activity(session, data, tenant_id)


def update_activity(
    session: Session,
    activity_id: int,
    data: ActivityUpdate,
    tenant_id: Optional[int],
) -> Activity:
    return repo.update_activity(session, activity_id, data, tenant_id)


def list_subactivities(
    session: Session,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
    activity_id: Optional[int] = None,
) -> list[SubActivity]:
    return repo.list_subactivities(
        session,
        tenant_id,
        project_id=project_id,
        activity_id=activity_id,
    )


def create_subactivity(
    session: Session,
    data: SubActivityCreate,
    tenant_id: Optional[int],
) -> SubActivity:
    return repo.create_subactivity(session, data, tenant_id)


def update_subactivity(
    session: Session,
    subactivity_id: int,
    data: SubActivityUpdate,
    tenant_id: Optional[int],
) -> SubActivity:
    return repo.update_subactivity(session, subactivity_id, data, tenant_id)


def list_milestones(
    session: Session,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
    activity_id: Optional[int] = None,
) -> list[Milestone]:
    return repo.list_milestones(
        session,
        tenant_id,
        project_id=project_id,
        activity_id=activity_id,
    )


def create_milestone(
    session: Session,
    data: MilestoneCreate,
    tenant_id: Optional[int],
) -> Milestone:
    return repo.create_milestone(session, data, tenant_id)


def update_milestone(
    session: Session,
    milestone_id: int,
    data: MilestoneUpdate,
    tenant_id: Optional[int],
) -> Milestone:
    return repo.update_milestone(session, milestone_id, data, tenant_id)


def list_deliverables(
    session: Session,
    tenant_id: Optional[int],
    milestone_id: Optional[int] = None,
) -> list[Deliverable]:
    return repo.list_deliverables(session, tenant_id, milestone_id=milestone_id)


def create_deliverable(
    session: Session,
    data: DeliverableCreate,
    tenant_id: Optional[int],
) -> Deliverable:
    return repo.create_deliverable(session, data, tenant_id)


def update_deliverable(
    session: Session,
    deliverable_id: int,
    data: DeliverableUpdate,
    tenant_id: Optional[int],
) -> Deliverable:
    return repo.update_deliverable(session, deliverable_id, data, tenant_id)
