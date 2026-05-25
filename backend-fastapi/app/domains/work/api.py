from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import require_any_permissions, require_permissions, require_tenant_tool_enabled
from app.core.permissions import WORK_READ, WORK_WRITE
from app.db.session import get_session
from app.domains.work.deps import mark_legacy_work_alias, tenant_for_read, tenant_for_write
from app.domains.work.schemas import (
    ActivityCreate,
    ActivityRead,
    ActivityUpdate,
    DeliverableCreate,
    DeliverableRead,
    DeliverableUpdate,
    MilestoneCreate,
    MilestoneRead,
    MilestoneUpdate,
    SubActivityCreate,
    SubActivityRead,
    SubActivityUpdate,
    TaskCreate,
    TaskRead,
    TaskTemplateCreate,
    TaskTemplateRead,
    TaskUpdate,
)
from app.domains.work.service import (
    create_activity,
    create_deliverable,
    create_milestone,
    create_subactivity,
    create_task,
    create_task_template,
    delete_task,
    list_activities,
    list_deliverables,
    list_milestones,
    list_subactivities,
    list_tasks,
    list_task_templates,
    update_activity,
    update_deliverable,
    update_milestone,
    update_subactivity,
    update_task,
)
from app.domains.work.routers import external_collaborations as legacy_external_collaborations
from app.domains.work.catalog_api import router as catalog_router


router = APIRouter()

base_router = APIRouter()


@base_router.get("/tasks", response_model=list[TaskRead])
def api_list_tasks(
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user=Depends(require_permissions([WORK_READ])),
) -> list[TaskRead]:
    return list_tasks(session, tenant_id)


@base_router.post("/tasks", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def api_create_task(
    payload: TaskCreate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_any_permissions([WORK_WRITE, WORK_READ])),
) -> TaskRead:
    try:
        return create_task(session, current_user, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@base_router.get("/task-templates", response_model=list[TaskTemplateRead])
def api_list_task_templates(
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user=Depends(require_permissions([WORK_READ])),
) -> list[TaskTemplateRead]:
    return list_task_templates(session, tenant_id)


@base_router.post(
    "/task-templates",
    response_model=TaskTemplateRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_task_template(
    payload: TaskTemplateCreate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> TaskTemplateRead:
    return create_task_template(session, payload, tenant_id)


@base_router.get("/activities", response_model=list[ActivityRead])
def api_list_activities(
    project_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user=Depends(require_permissions([WORK_READ])),
) -> list[ActivityRead]:
    return list_activities(session, tenant_id, project_id=project_id)


@base_router.post(
    "/activities",
    response_model=ActivityRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_activity(
    payload: ActivityCreate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> ActivityRead:
    try:
        return create_activity(session, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@base_router.patch("/activities/{activity_id}", response_model=ActivityRead)
def api_update_activity(
    activity_id: int,
    payload: ActivityUpdate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> ActivityRead:
    try:
        return update_activity(session, activity_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@base_router.get("/subactivities", response_model=list[SubActivityRead])
def api_list_subactivities(
    project_id: Optional[int] = Query(default=None),
    activity_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user=Depends(require_permissions([WORK_READ])),
) -> list[SubActivityRead]:
    return list_subactivities(
        session,
        tenant_id,
        project_id=project_id,
        activity_id=activity_id,
    )


@base_router.post(
    "/subactivities",
    response_model=SubActivityRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_subactivity(
    payload: SubActivityCreate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> SubActivityRead:
    try:
        return create_subactivity(session, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@base_router.patch("/subactivities/{subactivity_id}", response_model=SubActivityRead)
def api_update_subactivity(
    subactivity_id: int,
    payload: SubActivityUpdate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> SubActivityRead:
    try:
        return update_subactivity(session, subactivity_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@base_router.get("/milestones", response_model=list[MilestoneRead])
def api_list_milestones(
    project_id: Optional[int] = Query(default=None),
    activity_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user=Depends(require_permissions([WORK_READ])),
) -> list[MilestoneRead]:
    return list_milestones(
        session,
        tenant_id,
        project_id=project_id,
        activity_id=activity_id,
    )


@base_router.post(
    "/milestones",
    response_model=MilestoneRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_milestone(
    payload: MilestoneCreate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> MilestoneRead:
    try:
        return create_milestone(session, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@base_router.patch("/milestones/{milestone_id}", response_model=MilestoneRead)
def api_update_milestone(
    milestone_id: int,
    payload: MilestoneUpdate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> MilestoneRead:
    try:
        return update_milestone(session, milestone_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@base_router.get("/deliverables", response_model=list[DeliverableRead])
def api_list_deliverables(
    milestone_id: Optional[int] = Query(default=None),
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user=Depends(require_permissions([WORK_READ])),
) -> list[DeliverableRead]:
    return list_deliverables(session, tenant_id, milestone_id=milestone_id)


@base_router.post(
    "/deliverables",
    response_model=DeliverableRead,
    status_code=status.HTTP_201_CREATED,
)
def api_create_deliverable(
    payload: DeliverableCreate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> DeliverableRead:
    try:
        return create_deliverable(session, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@base_router.patch("/deliverables/{deliverable_id}", response_model=DeliverableRead)
def api_update_deliverable(
    deliverable_id: int,
    payload: DeliverableUpdate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> DeliverableRead:
    try:
        return update_deliverable(session, deliverable_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@base_router.patch("/tasks/{task_id}", response_model=TaskRead)
def api_update_task(
    task_id: int,
    payload: TaskUpdate,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_any_permissions([WORK_WRITE, WORK_READ])),
) -> TaskRead:
    try:
        return update_task(session, current_user, task_id, payload, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@base_router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_task(
    task_id: int,
    session: Session = Depends(get_session),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user=Depends(require_permissions([WORK_WRITE])),
) -> None:
    try:
        delete_task(session, task_id, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


canonical_router = APIRouter(
    prefix="/work",
    tags=["work"],
    dependencies=[Depends(require_tenant_tool_enabled("erp"))],
)
legacy_router = APIRouter(
    prefix="/erp",
    tags=["erp"],
    deprecated=True,
    dependencies=[
        Depends(require_tenant_tool_enabled("erp")),
        Depends(mark_legacy_work_alias),
    ],
)
legacy_external_router = APIRouter(
    prefix="/erp",
    tags=["erp"],
)

canonical_router.include_router(base_router)
legacy_router.include_router(base_router)
legacy_external_router.include_router(legacy_external_collaborations.router)

router.include_router(canonical_router)
router.include_router(legacy_router)
router.include_router(legacy_external_router)
router.include_router(catalog_router)
