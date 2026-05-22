from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.models.user import User
from app.platform.contracts_core.models import (
    Contract,
    ContractDocument,
    ContractDocumentType,
    ContractOffer,
    ContractStatus,
    ContractType,
)


def _login_superadmin(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "dios@cortecelestial.god", "password": "temporal"},
    )
    assert response.status_code == status.HTTP_200_OK
    return response.json()["access_token"]


def _create_tenant(db: Session, label: str) -> Tenant:
    tenant = Tenant(
        name=f"Tenant {label}",
        subdomain=f"tenant-{label}-{uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return tenant


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
    else:
        tenant_tool.is_enabled = True
        db.add(tenant_tool)
    db.commit()


def _create_user(db: Session, tenant_id: int, label: str) -> User:
    user = User(
        email=f"user.{label}+{uuid4().hex[:8]}@example.com",
        full_name=f"User {label}",
        hashed_password=hash_password("pass"),
        is_active=True,
        is_super_admin=False,
        tenant_id=tenant_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_contract(db: Session, tenant_id: int, created_by_id: int) -> Contract:
    contract = Contract(
        tenant_id=tenant_id,
        created_by_id=created_by_id,
        type=ContractType.SERVICIO,
        status=ContractStatus.DRAFT,
        title="Contrato Read Test",
        comparative_data={"offers": []},
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return contract


def test_get_comparative_offers_no_reconcile(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, "cmp")
    _ensure_procurement_enabled(db_session_fixture, tenant.id)
    created_by = _create_user(db_session_fixture, tenant.id, "cmp")
    contract = _create_contract(db_session_fixture, tenant.id, created_by.id)

    # Seed a ContractOffer in DB but keep comparative_data empty.
    offer = ContractOffer(
        tenant_id=tenant.id,
        contract_id=contract.id,
        created_by_id=created_by.id,
        supplier_name="Proveedor X",
    )
    db_session_fixture.add(offer)
    db_session_fixture.commit()

    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}

    resp = client.get(
        f"/api/v1/procurement/contracts/{contract.id}/comparative-offers",
        headers=headers,
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json() == []


def test_get_comparative_offers_does_not_create_rows_from_payload(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, "cmp-nowrite")
    _ensure_procurement_enabled(db_session_fixture, tenant.id)
    created_by = _create_user(db_session_fixture, tenant.id, "cmp-nowrite")
    contract = Contract(
        tenant_id=tenant.id,
        created_by_id=created_by.id,
        type=ContractType.SERVICIO,
        status=ContractStatus.DRAFT,
        title="Contrato Read No Write",
        comparative_data={
            "offers": [
                {
                    "supplier_name": "Proveedor Payload",
                    "supplier_tax_id": "B12345678",
                    "file": "oferta.pdf",
                }
            ]
        },
    )
    db_session_fixture.add(contract)
    db_session_fixture.commit()
    db_session_fixture.refresh(contract)

    initial_count = len(
        db_session_fixture.exec(
            select(ContractOffer).where(
                ContractOffer.tenant_id == tenant.id,
                ContractOffer.contract_id == contract.id,
            )
        ).all()
    )
    assert initial_count == 0

    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}

    resp = client.get(
        f"/api/v1/procurement/contracts/{contract.id}/comparative-offers",
        headers=headers,
    )
    assert resp.status_code == status.HTTP_200_OK
    offers = resp.json()
    assert isinstance(offers, list)
    assert len(offers) == 1

    refreshed_contract = db_session_fixture.exec(
        select(Contract).where(Contract.id == contract.id)
    ).one()
    final_count = len(
        db_session_fixture.exec(
            select(ContractOffer).where(
                ContractOffer.tenant_id == tenant.id,
                ContractOffer.contract_id == contract.id,
            )
        ).all()
    )
    assert final_count == 0
    assert refreshed_contract.comparative_data == contract.comparative_data


def test_post_sync_comparative_offers_creates_missing_rows(
    client: TestClient,
    db_session_fixture: Session,
) -> None:
    tenant = _create_tenant(db_session_fixture, "cmp-sync")
    _ensure_procurement_enabled(db_session_fixture, tenant.id)
    created_by = _create_user(db_session_fixture, tenant.id, "cmp-sync")
    contract = Contract(
        tenant_id=tenant.id,
        created_by_id=created_by.id,
        type=ContractType.SERVICIO,
        status=ContractStatus.DRAFT,
        title="Contrato Sync",
        comparative_data={
            "offers": [
                {
                    "supplier_name": "Proveedor Sync",
                    "supplier_tax_id": "B87654321",
                    "file": "sync.pdf",
                }
            ]
        },
    )
    db_session_fixture.add(contract)
    db_session_fixture.commit()
    db_session_fixture.refresh(contract)

    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}

    resp = client.post(
        f"/api/v1/procurement/contracts/{contract.id}/sync-comparative-offers",
        headers=headers,
    )
    assert resp.status_code == status.HTTP_200_OK
    offers = resp.json()
    assert len(offers) == 1
    assert isinstance(offers[0].get("id"), int)

    persisted = db_session_fixture.exec(
        select(ContractOffer).where(
            ContractOffer.tenant_id == tenant.id,
            ContractOffer.contract_id == contract.id,
        )
    ).all()
    assert len(persisted) == 1


def test_download_contract_document_path_exists(
    client: TestClient,
    db_session_fixture: Session,
    tmp_path: Path,
) -> None:
    tenant = _create_tenant(db_session_fixture, "doc")
    _ensure_procurement_enabled(db_session_fixture, tenant.id)
    created_by = _create_user(db_session_fixture, tenant.id, "doc")
    contract = _create_contract(db_session_fixture, tenant.id, created_by.id)

    pdf_path = tmp_path / "contract.pdf"
    pdf_path.write_bytes(b"%PDF-1.4\n%test\n")

    doc = ContractDocument(
        tenant_id=tenant.id,
        contract_id=contract.id,
        doc_type=ContractDocumentType.CONTRACT,
        path=str(pdf_path),
        created_by_id=created_by.id,
    )
    db_session_fixture.add(doc)
    db_session_fixture.commit()
    db_session_fixture.refresh(doc)

    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}

    resp = client.get(
        f"/api/v1/contracts/{contract.id}/documents/CONTRACT/download",
        headers=headers,
    )
    assert resp.status_code == status.HTTP_200_OK


