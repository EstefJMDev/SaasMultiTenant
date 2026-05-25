from __future__ import annotations

from io import BytesIO
from typing import Any

import pytest
from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.platform.contracts_core.models import Contract


def _build_pdf_bytes(text: str) -> bytes:
    from reportlab.pdfgen import canvas

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(595, 842))  # A4-ish
    pdf.setFont("Helvetica", 12)
    pdf.drawString(40, 800, text)
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "dios@cortecelestial.god",
            "password": "temporal",
        },
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert "access_token" in body
    return body["access_token"]


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


@pytest.fixture()
def tenant_id(db_session_fixture: Session) -> int:
    tenant = _resolve_tenant_id(db_session_fixture)
    _ensure_procurement_enabled(db_session_fixture, tenant)
    return tenant


@pytest.fixture()
def auth_headers(client: TestClient, tenant_id: int) -> dict[str, str]:
    token = _login_superadmin(client)
    return {
        "Authorization": f"Bearer {token}",
        "X-Tenant-Id": str(tenant_id),
    }


def _create_comparative(client: TestClient, headers: dict[str, str]) -> dict[str, Any]:
    payload = {
        "type": "SERVICIO",
        "title": "Comparativo Smoke",
        "description": "Smoke test comparativo",
        "comparative_data": {"header": {"obra_nombre": "Smoke Project"}, "lines": []},
    }
    resp = client.post("/api/v1/contracts", json=payload, headers=headers)
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert isinstance(body.get("id"), int)
    assert body.get("type") == "SERVICIO"
    return body


def _upload_offer(
    client: TestClient,
    headers: dict[str, str],
    contract_id: int,
    supplier_name: str,
    supplier_tax_id: str,
    total_amount: float,
) -> dict[str, Any]:
    pdf_bytes = _build_pdf_bytes(f"OFERTA {supplier_name} TOTAL {total_amount}")
    files = {
        "file": (f"OFERTA_{supplier_name}.pdf", pdf_bytes, "application/pdf"),
    }
    data = {
        "supplier_name": supplier_name,
        "supplier_tax_id": supplier_tax_id,
        "supplier_email": f"compras@{supplier_name.lower().replace(' ', '')}.es",
        "total_amount": str(total_amount),
        "currency": "EUR",
    }
    resp = client.post(
        f"/api/v1/contracts/{contract_id}/offers",
        headers=headers,
        files=files,
        data=data,
    )
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert isinstance(body.get("id"), int)
    assert body.get("contract_id") == contract_id
    return body


def _select_winner(
    client: TestClient, headers: dict[str, str], contract_id: int, offer_id: int
) -> dict[str, Any]:
    resp = client.post(
        f"/api/v1/contracts/{contract_id}/select-offer",
        json={"offer_id": offer_id},
        headers=headers,
    )
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body.get("selected_offer_id") == offer_id
    return body


def _ensure_contract_ready(
    db: Session, contract_id: int
) -> dict[str, Any]:
    contract = db.exec(select(Contract).where(Contract.id == contract_id)).one()
    contract.supplier_name = "Proveedor Smoke"
    contract.supplier_tax_id = "B12345678"
    contract.supplier_email = "proveedor@smoke.es"
    contract.supplier_contact_name = "Ana Responsable"
    contract.supplier_address = "Calle Falsa 123"
    contract.supplier_city = "Madrid"
    contract.supplier_postal_code = "28001"
    contract.supplier_country = "ES"
    contract.contract_data = {
        "resources": {"work_number": "2512"},
        "schedule": {
            "start_date": "2025-06-02",
            "end_date": "2025-08-31",
            "duration": "Tres meses",
        },
        "economic": {
            "price_type": "CERRADO",
            "total_execution_price": "1200.00",
            "payment_method": "CONFIRMING 60",
            "payment_method_agreed": "CONFIRMING 60",
        },
        "additional": {
            "milestones": "Hito 1",
            "units_description": "Detalle de unidades",
            "nombre_gerente": "Ana Responsable",
        },
        "manager": {
            "nombre_gerente": "Ana Responsable",
            "nif_gerente": "12345678Z",
        },
    }
    db.add(contract)
    db.commit()
    db.refresh(contract)
    assert contract.supplier_contact_name == "Ana Responsable"
    return {"id": contract.id, "supplier_tax_id": contract.supplier_tax_id}


def _generate_contract(
    client: TestClient, headers: dict[str, str], contract_id: int
) -> dict[str, Any]:
    resp = client.post(
        f"/api/v1/contracts/{contract_id}/generate-docs",
        headers=headers,
    )
    assert resp.status_code == status.HTTP_200_OK, resp.text
    body = resp.json()
    assert body.get("id") == contract_id
    return body


def _approve_comparative(
    client: TestClient, headers: dict[str, str], contract_id: int
) -> dict[str, Any]:
    submitted = client.post(
        f"/api/v1/contracts/{contract_id}/submit-comparative",
        headers=headers,
    )
    assert submitted.status_code == status.HTTP_200_OK

    approved = client.post(
        f"/api/v1/contracts/{contract_id}/approve-comparative",
        json={"comment": "smoke approval"},
        headers=headers,
    )
    assert approved.status_code == status.HTTP_200_OK
    body = approved.json()
    assert body.get("comparative_status") == "APPROVED"
    return body


