from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from app.models.erp import Activity, Deliverable, Milestone, Project, SubActivity, Task, TaskTemplate
from app.models.notification import NotificationType
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
from app.platform.notifications.service import create_notification


TASK_STATUSES = {"pending", "in_progress", "done"}


def _optional_tenant(tenant_id: Optional[int]) -> Optional[int]:
    return tenant_id


def _require_tenant(tenant_id: Optional[int]) -> int:
    if tenant_id is None:
        raise ValueError("Tenant requerido para esta operacion.")
    return tenant_id


def _get_project_or_404(session: Session, project_id: int, tenant_id: Optional[int]) -> Project:
    project = session.get(Project, project_id)
    if not project:
        raise ValueError("Proyecto no encontrado.")
    if tenant_id is not None and project.tenant_id != tenant_id:
        raise ValueError("Proyecto no encontrado.")
    return project


def _as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _resolve_assignee(
    session: Session,
    current_user: User,
    assigned_to_id: Optional[int],
) -> Optional[User]:
    if assigned_to_id is None:
        return None

    assignee = session.get(User, assigned_to_id)
    if not assignee:
        raise ValueError("Usuario asignado no encontrado.")

    if not current_user.is_super_admin:
        if not current_user.tenant_id:
            raise ValueError("El usuario no tiene tenant asociado.")
        if assignee.tenant_id != current_user.tenant_id:
            raise ValueError("El usuario asignado no pertenece a tu tenant.")

    return assignee


def _normalize_task_status(status: Optional[str], is_completed: Optional[bool]) -> str:
    if status:
        normalized = status.strip().lower()
        if normalized not in TASK_STATUSES:
            raise ValueError("Estado de tarea no valido.")
        return normalized
    if is_completed:
        return "done"
    return "pending"


def _validate_date_range(start_date: Optional[datetime], end_date: Optional[datetime]) -> None:
    if start_date and end_date and end_date < start_date:
        raise ValueError("La fecha de fin debe ser posterior a la de inicio.")


def _resolve_activity(
    session: Session,
    project_id: Optional[int],
    activity_id: Optional[int],
    tenant_id: Optional[int],
) -> Optional[Activity]:
    if activity_id is None:
        return None
    activity = session.get(Activity, activity_id)
    if not activity:
        raise ValueError("Actividad no encontrada.")
    if tenant_id is not None and activity.tenant_id != tenant_id:
        raise ValueError("Actividad no encontrada.")
    if project_id and activity.project_id != project_id:
        raise ValueError("La actividad no pertenece al proyecto indicado.")
    return activity


def _resolve_subactivity(
    session: Session,
    project_id: Optional[int],
    subactivity_id: Optional[int],
    tenant_id: Optional[int],
) -> Optional[SubActivity]:
    if subactivity_id is None:
        return None
    subactivity = session.get(SubActivity, subactivity_id)
    if not subactivity:
        raise ValueError("Subactividad no encontrada.")
    if tenant_id is not None and subactivity.tenant_id != tenant_id:
        raise ValueError("Subactividad no encontrada.")
    activity = session.get(Activity, subactivity.activity_id)
    if not activity:
        raise ValueError("Actividad asociada no encontrada.")
    if project_id and activity.project_id != project_id:
        raise ValueError("La subactividad no pertenece al proyecto indicado.")
    return subactivity


def _resolve_task_template(
    session: Session,
    task_template_id: Optional[int],
    tenant_id: Optional[int],
) -> Optional[TaskTemplate]:
    if task_template_id is None:
        return None
    template = session.get(TaskTemplate, task_template_id)
    if not template:
        raise ValueError("Plantilla de tarea no encontrada.")
    if tenant_id is not None and template.tenant_id != tenant_id:
        raise ValueError("Plantilla de tarea no encontrada.")
    if not template.is_active:
        raise ValueError("La plantilla de tarea no esta activa.")
    return template


def _resolve_milestone(
    session: Session,
    milestone_id: int,
    tenant_id: Optional[int],
) -> Milestone:
    milestone = session.get(Milestone, milestone_id)
    if not milestone:
        raise ValueError("Hito no encontrado.")
    if tenant_id is not None and milestone.tenant_id != tenant_id:
        raise ValueError("Hito no encontrado.")
    return milestone


def list_tasks(session: Session, tenant_id: Optional[int]) -> list[Task]:
    stmt = select(Task).where(Task.status != "deleted")
    if tenant_id is not None:
        stmt = stmt.where(Task.tenant_id == tenant_id)
    return session.exec(stmt.order_by(Task.created_at.desc())).all()


