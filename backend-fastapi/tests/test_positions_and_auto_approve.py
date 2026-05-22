"""Tests para Position (organigrama) + auto-aprob 3 dias.

Cubren los casos criticos del requisito de permisos por puesto:
- Capacidades comparativos: create/edit/delete/approve dependen SOLO de Position.
- Department.can_*_comparative columns existen pero el gate runtime las ignora.
- Comparativos pendientes > 3 dias naturales se auto-aprueban.
- UNION menu_visibility cuando empleado pertenece a multiples dptos.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.hr import (
    Department,
    EmployeeDepartment,
    EmployeeProfile,
    Position,
)
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.platform.contracts_core.models import (
    ApprovalStatus,
    ApprovalScope,
    ComparativeStatus,
    Contract,
    ContractDepartment,
    ContractStatus,
    ContractType,
)


def _make_tenant(db: Session) -> Tenant:
    tenant = Tenant(
        name=f"T-{uuid.uuid4().hex[:6]}",
        subdomain=f"tn-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


def _make_user(db: Session, tenant_id: int, role_name: str = "user") -> User:
    role = db.exec(select(Role).where(Role.name == role_name)).one_or_none()
    user = User(
        email=f"u-{uuid.uuid4().hex[:8]}@example.com",
        full_name="Test User",
        hashed_password=hash_password("x"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant_id,
        role_id=role.id if role else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _make_department(
    db: Session,
    tenant_id: int,
    name: str,
    *,
    menu_visibility: dict[str, bool] | None = None,
    can_create: bool = False,
    can_edit: bool = False,
    can_delete: bool = False,
    can_approve: bool = False,
) -> Department:
    dept = Department(
        tenant_id=tenant_id,
        name=name,
        is_active=True,
        menu_visibility=menu_visibility or {},
        can_create_comparative=can_create,
        can_edit_comparative=can_edit,
        can_delete_comparative=can_delete,
        can_approve_comparative=can_approve,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


def _make_position(
    db: Session,
    tenant_id: int,
    name: str,
    *,
    department_id: int | None = None,
    can_create: bool = False,
    can_edit: bool = False,
    can_delete: bool = False,
    can_approve: bool = False,
    is_active: bool = True,
    level: int = 1,
) -> Position:
    pos = Position(
        tenant_id=tenant_id,
        department_id=department_id,
        name=name,
        level=level,
        can_create_comparative=can_create,
        can_edit_comparative=can_edit,
        can_delete_comparative=can_delete,
        can_approve_comparative=can_approve,
        is_active=is_active,
    )
    db.add(pos)
    db.commit()
    db.refresh(pos)
    return pos


def _make_employee(
    db: Session,
    tenant_id: int,
    user_id: int,
    *,
    position_id: int | None = None,
) -> EmployeeProfile:
    emp = EmployeeProfile(
        tenant_id=tenant_id,
        user_id=user_id,
        position_id=position_id,
        is_active=True,
    )
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def _link_emp_dept(
    db: Session,
    employee_id: int,
    department_id: int,
    *,
    is_primary: bool = True,
) -> None:
    link = EmployeeDepartment(
        employee_id=employee_id,
        department_id=department_id,
        is_primary=is_primary,
    )
    db.add(link)
    db.commit()


def _make_pending_comparative(
    db: Session,
    tenant_id: int,
    *,
    created_by_id: int | None = None,
    submitted_at: datetime | None = None,
    comparative_data: dict | None = None,
) -> Contract:
    contract = Contract(
        tenant_id=tenant_id,
        created_by_id=created_by_id,
        type=ContractType.SUMINISTRO,
        supplier_name="Proveedor X",
        status=ContractStatus.PENDING_TEMPLATE,
        comparative_status=ComparativeStatus.PENDING_MGMT_APPROVAL,
        submitted_at=submitted_at,
        comparative_data=comparative_data or {},
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


# ─────────────────────────────────────────────────────────────────────────────
# Tests permisos comparativos (Position + Department, herencia estricta)
# ─────────────────────────────────────────────────────────────────────────────


def test_jefe_obra_can_create_edit_but_not_approve(db_session_fixture: Session) -> None:
    from app.platform.contracts_core import permissions as perms

    tenant = _make_tenant(db_session_fixture)
    user = _make_user(db_session_fixture, tenant.id)
    dept = _make_department(
        db_session_fixture,
        tenant.id,
        "Obra",
        can_create=True,
        can_edit=True,
        can_delete=True,
        can_approve=True,
    )
    pos = _make_position(
        db_session_fixture,
        tenant.id,
        "Jefe de Obra",
        department_id=dept.id,
        can_create=True,
        can_edit=True,
        can_approve=False,
    )
    _make_employee(db_session_fixture, tenant.id, user.id, position_id=pos.id)

    assert perms.can_create_comparative(db_session_fixture, user) is True
    assert perms.can_edit_comparative(db_session_fixture, user) is True
    assert perms.can_approve_comparative(db_session_fixture, user) is False


def test_director_can_approve_when_position_allows(db_session_fixture: Session) -> None:
    """Position concede caps; dept ya no condiciona el gate."""
    from app.platform.contracts_core import permissions as perms

    tenant = _make_tenant(db_session_fixture)
    user = _make_user(db_session_fixture, tenant.id)
    dept = _make_department(db_session_fixture, tenant.id, "Gerencia")
    pos = _make_position(
        db_session_fixture,
        tenant.id,
        "Director General",
        department_id=dept.id,
        can_create=True,
        can_edit=True,
        can_delete=True,
        can_approve=True,
    )
    _make_employee(db_session_fixture, tenant.id, user.id, position_id=pos.id)

    assert perms.can_create_comparative(db_session_fixture, user) is True
    assert perms.can_edit_comparative(db_session_fixture, user) is True
    assert perms.can_delete_comparative(db_session_fixture, user) is True
    assert perms.can_approve_comparative(db_session_fixture, user) is True


def test_position_cap_independent_from_dept(db_session_fixture: Session) -> None:
    """La cap del puesto manda; el dept ya no la bloquea."""
    from app.platform.contracts_core import permissions as perms

    tenant = _make_tenant(db_session_fixture)
    user = _make_user(db_session_fixture, tenant.id)
    dept = _make_department(
        db_session_fixture,
        tenant.id,
        "Obra",
        can_create=True,
        can_edit=False,  # dept no marca edit
        can_delete=False,
        can_approve=False,
    )
    pos = _make_position(
        db_session_fixture,
        tenant.id,
        "Jefe de Obra",
        department_id=dept.id,
        can_create=True,
        can_edit=True,  # position marca edit aunque dept no
    )
    _make_employee(db_session_fixture, tenant.id, user.id, position_id=pos.id)

    assert perms.can_create_comparative(db_session_fixture, user) is True
    assert perms.can_edit_comparative(db_session_fixture, user) is True


def test_user_without_position_has_no_permissions(db_session_fixture: Session) -> None:
    from app.platform.contracts_core import permissions as perms

    tenant = _make_tenant(db_session_fixture)
    user = _make_user(db_session_fixture, tenant.id)
    _make_employee(db_session_fixture, tenant.id, user.id, position_id=None)

    assert perms.can_create_comparative(db_session_fixture, user) is False
    assert perms.can_approve_comparative(db_session_fixture, user) is False


def test_inactive_position_does_not_grant_permissions(db_session_fixture: Session) -> None:
    from app.platform.contracts_core import permissions as perms

    tenant = _make_tenant(db_session_fixture)
    user = _make_user(db_session_fixture, tenant.id)
    pos = _make_position(
        db_session_fixture,
        tenant.id,
        "Director Tecnico inactivo",
        can_approve=True,
        is_active=False,
    )
    _make_employee(db_session_fixture, tenant.id, user.id, position_id=pos.id)

    assert perms.can_approve_comparative(db_session_fixture, user) is False


def test_super_admin_bypasses_all_caps(db_session_fixture: Session) -> None:
    """Super admin sin employee/position debe tener todas las capacidades."""
    from app.platform.contracts_core import permissions as perms

    tenant = _make_tenant(db_session_fixture)
    user = User(
        email=f"god-{uuid.uuid4().hex[:6]}@cortecelestial.god",
        full_name="Super Admin",
        hashed_password=hash_password("x"),
        is_active=True,
        is_super_admin=True,
        tenant_id=tenant.id,
    )
    db_session_fixture.add(user)
    db_session_fixture.commit()
    db_session_fixture.refresh(user)

    assert perms.can_create_comparative(db_session_fixture, user) is True
    assert perms.can_edit_comparative(db_session_fixture, user) is True
    assert perms.can_delete_comparative(db_session_fixture, user) is True
    assert perms.can_approve_comparative(db_session_fixture, user) is True


# ─────────────────────────────────────────────────────────────────────────────
# Tests auto-aprobacion 3 dias
# ─────────────────────────────────────────────────────────────────────────────


def test_auto_approve_stale_comparative_after_3_days(
    db_session_fixture: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.domains.procurement.comparatives import service as comparatives_service

    monkeypatch.setattr(
        comparatives_service,
        "send_contract_notification",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        comparatives_service,
        "get_department_recipients",
        lambda session, tenant_id: {
            "administracion": [],
            "compras": [],
            "juridico": [],
            "jefe_obra": [],
        },
    )

    tenant = _make_tenant(db_session_fixture)
    submitted = datetime.now(timezone.utc) - timedelta(days=4)
    contract = _make_pending_comparative(
        db_session_fixture, tenant.id, submitted_at=submitted
    )

    summary = comparatives_service.auto_approve_stale_comparatives(
        session=db_session_fixture,
        grace_days=3,
        batch_size=10,
    )

    assert summary["approved"] >= 1
    db_session_fixture.expire(contract)
    refreshed = db_session_fixture.get(Contract, contract.id)
    assert refreshed.comparative_status == ComparativeStatus.APPROVED
    assert refreshed.approved_at is not None
    assert (refreshed.comparative_data or {}).get("auto_approved") is True


def test_auto_approve_skips_fresh_comparative(
    db_session_fixture: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.domains.procurement.comparatives import service as comparatives_service

    monkeypatch.setattr(
        comparatives_service,
        "send_contract_notification",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        comparatives_service,
        "get_department_recipients",
        lambda session, tenant_id: {
            "administracion": [],
            "compras": [],
            "juridico": [],
            "jefe_obra": [],
        },
    )

    tenant = _make_tenant(db_session_fixture)
    submitted = datetime.now(timezone.utc) - timedelta(days=1)
    contract = _make_pending_comparative(
        db_session_fixture, tenant.id, submitted_at=submitted
    )

    comparatives_service.auto_approve_stale_comparatives(
        session=db_session_fixture,
        grace_days=3,
        batch_size=10,
    )

    refreshed = db_session_fixture.get(Contract, contract.id)
    assert refreshed.comparative_status == ComparativeStatus.PENDING_MGMT_APPROVAL


# ─────────────────────────────────────────────────────────────────────────────
# Tests menu_visibility UNION
# ─────────────────────────────────────────────────────────────────────────────


def test_menu_visibility_union_multi_department(db_session_fixture: Session) -> None:
    from app.services.user_service import get_user_me

    tenant = _make_tenant(db_session_fixture)
    user = _make_user(db_session_fixture, tenant.id)

    dept_obra = _make_department(
        db_session_fixture,
        tenant.id,
        "Obra",
        menu_visibility={
            "dashboard": True,
            "work_comparatives": True,
            "erp": False,
            "hr": False,
        },
    )
    dept_gerencia = _make_department(
        db_session_fixture,
        tenant.id,
        "Gerencia",
        menu_visibility={
            "dashboard": True,
            "work_comparatives": True,
            "erp": True,
            "hr": True,
        },
    )
    emp = _make_employee(db_session_fixture, tenant.id, user.id)
    _link_emp_dept(db_session_fixture, emp.id, dept_obra.id, is_primary=True)
    _link_emp_dept(db_session_fixture, emp.id, dept_gerencia.id, is_primary=False)

    user_read = get_user_me(db_session_fixture, user)
    nav = user_read.department_nav_config or {}
    assert nav.get("dashboard") is True
    assert nav.get("work_comparatives") is True
    assert nav.get("erp") is True
    assert nav.get("hr") is True


def test_menu_visibility_solo_obra_restringe_modulos(db_session_fixture: Session) -> None:
    from app.services.user_service import get_user_me

    tenant = _make_tenant(db_session_fixture)
    user = _make_user(db_session_fixture, tenant.id)

    dept_obra = _make_department(
        db_session_fixture,
        tenant.id,
        "Obra",
        menu_visibility={
            "dashboard": True,
            "work_comparatives": True,
            "erp": False,
            "hr": False,
        },
    )
    emp = _make_employee(db_session_fixture, tenant.id, user.id)
    _link_emp_dept(db_session_fixture, emp.id, dept_obra.id, is_primary=True)

    user_read = get_user_me(db_session_fixture, user)
    nav = user_read.department_nav_config or {}
    assert nav.get("dashboard") is True
    assert nav.get("work_comparatives") is True
    assert nav.get("erp") is False
    assert nav.get("hr") is False


# ─────────────────────────────────────────────────────────────────────────────
# Test integracion: /me expone flags Position
# ─────────────────────────────────────────────────────────────────────────────


def test_user_me_exposes_comparative_caps(db_session_fixture: Session) -> None:
    from app.services.user_service import get_user_me

    tenant = _make_tenant(db_session_fixture)
    user = _make_user(db_session_fixture, tenant.id)
    dept = _make_department(
        db_session_fixture,
        tenant.id,
        "Gerencia",
        can_create=True,
        can_edit=True,
        can_delete=True,
        can_approve=True,
    )
    pos = _make_position(
        db_session_fixture,
        tenant.id,
        "Gerente",
        department_id=dept.id,
        can_create=True,
        can_edit=True,
        can_delete=True,
        can_approve=True,
    )
    _make_employee(db_session_fixture, tenant.id, user.id, position_id=pos.id)

    user_read = get_user_me(db_session_fixture, user)
    assert user_read.position_id == pos.id
    assert user_read.position_name == "Gerente"
    assert user_read.can_create_comparative is True
    assert user_read.can_edit_comparative is True
    assert user_read.can_delete_comparative is True
    assert user_read.can_approve_comparative is True
