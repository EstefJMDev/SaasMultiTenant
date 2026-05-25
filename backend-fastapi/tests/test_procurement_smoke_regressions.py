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


def _auth_headers(client: TestClient, tenant_id: int) -> dict[str, str]:
    token = _login_superadmin(client)
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": str(tenant_id),
    }


def _create_contract(client: TestClient, headers: dict[str, str]) -> int:
    r = client.post(
        "/api/v1/contracts",
        json={"type": "SERVICIO"},
        headers=headers,
    )
    assert r.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED), r.text
    return r.json()["id"]


def test_get_comparative_offers_returns_200(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_procurement_enabled(db_session_fixture, tenant_id)
    headers = _auth_headers(client, tenant_id)

    contract_id = _create_contract(client, headers)

    r = client.get(
        f"/api/v1/contracts/{contract_id}/comparative-offers",
        headers=headers,
    )
    assert r.status_code == status.HTTP_200_OK, r.text
    assert isinstance(r.json(), list)


def test_offers_requires_multipart_file(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_procurement_enabled(db_session_fixture, tenant_id)
    headers = _auth_headers(client, tenant_id)

    contract_id = _create_contract(client, headers)

    r = client.post(
        f"/api/v1/contracts/{contract_id}/offers",
        json={"price": 1000},
        headers=headers,
    )
    assert r.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, r.text


def test_approve_without_valid_state_returns_4xx(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant_id = _resolve_tenant_id(db_session_fixture)
    _ensure_procurement_enabled(db_session_fixture, tenant_id)
    headers = _auth_headers(client, tenant_id)

    contract_id = _create_contract(client, headers)

    r = client.post(
        f"/api/v1/contracts/{contract_id}/approve",
        json={"comment": "smoke"},
        headers=headers,
    )
    assert r.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT), r.text