def create_task(
    session: Session,
    current_user: User,
    data: TaskCreate,
    tenant_id: Optional[int],
) -> Task:
    tenant_context = tenant_id
    project_id = data.project_id
    project = None
    if project_id is not None:
        project = _get_project_or_404(session, project_id, tenant_context)
        tenant_context = tenant_context or project.tenant_id

    subactivity = _resolve_subactivity(session, project_id, data.subactivity_id, tenant_context)
    if subactivity:
        activity = session.get(Activity, subactivity.activity_id)
        if activity and not project_id:
            project_id = activity.project_id
    _resolve_task_template(session, data.task_template_id, tenant_id)

    assignee = _resolve_assignee(session, current_user, data.assigned_to_id)
    _validate_date_range(data.start_date, data.end_date)

    effective_tenant_id = project.tenant_id if project else tenant_context
    status = _normalize_task_status(data.status, data.is_completed)
    task = Task(
        tenant_id=_optional_tenant(effective_tenant_id),
        project_id=project_id,
        subactivity_id=data.subactivity_id,
        task_template_id=data.task_template_id,
        title=data.title,
        description=data.description,
        assigned_to_id=assignee.id if assignee else None,
        start_date=data.start_date,
        end_date=data.end_date,
        status=status,
        is_completed=status == "done",
    )
    session.add(task)
    session.commit()
    session.refresh(task)

    if assignee and assignee.tenant_id:
        create_notification(
            session,
            tenant_id=assignee.tenant_id,
            user_id=assignee.id,
            type=NotificationType.GENERIC,
            title=f"Tarea asignada: {task.title}",
            body="Se te ha asignado una nueva tarea en el ERP.",
            reference=f"task_id={task.id}",
        )

    return task


def update_task(
    session: Session,
    current_user: User,
    task_id: int,
    data: TaskUpdate,
    tenant_id: Optional[int],
) -> Task:
    task = session.get(Task, task_id)
    if not task or (tenant_id is not None and task.tenant_id != tenant_id):
        raise ValueError("Tarea no encontrada.")

    if data.title is not None:
        task.title = data.title
    if data.description is not None:
        task.description = data.description
    if data.project_id is not None:
        project = _get_project_or_404(session, data.project_id, tenant_id)
        task.project_id = data.project_id
        task.tenant_id = project.tenant_id
    if data.subactivity_id is not None:
        _resolve_subactivity(session, task.project_id, data.subactivity_id, tenant_id)
        task.subactivity_id = data.subactivity_id
    if data.task_template_id is not None:
        _resolve_task_template(session, data.task_template_id, tenant_id)
        task.task_template_id = data.task_template_id
    if data.status is not None:
        status = _normalize_task_status(data.status, None)
        task.status = status
        task.is_completed = status == "done"
    elif data.is_completed is not None:
        task.is_completed = data.is_completed
        task.status = "done" if data.is_completed else "pending"
    if data.assigned_to_id is not None:
        assignee = _resolve_assignee(session, current_user, data.assigned_to_id)
        task.assigned_to_id = assignee.id if assignee else None
        if assignee and assignee.tenant_id:
            create_notification(
                session,
                tenant_id=assignee.tenant_id,
                user_id=assignee.id,
                type=NotificationType.GENERIC,
                title=f"Tarea asignada: {task.title}",
                body="Se te ha asignado una nueva tarea en el ERP.",
                reference=f"task_id={task.id}",
            )

    if data.start_date is not None or data.end_date is not None:
        start_date = data.start_date if data.start_date is not None else task.start_date
        end_date = data.end_date if data.end_date is not None else task.end_date
        _validate_date_range(start_date, end_date)
        task.start_date = start_date
        task.end_date = end_date

    session.add(task)
    session.commit()
    session.refresh(task)
    return task


def delete_task(session: Session, task_id: int, tenant_id: Optional[int]) -> None:
    task = session.get(Task, task_id)
    if not task or (tenant_id is not None and task.tenant_id != tenant_id):
        raise ValueError("Tarea no encontrada.")
    task.status = "deleted"
    task.is_completed = True
    task.subactivity_id = None
    session.add(task)
    session.commit()


def list_task_templates(session: Session, tenant_id: Optional[int]) -> list[TaskTemplate]:
    stmt = select(TaskTemplate)
    if tenant_id is not None:
        stmt = stmt.where(TaskTemplate.tenant_id == tenant_id)
    return session.exec(stmt.order_by(TaskTemplate.created_at.desc())).all()


