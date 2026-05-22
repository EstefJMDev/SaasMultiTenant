from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.security import hash_password
from app.models.mfa_email_code import MFAEmailCode
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.models.user import User


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _create_tenant(client: TestClient, token: str, name: str, subdomain: str) -> int:
    payload = {"name": name, "subdomain": subdomain, "is_active": True}
    resp = client.post(
        "/api/v1/tenants/",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == status.HTTP_201_CREATED
    return resp.json()["id"]


def _ensure_tickets_tool(db_session: Session, tenant_id: int, enabled: bool = True) -> None:
    tool = db_session.exec(select(Tool).where(Tool.slug == "tickets")).one_or_none()
    if not tool:
        tool = Tool(
            name="Tickets",
            slug="tickets",
            base_url="https://example.local/tickets",
            description="Tickets",
        )
        db_session.add(tool)
        db_session.commit()
        db_session.refresh(tool)

    tenant_tool = db_session.exec(
        select(TenantTool).where(
            TenantTool.tenant_id == tenant_id,
            TenantTool.tool_id == tool.id,
        ),
    ).one_or_none()
    if not tenant_tool:
        db_session.add(
            TenantTool(tenant_id=tenant_id, tool_id=tool.id, is_enabled=enabled),
        )
    else:
        tenant_tool.is_enabled = enabled
        db_session.add(tenant_tool)
    db_session.commit()


def _create_tenant_admin(
    client: TestClient,
    token: str,
    tenant_id: int,
    email: str,
) -> None:
    payload = {
        "email": email,
        "full_name": "Admin Tickets",
        "password": "tickets-pass",
        "tenant_id": tenant_id,
        "is_super_admin": False,
        "role_name": "tenant_admin",
    }
    resp = client.post(
        "/api/v1/users/",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == status.HTTP_201_CREATED


def _login_with_mfa(
    client: TestClient,
    email: str,
    password: str,
    db_session: Session,
) -> str:
    response = client.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["mfa_required"] is True

    user = db_session.exec(select(User).where(User.email == email)).one()
    mfa_record = db_session.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one()
    code = "654321"
    mfa_record.code_hash = hash_password(code)
    mfa_record.failed_attempts = 0
    db_session.add(mfa_record)
    db_session.commit()

    resp_mfa = client.post(
        "/api/v1/auth/mfa/verify",
        json={"username": email, "mfa_code": code},
    )
    assert resp_mfa.status_code == status.HTTP_200_OK
    return resp_mfa.json()["access_token"]


def test_tickets_list_happy(client: TestClient) -> None:
    token = _login_superadmin(client)
    resp = client.get("/api/v1/tickets", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == status.HTTP_200_OK


def test_tickets_create_happy(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        token,
        name="Tickets Happy",
        subdomain=f"tickets-happy-{uuid4().hex[:6]}",
    )
    _ensure_tickets_tool(db_session_fixture, tenant_id, enabled=True)

    email = f"tickets-admin-{uuid4().hex[:6]}@example.com"
    _create_tenant_admin(client, token, tenant_id, email=email)
    admin_token = _login_with_mfa(client, email, "tickets-pass", db_session_fixture)

    payload = {
        "subject": "Fallo en el sistema",
        "description": "No puedo acceder.",
        "priority": "medium",
    }
    resp = client.post(
        "/api/v1/tickets",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload,
    )
    assert resp.status_code == status.HTTP_201_CREATED


def test_tickets_forbidden_when_tool_disabled(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        token,
        name="Tickets Disabled",
        subdomain=f"tickets-disabled-{uuid4().hex[:6]}",
    )
    _ensure_tickets_tool(db_session_fixture, tenant_id, enabled=False)

    email = f"tickets-user-{uuid4().hex[:6]}@example.com"
    _create_tenant_admin(client, token, tenant_id, email=email)
    admin_token = _login_with_mfa(client, email, "tickets-pass", db_session_fixture)

    resp = client.get(
        "/api/v1/tickets",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_tickets_superadmin_forbidden_when_tool_disabled(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        token,
        name="Tickets Disabled Super",
        subdomain=f"tickets-disabled-super-{uuid4().hex[:6]}",
    )
    _ensure_tickets_tool(db_session_fixture, tenant_id, enabled=False)

    resp = client.get(
        "/api/v1/tickets",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
    )
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_tickets_superadmin_ok_when_tool_enabled(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        token,
        name="Tickets Enabled Super",
        subdomain=f"tickets-enabled-super-{uuid4().hex[:6]}",
    )
    _ensure_tickets_tool(db_session_fixture, tenant_id, enabled=True)

    resp = client.get(
        "/api/v1/tickets",
        headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)},
    )
    assert resp.status_code == status.HTTP_200_OK


def test_tickets_tenant_admin_ok_when_tool_enabled(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)
    tenant_id = _create_tenant(
        client,
        token,
        name="Tickets Enabled Admin",
        subdomain=f"tickets-enabled-admin-{uuid4().hex[:6]}",
    )
    _ensure_tickets_tool(db_session_fixture, tenant_id, enabled=True)

    email = f"tickets-admin-ok-{uuid4().hex[:6]}@example.com"
    _create_tenant_admin(client, token, tenant_id, email=email)
    admin_token = _login_with_mfa(client, email, "tickets-pass", db_session_fixture)

    resp = client.get(
        "/api/v1/tickets",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == status.HTTP_200_OK


def test_tickets_legacy_alias_has_deprecation_headers(client: TestClient) -> None:
    token = _login_superadmin(client)
    canonical = client.get(
        "/api/v1/tickets",
        headers={"Authorization": f"Bearer {token}"},
    )
    legacy = client.get(
        "/api/v1/tickets-legacy",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert canonical.status_code == status.HTTP_200_OK
    assert legacy.status_code == status.HTTP_200_OK
    assert legacy.headers.get("Deprecation") == "true"
    assert legacy.headers.get("Sunset")
