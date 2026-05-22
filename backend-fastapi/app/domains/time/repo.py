from datetime import datetime, timezone
from decimal import Decimal
import logging
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from sqlalchemy import func

from app.core.config import settings
from app.models.erp import Project, Task, TimeEntry, TimeEntryDepartmentSplit, TimeSession
from app.models.hr import Department, EmployeeDepartment, EmployeeProfile
from app.models.user import User

logger = logging.getLogger("app.domains.time.repo")
_DEFAULT_MAX_SESSION_HOURS = Decimal("16")


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


def _clamped_session_hours(
    *,
    duration_seconds: int,
    session_id: Optional[int],
    tenant_id: Optional[int],
    user_id: Optional[int],
) -> Decimal:
    raw_hours = Decimal(max(0, int(duration_seconds))) / Decimal(3600)
    try:
        max_hours = Decimal(str(settings.time_max_session_hours))
    except Exception:
        max_hours = _DEFAULT_MAX_SESSION_HOURS
    if max_hours <= 0:
        max_hours = _DEFAULT_MAX_SESSION_HOURS

    clamped = min(raw_hours, max_hours)
    if clamped < raw_hours:
        logger.warning(
            "Time session hours truncated session_id=%s tenant_id=%s user_id=%s raw_hours=%s max_hours=%s",
            session_id,
            tenant_id,
            user_id,
            raw_hours,
            max_hours,
        )
    return clamped.quantize(Decimal("0.01"))


def _get_employee_department_distribution(
    session: Session,
    *,
    tenant_id: Optional[int],
    user_id: Optional[int],
) -> list[tuple[int, Decimal]]:
    if tenant_id is None or user_id is None:
        return []
    profile = session.exec(
        select(EmployeeProfile).where(
            EmployeeProfile.tenant_id == tenant_id,
            EmployeeProfile.user_id == user_id,
            EmployeeProfile.is_active.is_(True),
        )
    ).first()
    if not profile:
        return []
    links = session.exec(
        select(EmployeeDepartment).where(EmployeeDepartment.employee_id == profile.id)
    ).all()
    if not links:
        return []
    rows: list[tuple[int, Decimal]] = []
    total = Decimal("0")
    for link in links:
        pct = Decimal(link.allocation_percentage or 0)
        if pct <= 0:
            continue
        rows.append((link.department_id, pct))
        total += pct
    if not rows or total <= 0:
        return []
    normalized: list[tuple[int, Decimal]] = []
    for dept_id, pct in rows:
        normalized_pct = (pct * Decimal(100) / total).quantize(Decimal("0.01"))
        normalized.append((dept_id, normalized_pct))
    return normalized


def _store_time_entry_department_splits(
    session: Session,
    *,
    entry: TimeEntry,
) -> None:
    if not entry.id:
        session.flush()
    existing = session.exec(
        select(TimeEntryDepartmentSplit).where(
            TimeEntryDepartmentSplit.time_entry_id == entry.id
        )
    ).all()
    for split in existing:
        session.delete(split)

    distribution = _get_employee_department_distribution(
        session,
        tenant_id=entry.tenant_id,
        user_id=entry.user_id,
    )
    if not distribution:
        return

    total_hours = Decimal(entry.hours or 0).quantize(Decimal("0.01"))
    if total_hours <= 0:
        return

    split_rows: list[tuple[int, Decimal, Decimal]] = []
    accumulated = Decimal("0.00")
    for idx, (department_id, pct) in enumerate(distribution):
        if idx == len(distribution) - 1:
            hours = (total_hours - accumulated).quantize(Decimal("0.01"))
        else:
            hours = (total_hours * pct / Decimal(100)).quantize(Decimal("0.01"))
            accumulated += hours
        split_rows.append((department_id, pct, hours))

    for department_id, pct, hours in split_rows:
        session.add(
            TimeEntryDepartmentSplit(
                tenant_id=entry.tenant_id,
                time_entry_id=entry.id,
                user_id=entry.user_id,
                department_id=department_id,
                percentage=pct,
                hours=hours,
                created_at=entry.created_at,
            )
        )


def get_active_session(
    session: Session,
    user: User,
    tenant_id: Optional[int],
) -> Optional[TimeSession]:
    stmt = select(TimeSession).where(
        TimeSession.user_id == user.id,
        TimeSession.is_active.is_(True),
    )
    if tenant_id is not None:
        stmt = stmt.where(TimeSession.tenant_id == tenant_id)
    # one_or_none() lanza excepción si hay más de una sesión activa.
    # En esos casos priorizamos la más reciente para evitar 500 en runtime.
    rows = session.exec(stmt.order_by(TimeSession.started_at.desc())).all()
    if not rows:
        return None
    if len(rows) > 1:
        logger.warning(
            "Multiple active time sessions found user_id=%s tenant_id=%s count=%s; using latest session_id=%s",
            user.id,
            tenant_id,
            len(rows),
            rows[0].id,
        )
    return rows[0]


