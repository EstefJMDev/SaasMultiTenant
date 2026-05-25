from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from app.core.audit import log_action
from app.core.user_me_cache import invalidate_user_me_cache
from app.domains.org import repo
from app.models.hr import Department, EmployeeDepartment, EmployeeProfile
from app.models.user import User
from app.schemas.hr import DepartmentCreate, DepartmentRead, DepartmentUpdate


DEFAULT_MENU_VISIBILITY = DepartmentCreate(name="tmp").menu_visibility.model_dump()


def _normalize_menu_visibility(value: object | None) -> dict[str, bool]:
    if not isinstance(value, dict):
        return DEFAULT_MENU_VISIBILITY.copy()
    merged = DEFAULT_MENU_VISIBILITY.copy()
    for key, default_value in DEFAULT_MENU_VISIBILITY.items():
        raw = value.get(key, default_value)
        merged[key] = bool(raw)
    return merged


def _ensure_same_tenant(tenant_id: int, user: User) -> None:
    if user.is_super_admin:
        return
    if not user.tenant_id or user.tenant_id != tenant_id:
        raise PermissionError("No tienes permisos para gestionar este tenant")


def _to_read(dept: Department) -> DepartmentRead:
    return DepartmentRead(
        id=dept.id,
        tenant_id=dept.tenant_id,
        name=dept.name,
        description=dept.description,
        manager_id=dept.manager_id,
        is_active=dept.is_active,
        project_allocation_percentage=dept.project_allocation_percentage,
        menu_visibility=_normalize_menu_visibility(dept.menu_visibility),
        can_create_comparative=dept.can_create_comparative,
        can_edit_comparative=dept.can_edit_comparative,
        can_delete_comparative=dept.can_delete_comparative,
        can_approve_comparative=dept.can_approve_comparative,
        can_reject_comparative=getattr(dept, "can_reject_comparative", False),
        can_view_contract=getattr(dept, "can_view_contract", False),
        can_edit_contract=getattr(dept, "can_edit_contract", False),
        can_regenerate_contract=getattr(dept, "can_regenerate_contract", False),
        can_approve_contract=getattr(dept, "can_approve_contract", False),
        can_reject_contract=getattr(dept, "can_reject_contract", False),
        can_view_worksite=getattr(dept, "can_view_worksite", False),
        can_edit_worksite=getattr(dept, "can_edit_worksite", False),
        can_view_provider=getattr(dept, "can_view_provider", False),
        can_edit_provider=getattr(dept, "can_edit_provider", False),
        created_at=dept.created_at,
    )


def create_department(
    session: Session,
    current_user: User,
    tenant_id: int,
    data: DepartmentCreate,
) -> DepartmentRead:
    _ensure_same_tenant(tenant_id, current_user)

    if data.manager_id is not None:
        manager = repo.get_user(session, data.manager_id)
        if not manager or manager.tenant_id != tenant_id:
            raise ValueError("El manager debe pertenecer al mismo tenant")

    dept = Department(
        tenant_id=tenant_id,
        name=data.name,
        description=data.description,
        manager_id=data.manager_id,
        is_active=data.is_active,
        project_allocation_percentage=data.project_allocation_percentage,
        menu_visibility=_normalize_menu_visibility(data.menu_visibility.model_dump()),
        can_create_comparative=data.can_create_comparative,
        can_edit_comparative=data.can_edit_comparative,
        can_delete_comparative=data.can_delete_comparative,
        can_approve_comparative=data.can_approve_comparative,
        can_reject_comparative=data.can_reject_comparative,
        can_view_contract=data.can_view_contract,
        can_edit_contract=data.can_edit_contract,
        can_regenerate_contract=data.can_regenerate_contract,
        can_approve_contract=data.can_approve_contract,
        can_reject_contract=data.can_reject_contract,
        can_view_worksite=data.can_view_worksite,
        can_edit_worksite=data.can_edit_worksite,
        can_view_provider=data.can_view_provider,
        can_edit_provider=data.can_edit_provider,
    )
    session.add(dept)
    session.commit()
    session.refresh(dept)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="hr.department.create",
        details=f"Departamento creado: {dept.name}",
    )

    return _to_read(dept)


def list_departments(
    session: Session,
    current_user: User,
    tenant_id: Optional[int] = None,
) -> list[DepartmentRead]:
    if not current_user.is_super_admin:
        tenant_id = current_user.tenant_id

    depts = repo.list_departments(session, tenant_id)
    return [_to_read(d) for d in depts]