def create_task_template(
    session: Session,
    data: TaskTemplateCreate,
    tenant_id: Optional[int],
) -> TaskTemplate:
    tenant_id = _require_tenant(tenant_id)
    template = TaskTemplate(
        tenant_id=tenant_id,
        title=data.title,
        description=data.description,
        is_active=data.is_active,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


def list_activities(
    session: Session,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
) -> list[Activity]:
    stmt = select(Activity)
    if tenant_id is not None:
        stmt = stmt.where(Activity.tenant_id == tenant_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, tenant_id)
        stmt = stmt.where(Activity.project_id == project_id)
    return session.exec(stmt.order_by(Activity.created_at.desc())).all()


def create_activity(
    session: Session,
    data: ActivityCreate,
    tenant_id: Optional[int],
) -> Activity:
    project = _get_project_or_404(session, data.project_id, tenant_id)
    _validate_date_range(data.start_date, data.end_date)
    activity = Activity(
        tenant_id=project.tenant_id,
        project_id=data.project_id,
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        assigned_to_id=data.assigned_to_id,
    )
    session.add(activity)
    session.commit()
    session.refresh(activity)
    return activity


def update_activity(
    session: Session,
    activity_id: int,
    data: ActivityUpdate,
    tenant_id: Optional[int],
) -> Activity:
    activity = session.get(Activity, activity_id)
    if not activity or (tenant_id is not None and activity.tenant_id != tenant_id):
        raise ValueError("Actividad no encontrada.")

    if data.name is not None:
        activity.name = data.name
    if data.description is not None:
        activity.description = data.description
    if data.start_date is not None or data.end_date is not None:
        start_date = data.start_date if data.start_date is not None else activity.start_date
        end_date = data.end_date if data.end_date is not None else activity.end_date
        _validate_date_range(start_date, end_date)
        activity.start_date = start_date
        activity.end_date = end_date
    if data.assigned_to_id is not None:
        activity.assigned_to_id = data.assigned_to_id

    session.add(activity)
    session.commit()
    session.refresh(activity)
    return activity


def list_subactivities(
    session: Session,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
    activity_id: Optional[int] = None,
) -> list[SubActivity]:
    stmt = select(SubActivity)
    if tenant_id is not None:
        stmt = stmt.where(SubActivity.tenant_id == tenant_id)
    if activity_id is not None:
        activity = _resolve_activity(session, project_id, activity_id, tenant_id)
        if activity:
            stmt = stmt.where(SubActivity.activity_id == activity_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, tenant_id)
        stmt = (
            stmt.join(Activity, Activity.id == SubActivity.activity_id)
            .where(Activity.project_id == project_id)
        )
    return session.exec(stmt.order_by(SubActivity.created_at.desc())).all()


def create_subactivity(
    session: Session,
    data: SubActivityCreate,
    tenant_id: Optional[int],
) -> SubActivity:
    activity = _resolve_activity(session, None, data.activity_id, tenant_id)
    if not activity:
        raise ValueError("Actividad no encontrada.")
    _validate_date_range(data.start_date, data.end_date)
    subactivity = SubActivity(
        tenant_id=activity.tenant_id,
        activity_id=data.activity_id,
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        end_date=data.end_date,
        assigned_to_id=data.assigned_to_id,
    )
    session.add(subactivity)
    session.commit()
    session.refresh(subactivity)
    return subactivity


def update_subactivity(
    session: Session,
    subactivity_id: int,
    data: SubActivityUpdate,
    tenant_id: Optional[int],
) -> SubActivity:
    subactivity = session.get(SubActivity, subactivity_id)
    if not subactivity or (tenant_id is not None and subactivity.tenant_id != tenant_id):
        raise ValueError("Subactividad no encontrada.")

    if data.name is not None:
        subactivity.name = data.name
    if data.description is not None:
        subactivity.description = data.description
    if data.start_date is not None or data.end_date is not None:
        start_date = data.start_date if data.start_date is not None else subactivity.start_date
        end_date = data.end_date if data.end_date is not None else subactivity.end_date
        _validate_date_range(start_date, end_date)
        subactivity.start_date = start_date
        subactivity.end_date = end_date
    if data.assigned_to_id is not None:
        subactivity.assigned_to_id = data.assigned_to_id

    session.add(subactivity)
    session.commit()
    session.refresh(subactivity)
    return subactivity


def list_milestones(
    session: Session,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
    activity_id: Optional[int] = None,
) -> list[Milestone]:
    stmt = select(Milestone)
    if tenant_id is not None:
        stmt = stmt.where(Milestone.tenant_id == tenant_id)
    if project_id is not None:
        _get_project_or_404(session, project_id, tenant_id)
        stmt = stmt.where(Milestone.project_id == project_id)
    if activity_id is not None:
        stmt = stmt.where(Milestone.activity_id == activity_id)
    return session.exec(stmt.order_by(Milestone.created_at.desc())).all()


def create_milestone(
    session: Session,
    data: MilestoneCreate,
    tenant_id: Optional[int],
) -> Milestone:
    project = _get_project_or_404(session, data.project_id, tenant_id)
    _resolve_activity(session, data.project_id, data.activity_id, tenant_id)
    milestone = Milestone(
        tenant_id=project.tenant_id,
        project_id=data.project_id,
        activity_id=data.activity_id,
        title=data.title,
        description=data.description,
        due_date=data.due_date,
        allow_late_submission=data.allow_late_submission,
    )
    session.add(milestone)
    session.commit()
    session.refresh(milestone)
    return milestone


def update_milestone(
    session: Session,
    milestone_id: int,
    data: MilestoneUpdate,
    tenant_id: Optional[int],
) -> Milestone:
    milestone = session.get(Milestone, milestone_id)
    if not milestone or (tenant_id is not None and milestone.tenant_id != tenant_id):
        raise ValueError("Hito no encontrado.")

    if data.title is not None:
        milestone.title = data.title
    if data.description is not None:
        milestone.description = data.description
    if data.due_date is not None:
        milestone.due_date = data.due_date
    if data.allow_late_submission is not None:
        milestone.allow_late_submission = data.allow_late_submission

    session.add(milestone)
    session.commit()
    session.refresh(milestone)
    return milestone


def list_deliverables(
    session: Session,
    tenant_id: Optional[int],
    milestone_id: Optional[int] = None,
) -> list[Deliverable]:
    stmt = select(Deliverable)
    if tenant_id is not None:
        stmt = stmt.where(Deliverable.tenant_id == tenant_id)
    if milestone_id is not None:
        _resolve_milestone(session, milestone_id, tenant_id)
        stmt = stmt.where(Deliverable.milestone_id == milestone_id)
    return session.exec(stmt.order_by(Deliverable.created_at.desc())).all()


def create_deliverable(
    session: Session,
    data: DeliverableCreate,
    tenant_id: Optional[int],
) -> Deliverable:
    milestone = _resolve_milestone(session, data.milestone_id, tenant_id)
    submitted_at = _as_aware(data.submitted_at or datetime.now(timezone.utc))
    is_late = False
    if milestone.due_date and submitted_at > _as_aware(milestone.due_date):
        is_late = True
        if not milestone.allow_late_submission:
            raise ValueError("Entrega fuera de plazo para este hito.")

    deliverable = Deliverable(
        tenant_id=milestone.tenant_id,
        milestone_id=data.milestone_id,
        title=data.title,
        notes=data.notes,
        link_url=data.link_url,
        file_id=data.file_id,
        submitted_at=submitted_at,
        is_late=is_late,
    )
    session.add(deliverable)
    session.commit()
    session.refresh(deliverable)
    return deliverable


def update_deliverable(
    session: Session,
    deliverable_id: int,
    data: DeliverableUpdate,
    tenant_id: Optional[int],
) -> Deliverable:
    deliverable = session.get(Deliverable, deliverable_id)
    if not deliverable or (tenant_id is not None and deliverable.tenant_id != tenant_id):
        raise ValueError("Entregable no encontrado.")

    if data.title is not None:
        deliverable.title = data.title
    if data.notes is not None:
        deliverable.notes = data.notes
    if data.link_url is not None:
        deliverable.link_url = data.link_url
    if data.file_id is not None:
        deliverable.file_id = data.file_id
    if data.submitted_at is not None:
        deliverable.submitted_at = _as_aware(data.submitted_at)

    milestone = _resolve_milestone(session, deliverable.milestone_id, tenant_id)
    if deliverable.submitted_at and milestone.due_date:
        deliverable.is_late = _as_aware(deliverable.submitted_at) > _as_aware(
            milestone.due_date,
        )
        if deliverable.is_late and not milestone.allow_late_submission:
            raise ValueError("Entrega fuera de plazo para este hito.")
    else:
        deliverable.is_late = False

    session.add(deliverable)
    session.commit()
    session.refresh(deliverable)
    return deliverable

