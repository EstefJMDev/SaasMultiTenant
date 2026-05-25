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


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _resolve_tenant_id(db: Session) -> int:
    tenant = db.exec(select(Tenant).where(Tenant.subdomain == "mavico")).one_or_none()
    if tenant:
        return tenant.id
    tenant = db.exec(select(Tenant).order_by(Tenant.id.asc())).first()
    assert tenant is not None
    return tenant.id


def _ensure_projects_tool(db: Session, tenant_id: int, enabled: bool = True) -> None:
    tool = db.exec(select(Tool).where(Tool.slug == "projects")).one_or_none()
    if not tool:
        tool = Tool(
            name="Projects",
            slug="projects",
            base_url="https://example.local/projects",
            description="Projects",
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
        db.add(TenantTool(tenant_id=tenant_id, tool_id=tool.id, is_enabled=enabled))
    else:
        tenant_tool.is_enabled = enabled
        db.add(tenant_tool)
    db.commit()


def _auth_headers(client: TestClient, tenant_id: int) -> dict[str, str]:
    token = _login_superadmin(client)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)}


def _create_tenant_and_admin(db: Session) -> tuple[int, str, str]:
    tenant = Tenant(
        name="Tenant Projects",
        subdomain=f"tenant-projects-{uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    admin_email = f"admin.projects+{uuid4().hex[:8]}@example.com"
    admin = User(
        email=admin_email,
        full_name="Admin Projects",
        hashed_password=hash_password("projects-pass"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant.id,
        mfa_enabled=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    tenant_admin_role = db.exec(select(Role).where(Role.name == "tenant_admin")).one()
    admin.role_id = tenant_admin_role.id
    db.add(admin)
    db.commit()
    db.refresh(admin)

    return tenant.id, admin_email, "projects-pass"


def _login_with_mfa(
    client: TestClient,
    email: str,
    password: str,
    db: Session,
) -> str:
    data = {
        "username": email,
        "password": password,
    }
    response = client.post("/api/v1/auth/login", data=data)
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["mfa_required"] is True
    assert body.get("access_token") is None

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


def test_projects_list_happy(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_projects_tool(db_session_fixture, tenant_id, enabled=True)
    headers = _auth_headers(client, tenant_id)

    list_resp = client.get("/api/v1/projects", headers=headers)
    assert list_resp.status_code == status.HTTP_200_OK


def test_projects_list_supports_limit_and_offset(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id, admin_email, admin_password = _create_tenant_and_admin(
        db_session_fixture,
    )
    _ensure_projects_tool(db_session_fixture, tenant_id, enabled=True)
    admin_token = _login_with_mfa(
        client,
        admin_email,
        admin_password,
        db_session_fixture,
    )
    headers = {"Authorization": f"Bearer {admin_token}"}

    created_names: list[str] = []
    for _ in range(3):
        name = f"Proyecto paginado {uuid4().hex[:8]}"
        created_names.append(name)
        create_resp = client.post(
            "/api/v1/projects",
            headers=headers,
            json={"name": name},
        )
        assert create_resp.status_code == status.HTTP_201_CREATED

    list_resp = client.get("/api/v1/projects?limit=2&offset=1", headers=headers)
    assert list_resp.status_code == status.HTTP_200_OK

    body = list_resp.json()
    assert len(body) == 2
    returned_names = [item["name"] for item in body]
    assert returned_names == [created_names[1], created_names[0]]


def test_projects_create_happy(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_projects_tool(db_session_fixture, tenant_id, enabled=True)
    headers = _auth_headers(client, tenant_id)

    create_resp = client.post(
        "/api/v1/projects",
        headers=headers,
        json={"name": f"Proyecto {uuid4().hex[:8]}"},
    )
    assert create_resp.status_code == status.HTTP_201_CREATED


def test_projects_list_forbidden_when_tool_disabled(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_projects_tool(db_session_fixture, tenant_id, enabled=True)
    headers = _auth_headers(client, tenant_id)
    _ensure_projects_tool(db_session_fixture, tenant_id, enabled=False)

    forbidden_resp = client.get("/api/v1/projects", headers=headers)
    assert forbidden_resp.status_code == status.HTTP_403_FORBIDDEN


def test_erp_projects_forbidden_when_tool_disabled(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_projects_tool(db_session_fixture, tenant_id, enabled=True)
    headers = _auth_headers(client, tenant_id)
    _ensure_projects_tool(db_session_fixture, tenant_id, enabled=False)

    forbidden_resp = client.get("/api/v1/erp/projects", headers=headers)
    assert forbidden_resp.status_code == status.HTTP_403_FORBIDDEN


def test_projects_legacy_alias_has_deprecation_headers(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_projects_tool(db_session_fixture, tenant_id, enabled=True)
    headers = _auth_headers(client, tenant_id)

    canonical_resp = client.get("/api/v1/projects", headers=headers)
    legacy_resp = client.get("/api/v1/erp/projects", headers=headers)

    assert canonical_resp.status_code == status.HTTP_200_OK
    assert legacy_resp.status_code == status.HTTP_200_OK
    assert legacy_resp.json() == canonical_resp.json()
    assert legacy_resp.headers.get("Deprecation") == "true"
    assert legacy_resp.headers.get("Sunset")


def test_project_budget_patch_missing_line_returns_not_found(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_projects_tool(db_session_fixture, tenant_id, enabled=True)
    headers = _auth_headers(client, tenant_id)

    create_resp = client.post(
        "/api/v1/projects",
        headers=headers,
        json={"name": f"Proyecto budget {uuid4().hex[:8]}"},
    )
    assert create_resp.status_code == status.HTTP_201_CREATED
    project_id = create_resp.json()["id"]

    patch_resp = client.patch(
        f"/api/v1/projects/{project_id}/budgets/999999",
        headers=headers,
        json={
            "concept": "Linea inexistente",
            "hito1_budget": "10",
            "justified_hito1": "0",
            "hito2_budget": "5",
            "justified_hito2": "0",
            "approved_budget": "15",
            "percent_spent": "0",
            "forecasted_spent": "0",
        },
    )

    assert patch_resp.status_code == status.HTTP_404_NOT_FOUND


def test_erp_projects_allows_tenant_admin_when_tool_enabled(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id, admin_email, admin_password = _create_tenant_and_admin(
        db_session_fixture,
    )
    _ensure_projects_tool(db_session_fixture, tenant_id, enabled=True)
    admin_token = _login_with_mfa(
        client,
        admin_email,
        admin_password,
        db_session_fixture,
    )
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    resp = client.get("/api/v1/erp/projects", headers=headers_admin)
    assert resp.status_code == status.HTTP_200_OK