def test_download_contract_document_candidate_no_db_update(
    client: TestClient,
    db_session_fixture: Session,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "contracts_storage_path", str(tmp_path))
    tenant = _create_tenant(db_session_fixture, "doc2")
    _ensure_procurement_enabled(db_session_fixture, tenant.id)
    created_by = _create_user(db_session_fixture, tenant.id, "doc2")
    contract = _create_contract(db_session_fixture, tenant.id, created_by.id)

    missing_path = "/does/not/exist.pdf"
    doc = ContractDocument(
        tenant_id=tenant.id,
        contract_id=contract.id,
        doc_type=ContractDocumentType.CONTRACT,
        path=missing_path,
        created_by_id=created_by.id,
    )
    db_session_fixture.add(doc)
    db_session_fixture.commit()
    db_session_fixture.refresh(doc)

    candidate_dir = (
        Path(settings.contracts_storage_path)
        / f"tenant_{tenant.id}"
        / f"contract_{contract.id}"
        / "documents"
        / "contract"
    )
    candidate_dir.mkdir(parents=True, exist_ok=True)
    candidate_file = candidate_dir / "contract_latest.pdf"
    candidate_file.write_bytes(b"%PDF-1.4\n%candidate\n")

    token = _login_superadmin(client)
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}

    resp = client.get(
        f"/api/v1/contracts/{contract.id}/documents/CONTRACT/download",
        headers=headers,
    )
    assert resp.status_code == status.HTTP_200_OK

    refreshed = db_session_fixture.exec(
        select(ContractDocument).where(ContractDocument.id == doc.id)
    ).one()
    assert refreshed.path == missing_path
