from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import hash_password
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User


def _login_superadmin_cookie(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": settings.superadmin_email, "password": settings.superadmin_password},
    )
    assert response.status_code == 200
    return response.json()


def _first_tenant_id(session: Session) -> int:
    tenant = session.exec(select(Tenant).order_by(Tenant.id.asc())).first()
    assert tenant is not None
    return int(tenant.id)


def _create_user_with_role(
    session: Session,
    *,
    tenant_id: int,
    role_name: str,
    password: str = "test-pass-123",
) -> User:
    role = session.exec(select(Role).where(Role.name == role_name)).one()
    user = User(
        email=f"{role_name}-{datetime.now(timezone.utc).timestamp()}@example.com",
        full_name=f"User {role_name}",
        hashed_password=hash_password(password),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant_id,
        role_id=role.id,
        mfa_enabled=False,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _login_user_bearer(client: TestClient, email: str, password: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == 200
    body = response.json()
    assert body.get("access_token")
    return body["access_token"]


def test_csrf_cookie_is_issued_on_login(client: TestClient) -> None:
    _login_superadmin_cookie(client)
    assert settings.csrf_cookie_name in client.cookies
    assert client.cookies.get(settings.csrf_cookie_name)


def test_csrf_blocks_state_change_without_header(client: TestClient, db_session_fixture: Session) -> None:
    _login_superadmin_cookie(client)
    tenant_id = _first_tenant_id(db_session_fixture)
    response = client.post(
        "/api/v1/contracts",
        headers={"X-Tenant-Id": str(tenant_id)},
        json={"type": "SERVICIO", "title": "Contrato sin CSRF"},
    )
    assert response.status_code == 403
    assert "CSRF" in response.json().get("detail", "")


def test_csrf_allows_state_change_with_header(client: TestClient, db_session_fixture: Session) -> None:
    _login_superadmin_cookie(client)
    tenant_id = _first_tenant_id(db_session_fixture)
    csrf_token = client.cookies.get(settings.csrf_cookie_name)
    assert csrf_token

    response = client.post(
        "/api/v1/contracts",
        headers={
            "X-Tenant-Id": str(tenant_id),
            settings.csrf_header_name: csrf_token,
        },
        json={"type": "SERVICIO", "title": "Contrato con CSRF"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "SERVICIO"
    assert body["tenant_id"] == tenant_id


def test_workflow_read_allowed_for_contracts_read_role(
    client: TestClient,
    db_session_fixture: Session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "mfa_enabled", False)
    tenant_id = _first_tenant_id(db_session_fixture)
    user = _create_user_with_role(db_session_fixture, tenant_id=tenant_id, role_name="user")
    token = _login_user_bearer(client, user.email, "test-pass-123")

    response = client.get(
        "/api/v1/contracts/workflow",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
    )
    assert response.status_code == 200
    assert isinstance(response.json().get("steps"), list)


def test_workflow_write_requires_contracts_approve_role(
    client: TestClient,
    db_session_fixture: Session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "mfa_enabled", False)
    tenant_id = _first_tenant_id(db_session_fixture)
    user = _create_user_with_role(db_session_fixture, tenant_id=tenant_id, role_name="user")
    token = _login_user_bearer(client, user.email, "test-pass-123")

    response = client.put(
        "/api/v1/contracts/workflow",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={"steps": [{"department_id": 1, "step_order": 1}]},
    )
    assert response.status_code == 403


def test_signatures_create_requires_contracts_approve_role(
    client: TestClient,
    db_session_fixture: Session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "mfa_enabled", False)
    tenant_id = _first_tenant_id(db_session_fixture)
    user = _create_user_with_role(db_session_fixture, tenant_id=tenant_id, role_name="user")
    token = _login_user_bearer(client, user.email, "test-pass-123")

    response = client.post(
        "/api/v1/signatures/signaturit/requests",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
        json={
            "contract_id": 999999,
            "signer_name": "Tester",
            "signer_email": "tester@example.com",
            "delivery_type": "url",
        },
    )
    assert response.status_code == 403


def test_signaturit_webhook_requires_token(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "signaturit_webhook_token", "whsec_local_test")
    response = client.post("/public/signaturit/events", json={"type": "ping", "document": {"id": "x"}})
    assert response.status_code == 401


def test_core_user_visible_endpoints_smoke(client: TestClient, db_session_fixture: Session) -> None:
    tenant_id = _first_tenant_id(db_session_fixture)
    login_data = _login_superadmin_cookie(client)
    token = login_data["access_token"]
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)}

    me = client.get("/api/v1/users/me", headers=headers)
    projects = client.get("/api/v1/erp/projects", headers=headers)
    summary = client.get("/api/v1/dashboard/summary", headers=headers)

    assert me.status_code == 200
    assert projects.status_code == 200
    assert summary.status_code == 200