def test_create_comparative_smoke(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    body = _create_comparative(client, auth_headers)
    assert body.get("status") in {"DRAFT", "PENDING_JEFE_OBRA"}
    assert body.get("comparative_status") in {"DRAFT", "PENDING_REVIEW"}


def test_upload_offers_smoke(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    contract = _create_comparative(client, auth_headers)
    _upload_offer(client, auth_headers, contract["id"], "Proveedor A", "B11111111", 1200.0)
    _upload_offer(client, auth_headers, contract["id"], "Proveedor B", "B22222222", 1100.0)

    resp = client.get(
        f"/api/v1/contracts/{contract['id']}/comparative-offers",
        headers=auth_headers,
    )
    assert resp.status_code == status.HTTP_200_OK
    offers = resp.json()
    assert isinstance(offers, list)
    assert len(offers) >= 2


def test_select_winner_smoke(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    contract = _create_comparative(client, auth_headers)
    offer1 = _upload_offer(client, auth_headers, contract["id"], "Proveedor A", "B11111111", 1200.0)
    _upload_offer(client, auth_headers, contract["id"], "Proveedor B", "B22222222", 1100.0)
    body = _select_winner(client, auth_headers, contract["id"], offer1["id"])
    assert body.get("selected_offer_id") == offer1["id"]


def test_generate_contract_smoke(
    client: TestClient, auth_headers: dict[str, str], db_session_fixture: Session
) -> None:
    contract = _create_comparative(client, auth_headers)
    offer1 = _upload_offer(client, auth_headers, contract["id"], "Proveedor A", "B11111111", 1200.0)
    _upload_offer(client, auth_headers, contract["id"], "Proveedor B", "B22222222", 1100.0)
    _select_winner(client, auth_headers, contract["id"], offer1["id"])
    _approve_comparative(client, auth_headers, contract["id"])
    _ensure_contract_ready(db_session_fixture, contract["id"])
    body = _generate_contract(client, auth_headers, contract["id"])
    assert body.get("status") == "PENDING_JEFE_OBRA"


def test_get_contract_smoke(
    client: TestClient, auth_headers: dict[str, str], db_session_fixture: Session
) -> None:
    contract = _create_comparative(client, auth_headers)
    offer1 = _upload_offer(client, auth_headers, contract["id"], "Proveedor A", "B11111111", 1200.0)
    _upload_offer(client, auth_headers, contract["id"], "Proveedor B", "B22222222", 1100.0)
    _select_winner(client, auth_headers, contract["id"], offer1["id"])
    _approve_comparative(client, auth_headers, contract["id"])
    _ensure_contract_ready(db_session_fixture, contract["id"])
    _generate_contract(client, auth_headers, contract["id"])

    resp = client.get(
        f"/api/v1/contracts/{contract['id']}",
        headers=auth_headers,
    )
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body.get("id") == contract["id"]
    assert body.get("status") == "PENDING_JEFE_OBRA"


def test_contract_e2e_persistence_send_view_download_smoke(
    client: TestClient,
    auth_headers: dict[str, str],
    db_session_fixture: Session,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.send_contract_notification.delay",
        lambda **_kwargs: None,
    )
    contract = _create_comparative(client, auth_headers)
    offer = _upload_offer(client, auth_headers, contract["id"], "Proveedor A", "B11111111", 1200.0)
    _upload_offer(client, auth_headers, contract["id"], "Proveedor B", "B22222222", 1100.0)
    _select_winner(client, auth_headers, contract["id"], offer["id"])
    _approve_comparative(client, auth_headers, contract["id"])
    _ensure_contract_ready(db_session_fixture, contract["id"])

    generated = _generate_contract(client, auth_headers, contract["id"])
    assert generated.get("status") == "PENDING_JEFE_OBRA"
    assert generated.get("selected_offer_id") == offer["id"]

    docs_resp = client.get(
        f"/api/v1/contracts/{contract['id']}/documents",
        headers=auth_headers,
    )
    assert docs_resp.status_code == status.HTTP_200_OK
    docs = docs_resp.json()
    assert any(doc.get("doc_type") == "CONTRACT" for doc in docs)
    assert any(doc.get("doc_type") == "COMPARATIVE" for doc in docs)

    view_resp = client.get(
        f"/api/v1/contracts/{contract['id']}/documents/CONTRACT",
        headers=auth_headers,
    )
    assert view_resp.status_code == status.HTTP_200_OK
    assert view_resp.json().get("doc_type") == "CONTRACT"

    download_resp = client.get(
        f"/api/v1/contracts/{contract['id']}/documents/CONTRACT/download",
        headers=auth_headers,
    )
    assert download_resp.status_code == status.HTTP_200_OK
    assert download_resp.headers.get("content-type", "").startswith("application/pdf")

    submit_resp = client.post(
        f"/api/v1/contracts/{contract['id']}/submit-gerencia",
        headers=auth_headers,
    )
    assert submit_resp.status_code == status.HTTP_200_OK
    submitted = submit_resp.json()
    assert submitted.get("status") == "PENDING_DEPARTAMENTOS"

