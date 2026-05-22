from __future__ import annotations

from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.mfa_email_code import MFAEmailCode
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.models.user import User
from app.platform.contracts_core.models import Contract, ContractStatus, ContractType


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _create_tenant(db: Session, label: str) -> Tenant:
    tenant = Tenant(
        name=f"Tenant {label}",
        subdomain=f"tenant-{label}-{uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


def _ensure_procurement_enabled(db: Session, tenant_id: int) -> None:
    tool = db.exec(select(Tool).where(Tool.slug == "procurement")).one_or_none()
    if not tool:
        tool = Tool(
            name="Procurement",
            slug="procurement",
            base_url="https://example.local/procurement",
            description="Procurement",
        )
        db.add(tool)
        db.commit()
        db.refresh(tool)

    tenant_tool = db.exec(
        select(TenantTool).where(
            TenantTool.tenant_id == tenant_id,
            TenantTool.tool_id == tool.id,
        )
    ).one_or_none()
    if not tenant_tool:
        db.add(TenantTool(tenant_id=tenant_id, tool_id=tool.id, is_enabled=True))
    else:
        tenant_tool.is_enabled = True
        db.add(tenant_tool)
    db.commit()


def _create_tenant_admin(db: Session, tenant_id: int, label: str) -> tuple[str, str]:
    email = f"admin.{label}+{uuid4().hex[:8]}@example.com"
    user = User(
        email=email,
        full_name=f"Admin {label}",
        hashed_password=hash_password("test-pass"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant_id,
        mfa_enabled=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    tenant_admin_role = db.exec(select(Role).where(Role.name == "tenant_admin")).one()
    user.role_id = tenant_admin_role.id
    db.add(user)
    db.commit()
    db.refresh(user)

    return email, "test-pass"


def _login_with_mfa(client: TestClient, db: Session, email: str, password: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["mfa_required"] is True

    user = db.exec(select(User).where(User.email == email)).one()
    mfa_record = db.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one()

    code = "654321"
    mfa_record.code_hash = hash_password(code)
    mfa_record.failed_attempts = 0
    db.add(mfa_record)
    db.commit()

    resp_mfa = client.post(
        "/api/v1/auth/mfa/verify",
        json={"username": email, "mfa_code": code},
    )
    assert resp_mfa.status_code == status.HTTP_200_OK
    token_body = resp_mfa.json()
    assert token_body["mfa_required"] is False
    return token_body["access_token"]


def _create_contract(db: Session, tenant_id: int, created_by_id: int) -> Contract:
    contract = Contract(
        tenant_id=tenant_id,
        created_by_id=created_by_id,
        type=ContractType.SERVICIO,
        status=ContractStatus.DRAFT,
        title="Contrato Tenant B",
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


def test_cross_tenant_header_manipulation(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_a = _create_tenant(db_session_fixture, "A")
    tenant_b = _create_tenant(db_session_fixture, "B")
    _ensure_procurement_enabled(db_session_fixture, tenant_a.id)
    _ensure_procurement_enabled(db_session_fixture, tenant_b.id)

    email_a, password_a = _create_tenant_admin(db_session_fixture, tenant_a.id, "A")
    token_a = _login_with_mfa(client, db_session_fixture, email_a, password_a)

    headers = {"Authorization": f"Bearer {token_a}", "X-Tenant-Id": str(tenant_b.id)}
    resp = client.get("/api/v1/contracts", headers=headers)
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_cross_tenant_resource_access(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_a = _create_tenant(db_session_fixture, "A2")
    tenant_b = _create_tenant(db_session_fixture, "B2")
    _ensure_procurement_enabled(db_session_fixture, tenant_a.id)
    _ensure_procurement_enabled(db_session_fixture, tenant_b.id)

    email_a, password_a = _create_tenant_admin(db_session_fixture, tenant_a.id, "A2")
    token_a = _login_with_mfa(client, db_session_fixture, email_a, password_a)

    email_b, _ = _create_tenant_admin(db_session_fixture, tenant_b.id, "B2")
    user_b = db_session_fixture.exec(select(User).where(User.email == email_b)).one()
    contract_b = _create_contract(db_session_fixture, tenant_b.id, user_b.id)

    headers = {"Authorization": f"Bearer {token_a}"}
    resp = client.get(f"/api/v1/contracts/{contract_b.id}", headers=headers)
    assert resp.status_code in {status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND}


def test_superadmin_can_access_tenant_resource(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_b = _create_tenant(db_session_fixture, "B3")
    _ensure_procurement_enabled(db_session_fixture, tenant_b.id)

    email_b, _ = _create_tenant_admin(db_session_fixture, tenant_b.id, "B3")
    user_b = db_session_fixture.exec(select(User).where(User.email == email_b)).one()
    contract_b = _create_contract(db_session_fixture, tenant_b.id, user_b.id)

    token_sa = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token_sa}", "X-Tenant-Id": str(tenant_b.id)}
    resp = client.get(f"/api/v1/contracts/{contract_b.id}", headers=headers)
    assert resp.status_code == status.HTTP_200_OK