def start_session(
    session: Session,
    user: User,
    *,
    task_id: Optional[int],
    tenant_id: Optional[int],
    payload_tenant_id: Optional[int] = None,
) -> TimeSession:
    if payload_tenant_id is not None and not user.is_super_admin:
        if user.tenant_id is None or payload_tenant_id != user.tenant_id:
            raise ValueError(
                "No tienes permisos para iniciar sesiones para otros tenants."
            )

    task: Optional[Task] = None
    if task_id is not None:
        task = session.get(Task, task_id)
        if not task:
            raise ValueError("Tarea no encontrada")

    resolved_tenant_id = payload_tenant_id or tenant_id or (task.tenant_id if task else None) or user.tenant_id
    if resolved_tenant_id is None:
        raise ValueError("Tenant requerido para iniciar una sesión sin tarea.")

    if task and task.tenant_id is not None and resolved_tenant_id is not None and task.tenant_id != resolved_tenant_id:
        raise ValueError("Tarea no encontrada")

    active = get_active_session(session, user, resolved_tenant_id)
    now = datetime.now(timezone.utc)

    if active:
        active_ended = _as_aware(active.ended_at or now)
        active_started = _as_aware(active.started_at)
        active.ended_at = active_ended
        delta = active_ended - active_started
        active.duration_seconds = max(0, int(delta.total_seconds()))
        active.is_active = False
        session.add(active)

        if active.task_id is not None:
            hours_decimal = _clamped_session_hours(
                duration_seconds=active.duration_seconds,
                session_id=active.id,
                tenant_id=active.tenant_id,
                user_id=user.id,
            )
            time_entry = TimeEntry(
                tenant_id=active.tenant_id,
                task_id=active.task_id,
                user_id=user.id,
                time_session_id=active.id,
                hours=hours_decimal,
                description="Generado automaticamente desde control de tiempo",
                created_at=now,
            )
            session.add(time_entry)
            session.flush()
            _store_time_entry_department_splits(session, entry=time_entry)

    new_session = TimeSession(
        tenant_id=resolved_tenant_id,
        task_id=task_id,
        user_id=user.id,
        started_at=now,
        ended_at=None,
        duration_seconds=0,
        is_active=True,
        created_at=now,
    )
    session.add(new_session)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        if task_id is None:
            raise ValueError(
                "No se pudo iniciar sesión sin tarea: la BD requiere task_id. Reinicia backend para aplicar ajustes de esquema."
            ) from exc
        raise
    session.refresh(new_session)
    return new_session


def stop_session(
    session: Session,
    user: User,
    tenant_id: Optional[int],
) -> Optional[TimeSession]:
    active = get_active_session(session, user, tenant_id)
    if not active:
        return None

    now = datetime.now(timezone.utc)
    active_started = _as_aware(active.started_at)
    active_ended = _as_aware(now)
    active.ended_at = active_ended
    delta = active_ended - active_started
    active.duration_seconds = max(0, int(delta.total_seconds()))
    active.is_active = False
    session.add(active)

    if active.task_id is not None:
        hours_decimal = _clamped_session_hours(
            duration_seconds=active.duration_seconds,
            session_id=active.id,
            tenant_id=active.tenant_id,
            user_id=user.id,
        )
        time_entry = TimeEntry(
            tenant_id=active.tenant_id,
            task_id=active.task_id,
            user_id=user.id,
            time_session_id=active.id,
            hours=hours_decimal,
            description="Generado automaticamente desde control de tiempo",
            created_at=now,
        )
        session.add(time_entry)
        session.flush()
        _store_time_entry_department_splits(session, entry=time_entry)

    session.commit()
    session.refresh(active)
    return active


