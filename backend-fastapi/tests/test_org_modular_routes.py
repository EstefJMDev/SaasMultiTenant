from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool


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


def _ensure_org_tool(db: Session, tenant_id: int, enabled: bool = True) -> None:
    tool = db.exec(select(Tool).where(Tool.slug == "org")).one_or_none()
    if not tool:
        tool = Tool(
            name="Org",
            slug="org",
            base_url="https://example.local/org",
            description="Org",
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


def test_org_departments_list_and_create_happy(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_org_tool(db_session_fixture, tenant_id, enabled=True)
    headers = _auth_headers(client, tenant_id)

    list_resp = client.get("/api/v1/org/departments", headers=headers)
    assert list_resp.status_code == status.HTTP_200_OK

    create_resp = client.post(
        f"/api/v1/org/departments?tenant_id={tenant_id}",
        headers=headers,
        json={"name": f"Dept {uuid4().hex[:6]}"},
    )
    assert create_resp.status_code == status.HTTP_201_CREATED


def test_org_departments_forbidden_when_tool_disabled(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_org_tool(db_session_fixture, tenant_id, enabled=True)
    headers = _auth_headers(client, tenant_id)
    _ensure_org_tool(db_session_fixture, tenant_id, enabled=False)

    forbidden_resp = client.get("/api/v1/org/departments", headers=headers)
    assert forbidden_resp.status_code == status.HTTP_403_FORBIDDEN


def test_org_legacy_alias_has_deprecation_headers(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_org_tool(db_session_fixture, tenant_id, enabled=True)
    headers = _auth_headers(client, tenant_id)

    canonical_resp = client.get("/api/v1/org/departments", headers=headers)
    legacy_resp = client.get("/api/v1/hr/departments", headers=headers)

    assert canonical_resp.status_code == status.HTTP_200_OK
    assert legacy_resp.status_code == status.HTTP_200_OK
    assert legacy_resp.json() == canonical_resp.json()
    assert legacy_resp.headers.get("Deprecation") == "true"
    assert legacy_resp.headers.get("Sunset")
