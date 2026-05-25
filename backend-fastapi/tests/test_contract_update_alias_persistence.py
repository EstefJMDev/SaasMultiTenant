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


def test_contract_update_persists_phone_dates_workers_aliases(
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

    created = client.post(
        "/api/v1/contracts",
        json={"type": "SUBCONTRATACION", "title": "CT alias persistence"},
        headers=headers,
    )
    assert created.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED), created.text
    contract_id = created.json()["id"]

    first_patch = client.patch(
        f"/api/v1/contracts/{contract_id}",
        json={
            "supplier_phone": "600111222",
            "contract_data": {
                "schedule": {
                    "start_date": "2026-05-01",
                    "end_date": "2026-06-01",
                },
                "resources": {
                    "workers_on_site": "8",
                },
            },
        },
        headers=headers,
    )
    assert first_patch.status_code == status.HTTP_200_OK, first_patch.text

    first_body = first_patch.json()
    first_data = first_body.get("contract_data") or {}
    first_schedule = first_data.get("schedule") or {}
    first_project = first_data.get("project") or {}
    first_resources = first_data.get("resources") or {}
    first_additional = first_data.get("additional") or {}

    assert first_body.get("supplier_phone") == "600111222"
    assert first_additional.get("telefono_contacto") == "600111222"
    assert first_schedule.get("start_date") == "2026-05-01"
    assert first_schedule.get("end_date") == "2026-06-01"
    assert first_project.get("fecha_inicio") == "2026-05-01"
    assert first_project.get("fecha_fin") == "2026-06-01"
    assert first_resources.get("workers_on_site") == "8"
    assert first_resources.get("workers_count") == "8"

    second_patch = client.patch(
        f"/api/v1/contracts/{contract_id}",
        json={
            "title": "CT alias persistence updated",
            "contract_data": {
                "additional": {"observations": "keep aliases"},
            },
        },
        headers=headers,
    )
    assert second_patch.status_code == status.HTTP_200_OK, second_patch.text

    second_body = second_patch.json()
    second_data = second_body.get("contract_data") or {}
    second_schedule = second_data.get("schedule") or {}
    second_project = second_data.get("project") or {}
    second_resources = second_data.get("resources") or {}

    assert second_body.get("supplier_phone") == "600111222"
    assert second_schedule.get("start_date") == "2026-05-01"
    assert second_schedule.get("end_date") == "2026-06-01"
    assert second_project.get("fecha_inicio") == "2026-05-01"
    assert second_project.get("fecha_fin") == "2026-06-01"
    assert second_resources.get("workers_on_site") == "8"
    assert second_resources.get("workers_count") == "8"