def list_sessions(
    session: Session,
    user: User,
    *,
    tenant_id: Optional[int],
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> list[TimeSession]:
    stmt = select(TimeSession).where(TimeSession.user_id == user.id)
    if tenant_id is not None:
        stmt = stmt.where(TimeSession.tenant_id == tenant_id)
    if date_from is not None:
        stmt = stmt.where(TimeSession.started_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(TimeSession.started_at <= date_to)
    return session.exec(stmt.order_by(TimeSession.started_at.desc())).all()


def create_manual_session(
    session: Session,
    user: User,
    *,
    task_id: Optional[int],
    description: Optional[str],
    started_at: datetime,
    ended_at: datetime,
    tenant_id: Optional[int],
) -> TimeSession:
    task: Optional[Task] = None
    if task_id is not None:
        task = session.get(Task, task_id)
        if not task:
            raise ValueError("Tarea no encontrada")

    resolved_tenant_id = tenant_id or (task.tenant_id if task else None) or user.tenant_id
    if resolved_tenant_id is None:
        raise ValueError("Tenant requerido para crear una sesión sin tarea.")
    if task and task.tenant_id is not None and resolved_tenant_id is not None and task.tenant_id != resolved_tenant_id:
        raise ValueError("Tarea no encontrada")

    started = _as_aware(started_at)
    ended = _as_aware(ended_at)
    if ended <= started:
        raise ValueError("La fecha de fin debe ser posterior al inicio")

    duration_seconds = max(0, int((ended - started).total_seconds()))
    new_session = TimeSession(
        tenant_id=resolved_tenant_id,
        task_id=task_id,
        user_id=user.id,
        description=description,
        started_at=started,
        ended_at=ended,
        duration_seconds=duration_seconds,
        is_active=False,
        created_at=datetime.now(timezone.utc),
    )
    session.add(new_session)
    session.commit()
    session.refresh(new_session)

    hours_decimal = Decimal(duration_seconds) / Decimal(3600)
    hours_decimal = hours_decimal.quantize(Decimal("0.01"))
    if task_id is not None:
        time_entry = TimeEntry(
            tenant_id=resolved_tenant_id,
            task_id=task_id,
            user_id=user.id,
            time_session_id=new_session.id,
            hours=hours_decimal,
            description=description or "Entrada manual de calendario",
            created_at=ended,
        )
        session.add(time_entry)
        session.flush()
        _store_time_entry_department_splits(session, entry=time_entry)
        session.commit()

    return new_session


def update_session(
    session: Session,
    user: User,
    *,
    session_id: int,
    task_id: Optional[int] = None,
    task_id_provided: bool = False,
    description: Optional[str] = None,
    started_at: Optional[datetime] = None,
    ended_at: Optional[datetime] = None,
    tenant_id: Optional[int] = None,
) -> TimeSession:
    ts = session.get(TimeSession, session_id)
    if not ts or ts.user_id != user.id or (tenant_id is not None and ts.tenant_id != tenant_id):
        raise ValueError("Sesion no encontrada")

    now = datetime.now(timezone.utc)
    if ts.is_active and (started_at is not None or ended_at is not None):
        raise ValueError("No se pueden editar fechas de una sesion activa")

    new_started = _as_aware(started_at) if started_at is not None else _as_aware(ts.started_at)
    new_ended = _as_aware(ended_at) if ended_at is not None else (_as_aware(ts.ended_at) if ts.ended_at else None)

    if new_started > now:
        raise ValueError("La fecha de inicio no puede estar en el futuro")
    if new_ended is not None and new_ended <= new_started:
        raise ValueError("La fecha de fin debe ser posterior al inicio")

    if task_id_provided:
        if task_id is None:
            ts.task_id = None
        else:
            task = session.get(Task, task_id)
            if not task or (tenant_id is not None and task.tenant_id != tenant_id):
                raise ValueError("Tarea no encontrada")
            ts.task_id = task_id

    if description is not None:
        ts.description = description

    if started_at is not None:
        ts.started_at = new_started
    if ended_at is not None:
        ts.ended_at = new_ended

    if ts.ended_at and ts.started_at:
        delta = _as_aware(ts.ended_at) - _as_aware(ts.started_at)
        ts.duration_seconds = max(0, int(delta.total_seconds()))
        ts.is_active = False

    session.add(ts)
    session.commit()
    session.refresh(ts)

    entry = session.exec(
        select(TimeEntry).where(TimeEntry.time_session_id == ts.id),
    ).one_or_none()
    if entry:
        hours_decimal = Decimal(ts.duration_seconds) / Decimal(3600)
        entry.hours = hours_decimal.quantize(Decimal("0.01"))
        entry.task_id = ts.task_id
        entry.user_id = user.id
        entry.created_at = ts.ended_at or ts.started_at
        if description is not None:
            entry.description = description
        session.add(entry)
        session.flush()
        _store_time_entry_department_splits(session, entry=entry)
        session.commit()
        session.refresh(entry)
    elif ts.task_id is not None and ts.ended_at is not None:
        hours_decimal = Decimal(ts.duration_seconds) / Decimal(3600)
        hours_decimal = hours_decimal.quantize(Decimal("0.01"))
        time_entry = TimeEntry(
            tenant_id=ts.tenant_id,
            task_id=ts.task_id,
            user_id=user.id,
            time_session_id=ts.id,
            hours=hours_decimal,
            description=ts.description or "Generado automaticamente desde control de tiempo",
            created_at=ts.ended_at,
        )
        session.add(time_entry)
        session.flush()
        _store_time_entry_department_splits(session, entry=time_entry)
        session.commit()

    return ts


def delete_session(
    session: Session,
    user: User,
    *,
    session_id: int,
    tenant_id: Optional[int],
) -> None:
    ts = session.get(TimeSession, session_id)
    if not ts or ts.user_id != user.id or (tenant_id is not None and ts.tenant_id != tenant_id):
        raise ValueError("Sesion no encontrada")

    entries = session.exec(
        select(TimeEntry).where(TimeEntry.time_session_id == ts.id),
    ).all()
    for entry in entries:
        splits = session.exec(
            select(TimeEntryDepartmentSplit).where(
                TimeEntryDepartmentSplit.time_entry_id == entry.id
            )
        ).all()
        for split in splits:
            session.delete(split)
        session.delete(entry)
    session.delete(ts)
    session.commit()


def get_report(
    session: Session,
    *,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
    user_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> list[dict]:
    work_datetime = func.coalesce(TimeSession.started_at, TimeEntry.created_at)
    stmt = (
        select(
            Task.project_id.label("project_id"),
            Project.name.label("project_name"),
            Task.id.label("task_id"),
            Task.title.label("task_title"),
            User.id.label("user_id"),
            User.email.label("username"),
            func.sum(TimeEntry.hours).label("total_hours"),
            EmployeeProfile.hourly_rate.label("hourly_rate"),
        )
        .select_from(TimeEntry)
        .join(Task, Task.id == TimeEntry.task_id)
        .outerjoin(TimeSession, TimeSession.id == TimeEntry.time_session_id)
        .outerjoin(Project, Project.id == Task.project_id)
        .outerjoin(User, User.id == TimeEntry.user_id)
        .outerjoin(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .group_by(
            Task.project_id,
            Project.name,
            Task.id,
            Task.title,
            User.id,
            User.email,
            EmployeeProfile.hourly_rate,
        )
        .order_by(Project.name, Task.title, User.email)
    )

    if project_id is not None:
        _get_project_or_404(session, project_id, tenant_id)
        stmt = stmt.where(Task.project_id == project_id)
    if tenant_id is not None:
        stmt = stmt.where(Task.tenant_id == tenant_id)
    if user_id is not None:
        stmt = stmt.where(TimeEntry.user_id == user_id)
    if date_from is not None:
        stmt = stmt.where(work_datetime >= date_from)
    if date_to is not None:
        stmt = stmt.where(work_datetime <= date_to)

    rows = session.exec(stmt).all()
    return [
        {
            "project_id": row.project_id,
            "project_name": row.project_name,
            "task_id": row.task_id,
            "task_title": row.task_title,
            "user_id": row.user_id,
            "username": row.username,
            "total_hours": row.total_hours,
            "hourly_rate": row.hourly_rate,
        }
        for row in rows
    ]


def get_report_by_department(
    session: Session,
    *,
    tenant_id: Optional[int],
    project_id: Optional[int] = None,
    user_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> list[dict]:
    work_datetime = func.coalesce(TimeSession.started_at, TimeEntry.created_at)
    stmt = (
        select(
            TimeEntryDepartmentSplit.department_id.label("department_id"),
            Department.name.label("department_name"),
            User.id.label("user_id"),
            User.email.label("username"),
            func.sum(TimeEntryDepartmentSplit.hours).label("total_hours"),
        )
        .select_from(TimeEntryDepartmentSplit)
        .join(TimeEntry, TimeEntry.id == TimeEntryDepartmentSplit.time_entry_id)
        .outerjoin(TimeSession, TimeSession.id == TimeEntry.time_session_id)
        .join(Task, Task.id == TimeEntry.task_id)
        .join(Department, Department.id == TimeEntryDepartmentSplit.department_id)
        .outerjoin(User, User.id == TimeEntryDepartmentSplit.user_id)
        .group_by(
            TimeEntryDepartmentSplit.department_id,
            Department.name,
            User.id,
            User.email,
        )
        .order_by(Department.name, User.email)
    )

    if project_id is not None:
        _get_project_or_404(session, project_id, tenant_id)
        stmt = stmt.where(Task.project_id == project_id)
    if tenant_id is not None:
        stmt = stmt.where(TimeEntryDepartmentSplit.tenant_id == tenant_id)
    if user_id is not None:
        stmt = stmt.where(TimeEntryDepartmentSplit.user_id == user_id)
    if date_from is not None:
        stmt = stmt.where(work_datetime >= date_from)
    if date_to is not None:
        stmt = stmt.where(work_datetime <= date_to)

    rows = session.exec(stmt).all()
    return [
        {
            "department_id": row.department_id,
            "department_name": row.department_name,
            "user_id": row.user_id,
            "username": row.username,
            "total_hours": row.total_hours,
        }
        for row in rows
    ]
