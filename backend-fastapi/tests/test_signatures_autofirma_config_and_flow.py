from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.platform.contracts_core.models import Contract, ContractDocument, ContractDocumentType, ContractStatus, ContractType
from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.models.user import User


def _auth_headers(client: TestClient, tenant_id: int) -> dict[str, str]:
    login = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)}


def _blank_pdf(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"
    )


def _create_contract_with_document(session: Session, tmp_path: Path) -> tuple[Tenant, Contract]:
    tenant = Tenant(name="Tenant Autofirma", subdomain=f"autofirma-{datetime.now(timezone.utc).timestamp()}")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    superadmin = session.exec(select(User).where(User.email == "dios@cortecelestial.god")).one()
    contract = Contract(
        tenant_id=tenant.id,
        created_by_id=superadmin.id,
        type=ContractType.SERVICIO,
        status=ContractStatus.IN_SIGNATURE,
        supplier_name="Proveedor",
        supplier_tax_id="B12345678",
        supplier_email="proveedor@example.com",
    )
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_pdf = tmp_path / "contracts" / f"ct_{contract.id}.pdf"
    _blank_pdf(contract_pdf)
    session.add(
        ContractDocument(
            tenant_id=tenant.id,
            contract_id=contract.id,
            doc_type=ContractDocumentType.CONTRACT,
            path=str(contract_pdf),
            created_by_id=superadmin.id,
        )
    )
    session.commit()
    return tenant, contract


def _ensure_procurement_tool(session: Session, tenant_id: int) -> None:
    tool = session.exec(select(Tool).where(Tool.slug == "procurement")).one_or_none()
    if not tool:
        tool = Tool(
            name="Procurement",
            slug="procurement",
            base_url="https://example.local/procurement",
            description="Procurement",
        )
        session.add(tool)
        session.commit()
        session.refresh(tool)

    tenant_tool = session.exec(
        select(TenantTool).where(
            TenantTool.tenant_id == tenant_id,
            TenantTool.tool_id == tool.id,
        )
    ).one_or_none()
    if not tenant_tool:
        session.add(TenantTool(tenant_id=tenant_id, tool_id=tool.id, is_enabled=True))
    elif not tenant_tool.is_enabled:
        tenant_tool.is_enabled = True
        session.add(tenant_tool)
    session.commit()


def _ensure_signatures_tool(session: Session, tenant_id: int) -> None:
    tool = session.exec(select(Tool).where(Tool.slug == "signatures")).one_or_none()
    if not tool:
        tool = Tool(
            name="Signatures",
            slug="signatures",
            base_url="https://example.local/signatures",
            description="Signatures",
        )
        session.add(tool)
        session.commit()
        session.refresh(tool)

    tenant_tool = session.exec(
        select(TenantTool).where(
            TenantTool.tenant_id == tenant_id,
            TenantTool.tool_id == tool.id,
        )
    ).one_or_none()
    if not tenant_tool:
        session.add(TenantTool(tenant_id=tenant_id, tool_id=tool.id, is_enabled=True))
    elif not tenant_tool.is_enabled:
        tenant_tool.is_enabled = True
        session.add(tenant_tool)
    session.commit()


def test_signature_config_and_autofirma_request(
    client: TestClient,
    db_session_fixture: Session,
    tmp_path: Path,
) -> None:
    tenant, contract = _create_contract_with_document(db_session_fixture, tmp_path)
    _ensure_procurement_tool(db_session_fixture, tenant.id)
    _ensure_signatures_tool(db_session_fixture, tenant.id)
    headers = _auth_headers(client, tenant.id)

    cfg = client.get("/api/v1/signatures/config", headers=headers)
    assert cfg.status_code == 200
    assert cfg.json()["allow_autofirma"] is False

    update_cfg = client.put(
        "/api/v1/signatures/config",
        headers=headers,
        json={"allow_autofirma": True, "autofirma_session_ttl_minutes": 12},
    )
    assert update_cfg.status_code == 200
    assert update_cfg.json()["allow_autofirma"] is True
    assert update_cfg.json()["autofirma_session_ttl_minutes"] == 12

    create = client.post(
        f"/api/v1/contracts/{contract.id}/signature-requests/autofirma",
        headers=headers,
        json={"signer_name": "Proveedor Test", "signer_email": "proveedor@example.com"},
    )
    assert create.status_code == 200
    req_id = create.json()["request"]["id"]
    assert create.json()["request"]["provider"] == "AUTOFIRMA"
    assert create.json()["request"]["status"] in {"PENDING", "CREATED"}

    download_url = client.get(f"/api/v1/signatures/{req_id}/download-url", headers=headers)
    assert download_url.status_code == 409