def update_department(
    session: Session,
    current_user: User,
    dept_id: int,
    data: DepartmentUpdate,
) -> DepartmentRead:
    dept = repo.get_department(session, dept_id)
    if not dept:
        raise ValueError("Departamento no encontrado")

    _ensure_same_tenant(dept.tenant_id, current_user)

    if data.manager_id is not None:
        manager = repo.get_user(session, data.manager_id)
        if not manager or manager.tenant_id != dept.tenant_id:
            raise ValueError("El manager debe pertenecer al mismo tenant")

    if data.name is not None:
        dept.name = data.name
    if data.description is not None:
        dept.description = data.description
    if data.manager_id is not None:
        dept.manager_id = data.manager_id
    if data.is_active is not None:
        dept.is_active = data.is_active
    if data.project_allocation_percentage is not None:
        dept.project_allocation_percentage = data.project_allocation_percentage
    if data.menu_visibility is not None:
        dept.menu_visibility = _normalize_menu_visibility(data.menu_visibility.model_dump())

    for cap in (
        "can_create_comparative",
        "can_edit_comparative",
        "can_delete_comparative",
        "can_approve_comparative",
        "can_reject_comparative",
        "can_view_contract",
        "can_edit_contract",
        "can_regenerate_contract",
        "can_approve_contract",
        "can_reject_contract",
        "can_view_worksite",
        "can_edit_worksite",
        "can_view_provider",
        "can_edit_provider",
    ):
        value = getattr(data, cap)
        if value is None:
            continue
        setattr(dept, cap, value)

    session.add(dept)
    session.commit()
    session.refresh(dept)

    affected_user_ids = session.exec(
        select(EmployeeProfile.user_id)
        .join(EmployeeDepartment, EmployeeDepartment.employee_id == EmployeeProfile.id)
        .where(
            EmployeeDepartment.department_id == dept.id,
            EmployeeProfile.tenant_id == dept.tenant_id,
            EmployeeProfile.is_active.is_(True),
        )
    ).all()
    for uid in affected_user_ids:
        invalidate_user_me_cache(uid)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=dept.tenant_id,
        action="hr.department.update",
        details=f"Departamento actualizado: {dept.id}",
    )

    return _to_read(dept)


def delete_department(
    session: Session,
    current_user: User,
    dept_id: int,
    cascade: bool = False,
) -> None:
    dept = repo.get_department(session, dept_id)
    if not dept:
        raise ValueError("Departamento no encontrado")

    _ensure_same_tenant(dept.tenant_id, current_user)

    references = repo.count_department_links(session, dept.id)
    if not cascade:
        for label, used in references:
            if int(used or 0) > 0:
                raise ValueError(
                    f"No se puede eliminar el departamento porque tiene {label} asociados. "
                    "Reasigna o limpia esos datos antes de eliminar."
                )
    else:
        links = repo.list_department_links(session, dept.id)
        affected_employee_ids = {link.employee_id for link in links["employee_departments"]}
        for link in links["employee_departments"]:
            session.delete(link)

        for alloc in links["allocations"]:
            alloc.department_id = None
            session.add(alloc)

        for project in links["projects"]:
            project.department_id = None
            session.add(project)

        for invoice in links["invoices"]:
            invoice.department_id = None
            session.add(invoice)

        for split in links["splits"]:
            session.delete(split)

        for step in links["workflow_steps"]:
            step.department_id = None
            session.add(step)

        for approval in links["workflow_approvals"]:
            approval.department_id = None
            session.add(approval)

        if affected_employee_ids:
            for employee_id in affected_employee_ids:
                remaining = repo.list_employee_departments_by_employee_id(session, employee_id)
                if not remaining:
                    continue
                for item in remaining:
                    item.is_primary = False
                    session.add(item)
                top = sorted(
                    remaining,
                    key=lambda item: Decimal(item.allocation_percentage or 0),
                    reverse=True,
                )[0]
                top.is_primary = True
                session.add(top)

    session.delete(dept)
    session.commit()

    if cascade and affected_employee_ids:
        affected_user_ids = session.exec(
            select(EmployeeProfile.user_id).where(
                EmployeeProfile.id.in_(affected_employee_ids),
                EmployeeProfile.tenant_id == dept.tenant_id,
                EmployeeProfile.is_active.is_(True),
            )
        ).all()
        for uid in affected_user_ids:
            invalidate_user_me_cache(uid)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=dept.tenant_id,
        action="hr.department.delete",
        details=f"Departamento eliminado: {dept.id}",
    )
