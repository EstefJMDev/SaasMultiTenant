from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.domains.procurement.contracts.validators import validate_jefe_obra_intake
from app.platform.contracts_core.models import (
    ComparativeStatus,
    Contract,
    ContractStatus,
    ContractType,
)


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


def test_generate_docs_without_selected_offer_returns_4xx(
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

    r = client.post(
        "/api/v1/contracts",
        json={"type": "SERVICIO"},
        headers=headers,
    )
    assert r.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED), r.text
    contract_id = r.json()["id"]

    r = client.post(
        f"/api/v1/contracts/{contract_id}/generate-docs",
        headers=headers,
    )

    assert r.status_code in (status.HTTP_400_BAD_REQUEST, status.HTTP_409_CONFLICT), r.text
    data = r.json()
    assert "detail" in data
    detail = str(data["detail"]).lower()
    assert "oferta" in detail or "comparativo" in detail


def test_jefe_obra_intake_validation_accepts_fallbacks_from_dates_and_payment() -> None:
    contract = Contract(
        id=999,
        tenant_id=1,
        created_by_id=1,
        type=ContractType.SERVICIO,
        status=ContractStatus.DRAFT,
        comparative_status=ComparativeStatus.APPROVED.value,
        supplier_name="Proveedor Test",
        supplier_tax_id="B12345678",
        supplier_email="proveedor@test.local",
        supplier_phone="600123123",
        supplier_contact_name="Juan Encargado",
        total_amount=1500,
        contract_data={
            "economic": {
                "price_type": "CERRADO",
                "total_execution_price": "1500.00",
                "payment_method": "CONFIRMING 120",
                # Debe aceptar fallback cuando viene vacío.
                "payment_method_agreed": "",
            },
            "schedule": {
                "start_date": "2026-04-01",
                "end_date": "2026-05-01",
                # Debe aceptar fallback cuando viene vacío.
                "duration": "",
            },
            "resources": {
                "work_number": "OB-123",
            },
            "additional": {
                # Debe aceptar fallback cuando hitos viene vacío.
                "milestones": "",
                "units_description": "Trabajos de mantenimiento",
            },
        },
    )

    missing = validate_jefe_obra_intake(contract)
    assert missing == []
