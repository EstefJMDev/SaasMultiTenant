from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.db import get_db
from app.api.deps import get_current_active_user, require_permissions, require_tenant_tool_enabled
from app.core.permissions import TIME_READ, TIME_REPORTS_READ, TIME_TRACK
from app.domains.time.deps import mark_legacy_time_alias, tenant_for_read, tenant_for_write
from app.domains.time.schemas import (
    TimeReportDepartmentRow,
    TimeReportRow,
    TimeSessionCreate,
    TimeSessionRead,
    TimeSessionUpdate,
    TimeTrackingStart,
)
from app.domains.time.service import (
    create_manual_session,
    delete_session,
    get_active_tracking,
    get_reports,
    get_reports_by_department,
    list_sessions,
    start_tracking,
    stop_tracking,
    update_session,
)
from app.models.user import User
from app.platform.tools.deps import require_perm, require_tool

router = APIRouter()
canonical_router = APIRouter(prefix="/time", tags=["time"])


@canonical_router.get("/tracking/active", response_model=Optional[TimeSessionRead])
def api_get_active_tracking(
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user: User = Depends(require_tool("erp", "time")),
) -> Optional[TimeSessionRead]:
    return get_active_tracking(session, current_user, tenant_id)


@canonical_router.post(
    "/tracking/start",
    response_model=TimeSessionRead,
    status_code=status.HTTP_201_CREATED,
)
def api_start_tracking(
    payload: TimeTrackingStart,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user: User = Depends(require_tool("erp", "time")),
) -> TimeSessionRead:
    try:
        return start_tracking(
            session=session,
            user=current_user,
            task_id=payload.task_id,
            tenant_id=tenant_id,
            payload_tenant_id=payload.tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@canonical_router.put("/tracking/stop", response_model=TimeSessionRead)
def api_stop_tracking(
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user: User = Depends(require_tool("erp", "time")),
) -> TimeSessionRead:
    try:
        return stop_tracking(session, current_user, tenant_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@canonical_router.get("/sessions", response_model=list[TimeSessionRead])
def api_list_sessions(
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user: User = Depends(require_tool("erp", "time")),
    _: User = Depends(require_perm(TIME_READ)),
) -> list[TimeSessionRead]:
    return list_sessions(
        session=session,
        user=current_user,
        tenant_id=tenant_id,
        date_from=date_from,
        date_to=date_to,
    )


@canonical_router.post("/sessions", response_model=TimeSessionRead, status_code=status.HTTP_201_CREATED)
def api_create_session(
    payload: TimeSessionCreate,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user: User = Depends(require_tool("erp", "time")),
    _: User = Depends(require_perm(TIME_TRACK)),
) -> TimeSessionRead:
    try:
        return create_manual_session(
            session=session,
            user=current_user,
            task_id=payload.task_id,
            description=payload.description,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            tenant_id=tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@canonical_router.patch("/sessions/{session_id}", response_model=TimeSessionRead)
def api_update_session(
    session_id: int,
    payload: TimeSessionUpdate,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user: User = Depends(require_tool("erp", "time")),
    _: User = Depends(require_perm(TIME_TRACK)),
) -> TimeSessionRead:
    task_id_provided = "task_id" in getattr(payload, "model_fields_set", set()) or "task_id" in getattr(payload, "__fields_set__", set())
    try:
        return update_session(
            session=session,
            user=current_user,
            session_id=session_id,
            task_id=payload.task_id,
            task_id_provided=task_id_provided,
            description=payload.description,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            tenant_id=tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@canonical_router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_session(
    session_id: int,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user: User = Depends(require_tool("erp", "time")),
    _: User = Depends(require_perm(TIME_TRACK)),
) -> None:
    try:
        delete_session(
            session=session,
            user=current_user,
            session_id=session_id,
            tenant_id=tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@canonical_router.get("/reports", response_model=list[TimeReportRow])
def api_time_report(
    project_id: Optional[int] = Query(default=None),
    user_id: Optional[int] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    _: User = Depends(require_tool("erp", "time")),
    current_user: User = Depends(require_perm(TIME_REPORTS_READ)),
) -> list[TimeReportRow]:
    return get_reports(
        session=session,
        tenant_id=tenant_id,
        project_id=project_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )


@canonical_router.get("/reports/by-department", response_model=list[TimeReportDepartmentRow])
def api_time_report_by_department(
    project_id: Optional[int] = Query(default=None),
    user_id: Optional[int] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    _: User = Depends(require_tool("erp", "time")),
    current_user: User = Depends(require_perm(TIME_REPORTS_READ)),
) -> list[TimeReportDepartmentRow]:
    return get_reports_by_department(
        session=session,
        tenant_id=tenant_id,
        project_id=project_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )


legacy_router = APIRouter(
    prefix="/erp",
    tags=["erp"],
    deprecated=True,
    dependencies=[
        Depends(require_tenant_tool_enabled("erp")),
        Depends(mark_legacy_time_alias),
    ],
)


@legacy_router.get("/time-tracking/active", response_model=Optional[TimeSessionRead])
def legacy_get_active_tracking(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(tenant_for_read),
) -> Optional[TimeSessionRead]:
    return get_active_tracking(session, current_user, tenant_id)


@legacy_router.post(
    "/time-tracking/start",
    response_model=TimeSessionRead,
    status_code=status.HTTP_201_CREATED,
)
def legacy_start_tracking(
    data: TimeTrackingStart,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> TimeSessionRead:
    try:
        return start_tracking(
            session=session,
            user=current_user,
            task_id=data.task_id,
            tenant_id=tenant_id,
            payload_tenant_id=data.tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@legacy_router.put("/time-tracking/stop", response_model=TimeSessionRead)
def legacy_stop_tracking(
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> TimeSessionRead:
    session_obj = stop_tracking(session, current_user, tenant_id)
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay sesion activa.",
        )
    return session_obj


@legacy_router.get("/reports/time", response_model=list[TimeReportRow])
def legacy_time_report(
    project_id: Optional[int] = Query(default=None),
    user_id: Optional[int] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user: User = Depends(require_permissions([TIME_REPORTS_READ])),
) -> list[TimeReportRow]:
    rows = get_reports(
        session=session,
        tenant_id=tenant_id,
        project_id=project_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )
    return rows


@legacy_router.get("/reports/time-by-department", response_model=list[TimeReportDepartmentRow])
def legacy_time_report_by_department(
    project_id: Optional[int] = Query(default=None),
    user_id: Optional[int] = Query(default=None),
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user: User = Depends(require_permissions([TIME_REPORTS_READ])),
) -> list[TimeReportDepartmentRow]:
    rows = get_reports_by_department(
        session=session,
        tenant_id=tenant_id,
        project_id=project_id,
        user_id=user_id,
        date_from=date_from,
        date_to=date_to,
    )
    return rows


@legacy_router.get("/time-sessions", response_model=list[TimeSessionRead])
def legacy_list_sessions(
    date_from: Optional[datetime] = Query(default=None),
    date_to: Optional[datetime] = Query(default=None),
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
    current_user: User = Depends(require_permissions([TIME_READ])),
) -> list[TimeSessionRead]:
    return list_sessions(
        session=session,
        user=current_user,
        tenant_id=tenant_id,
        date_from=date_from,
        date_to=date_to,
    )


@legacy_router.post(
    "/time-sessions",
    response_model=TimeSessionRead,
    status_code=status.HTTP_201_CREATED,
)
def legacy_create_time_session(
    payload: TimeSessionCreate,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user: User = Depends(require_permissions([TIME_TRACK])),
) -> TimeSessionRead:
    try:
        return create_manual_session(
            session=session,
            user=current_user,
            task_id=payload.task_id,
            description=payload.description,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            tenant_id=tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@legacy_router.patch("/time-sessions/{session_id}", response_model=TimeSessionRead)
def legacy_update_session(
    session_id: int,
    payload: TimeSessionUpdate,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user: User = Depends(require_permissions([TIME_TRACK])),
) -> TimeSessionRead:
    task_id_provided = "task_id" in getattr(payload, "model_fields_set", set()) or "task_id" in getattr(payload, "__fields_set__", set())
    try:
        return update_session(
            session=session,
            user=current_user,
            session_id=session_id,
            task_id=payload.task_id,
            task_id_provided=task_id_provided,
            description=payload.description,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            tenant_id=tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@legacy_router.delete("/time-sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def legacy_delete_session(
    session_id: int,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
    current_user: User = Depends(require_permissions([TIME_TRACK])),
) -> None:
    try:
        delete_session(
            session=session,
            user=current_user,
            session_id=session_id,
            tenant_id=tenant_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


router.include_router(canonical_router)
router.include_router(legacy_router)
