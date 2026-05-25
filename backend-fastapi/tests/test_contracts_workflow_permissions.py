from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlmodel import select

from app.platform.contracts_core.models import ApprovalStatus, ContractApproval, ContractDepartment, ContractStatus
from app.platform.contracts_core.permissions import can_create_contract, department_for_user
from app.domains.procurement.api import (
    get_contract_workflow_config,
    set_contract_workflow_config,
)
from app.platform.contracts_core.workflow import all_departments_approved, ensure_status
from app.core.security import hash_password
from app.models.hr import Department
from app.models.tenant import Tenant
from app.models.role import Role
from app.models.user import User
from app.models.hr import EmployeeProfile


def _approval(department: ContractDepartment, status: ApprovalStatus) -> ContractApproval:
    return ContractApproval(
        tenant_id=1,
        contract_id=1,
        department=department,
        status=status,
    )


def test_workflow_all_departments_approved() -> None:
    approvals = [
        _approval(ContractDepartment.ADMIN, ApprovalStatus.APPROVED),
        _approval(ContractDepartment.COMPRAS, ApprovalStatus.APPROVED),
        _approval(ContractDepartment.JURIDICO, ApprovalStatus.APPROVED),
    ]
    assert all_departments_approved(approvals) is True


def test_workflow_rejects_invalid_transition() -> None:
    try:
        ensure_status(ContractStatus.DRAFT, [ContractStatus.PENDING_GERENCIA])
    except ValueError:
        return
    raise AssertionError("Expected ValueError for invalid transition")


def test_permissions_can_create_contract_for_user_with_employee(monkeypatch) -> None:
    """Un usuario con employee activo puede crear contratos (sin role permission)."""
    user = SimpleNamespace(is_super_admin=False, role_id=None, tenant_id=1, id=42)
    monkeypatch.setattr(
        "app.platform.contracts_core.permissions._user_has_permission",
        lambda _session, _user, _code: False,
    )
    monkeypatch.setattr(
        "app.platform.contracts_core.permissions._has_employee",
        lambda _session, _user: True,
    )
    assert can_create_contract(session=None, user=user) is True


def test_permissions_department_for_user_returns_sorted_first(monkeypatch) -> None:
    user = SimpleNamespace(is_super_admin=False)
    monkeypatch.setattr(
        "app.platform.contracts_core.permissions.get_user_departments",
        lambda _session, _user: {ContractDepartment.JURIDICO, ContractDepartment.ADMIN},
    )
    assert department_for_user(session=None, user=user) == ContractDepartment.ADMIN




def test_workflow_config_default_steps_are_created(db_session_fixture) -> None:
    suffix = uuid4().hex[:8]
    tenant = Tenant(name=f"WF Tenant A {suffix}", subdomain=f"wf-tenant-a-{suffix}")
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)

    steps = get_contract_workflow_config(session=db_session_fixture, tenant_id=tenant.id)
    assert [item.department_name for item in steps] == [
        "GERENCIA",
        "ADMIN",
        "COMPRAS",
        "JURIDICO",
    ]
    assert [item.step_order for item in steps] == [1, 2, 3, 4]


def test_workflow_config_can_be_overridden(db_session_fixture) -> None:
    suffix = uuid4().hex[:8]
    tenant = Tenant(name=f"WF Tenant B {suffix}", subdomain=f"wf-tenant-b-{suffix}")
    db_session_fixture.add(tenant)
    db_session_fixture.commit()
    db_session_fixture.refresh(tenant)
    dept_a = Department(tenant_id=tenant.id, name=f"Compras {suffix}", is_active=True)
    dept_b = Department(tenant_id=tenant.id, name=f"Legal {suffix}", is_active=True)
    db_session_fixture.add(dept_a)
    db_session_fixture.add(dept_b)
    db_session_fixture.commit()
    db_session_fixture.refresh(dept_a)
    db_session_fixture.refresh(dept_b)

    updated = set_contract_workflow_config(
        session=db_session_fixture,
        tenant_id=tenant.id,
        steps=[
            {"department_id": dept_a.id, "step_order": 1},
            {"department_id": dept_b.id, "step_order": 2},
        ],
    )
    assert [item.department_id for item in updated] == [
        dept_a.id,
        dept_b.id,
    ]

    with pytest.raises(HTTPException) as exc_info:
        set_contract_workflow_config(
            session=db_session_fixture,
            tenant_id=tenant.id,
            steps=[
                {"department_id": dept_a.id, "step_order": 1},
                {"department_id": dept_a.id, "step_order": 2},
            ],
        )
    assert exc_info.value.status_code == 400

