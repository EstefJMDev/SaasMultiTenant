from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": password},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _login_superadmin(client: TestClient) -> str:
    return _login(client, "dios@cortecelestial.god", "temporal")


def _resolve_tenant_id(db: Session) -> int:
    tenant = db.exec(select(Tenant).where(Tenant.subdomain == "mavico")).one_or_none()
    if tenant:
        return tenant.id
    tenant = db.exec(select(Tenant).order_by(Tenant.id.asc())).first()
    assert tenant is not None
    return tenant.id


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
    elif not tenant_tool.is_enabled:
        tenant_tool.is_enabled = True
        db.add(tenant_tool)
    db.commit()


def _set_procurement_enabled(db: Session, tenant_id: int, enabled: bool) -> None:
    tool = db.exec(select(Tool).where(Tool.slug == "procurement")).one_or_none()
    assert tool is not None
    tenant_tool = db.exec(
        select(TenantTool).where(
            TenantTool.tenant_id == tenant_id,
            TenantTool.tool_id == tool.id,
        )
    ).one_or_none()
    assert tenant_tool is not None
    tenant_tool.is_enabled = enabled
    db.add(tenant_tool)
    db.commit()


def test_procurement_canonical_happy_and_forbidden(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_procurement_enabled(db_session_fixture, tenant_id)

    admin_token = _login_superadmin(client)
    admin_headers = {
        "Authorization": f"Bearer {admin_token}",
        "X-Tenant-Id": str(tenant_id),
    }

    contracts_resp = client.get("/api/v1/procurement/contracts", headers=admin_headers)
    workflow_resp = client.get("/api/v1/procurement/contracts/workflow", headers=admin_headers)
    assert contracts_resp.status_code == status.HTTP_200_OK
    assert workflow_resp.status_code == status.HTTP_200_OK

    _set_procurement_enabled(db_session_fixture, tenant_id, enabled=False)
    restricted_headers = admin_headers

    contracts_forbidden = client.get("/api/v1/procurement/contracts", headers=restricted_headers)
    workflow_forbidden = client.get("/api/v1/procurement/contracts/workflow", headers=restricted_headers)
    assert contracts_forbidden.status_code == status.HTTP_403_FORBIDDEN
    assert workflow_forbidden.status_code == status.HTTP_403_FORBIDDEN


def test_procurement_legacy_alias_adds_deprecation_headers_and_matches_payload(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_procurement_enabled(db_session_fixture, tenant_id)

    token = _login_superadmin(client)
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": str(tenant_id),
    }

    canonical_resp = client.get("/api/v1/procurement/contracts", headers=headers)
    legacy_resp = client.get("/api/v1/contracts", headers=headers)

    assert canonical_resp.status_code == status.HTTP_200_OK
    assert legacy_resp.status_code == status.HTTP_200_OK
    assert legacy_resp.json() == canonical_resp.json()
    assert legacy_resp.headers.get("Deprecation") == "true"
    assert legacy_resp.headers.get("Sunset")
