from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "dios@cortecelestial.god",
            "password": "temporal",
        },
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


def _ensure_erp_enabled(db: Session, tenant_id: int) -> None:
    for slug, name, base_url in (
        ("erp", "ERP Interno", "https://example.local/erp"),
        ("procurement", "Procurement", "https://example.local/procurement"),
    ):
        tool = db.exec(select(Tool).where(Tool.slug == slug)).one_or_none()
        if not tool:
            tool = Tool(
                name=name,
                slug=slug,
                base_url=base_url,
                description=name,
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


def test_time_and_procurement_routes_are_available(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    token = _login_superadmin(client)
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_erp_enabled(db_session_fixture, tenant_id)

    headers = {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": str(tenant_id),
    }

    active_resp = client.get("/api/v1/time/tracking/active", headers=headers)
    assert active_resp.status_code == status.HTTP_200_OK

    sessions_resp = client.get("/api/v1/time/sessions", headers=headers)
    assert sessions_resp.status_code == status.HTTP_200_OK

    procurement_resp = client.get("/api/v1/procurement/contracts", headers=headers)
    assert procurement_resp.status_code == status.HTTP_200_OK

    legacy_resp = client.get("/api/v1/contracts", headers=headers)
    assert legacy_resp.status_code == status.HTTP_200_OK
