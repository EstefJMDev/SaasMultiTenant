from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from sqlmodel import Session, select

from app.platform.contracts_core.models import Contract, ContractDocument, ContractDocumentType, ContractStatus, ContractType
from app.core.config import settings
from app.models.tenant import Tenant
from app.models.tenant_tool import TenantTool
from app.models.tool import Tool
from app.models.user import User
from app.domains.signatures._core.models import SignatureProviderEvent, SignatureProviderRequest


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
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    with path.open("wb") as f:
        writer.write(f)


def _create_contract_with_document(session: Session, tmp_path: Path) -> tuple[Tenant, Contract]:
    tenant = Tenant(name="Tenant Signaturit", subdomain=f"signaturit-{datetime.now(timezone.utc).timestamp()}")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    superadmin = session.exec(select(User).where(User.email == "dios@cortecelestial.god")).one()
    contract = Contract(
        tenant_id=tenant.id,
        created_by_id=superadmin.id,
        type=ContractType.SERVICIO,
        status=ContractStatus.DRAFT,
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


def test_create_signaturit_request_and_sync_to_signed(
    client: TestClient,
    db_session_fixture: Session,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "signaturit_api_token", "test-token")
    monkeypatch.setattr(settings, "public_api_base_url", "http://localhost:8000")

    tenant, contract = _create_contract_with_document(db_session_fixture, tmp_path)
    _ensure_signatures_tool(db_session_fixture, tenant.id)
    headers = _auth_headers(client, tenant.id)

    monkeypatch.setattr(
        "app.domains.signatures._core.service.SignaturitClient.create_signature",
        lambda self, **kwargs: {
            "id": "sig_123",
            "status": "in_progress",
            "documents": [{"id": "doc_123", "url": "https://signaturit.local/sign/doc_123"}],
        },
    )

    create_res = client.post(
        "/api/v1/signatures/signaturit/requests",
        headers=headers,
        json={
            "contract_id": contract.id,
            "signer_name": "Juan Perez",
            "signer_email": "juan@example.com",
            "delivery_type": "url",
        },
    )
    assert create_res.status_code == 201
    body = create_res.json()
    assert body["provider_signature_id"] == "sig_123"
    assert body["signing_url"] == "https://signaturit.local/sign/doc_123"
    request_id = body["request"]["id"]

    db_session_fixture.expire_all()
    contract_row = db_session_fixture.get(Contract, contract.id)
    assert contract_row is not None
    assert contract_row.status == ContractStatus.IN_SIGNATURE

    monkeypatch.setattr(
        "app.domains.signatures._core.service.SignaturitClient.get_signature",
        lambda self, signature_id: {
            "id": signature_id,
            "status": "completed",
            "documents": [{"id": "doc_123", "status": "completed"}],
        },
    )
    monkeypatch.setattr(
        "app.domains.signatures._core.service.SignaturitClient.download_signed",
        lambda self, **kwargs: b"%PDF-1.4\n% signed\n",
    )
    monkeypatch.setattr(
        "app.domains.signatures._core.service.SignaturitClient.generate_audit_trail",
        lambda self, signature_id: {"ok": True},
    )
    monkeypatch.setattr(
        "app.domains.signatures._core.service.SignaturitClient.download_audit_trail",
        lambda self, **kwargs: b"%PDF-1.4\n% trail\n",
    )

    sync_res = client.post(f"/api/v1/signatures/signaturit/requests/{request_id}/sync", headers=headers)
    assert sync_res.status_code == 200
    sync_body = sync_res.json()
    assert sync_body["status"] == "completed"
    assert sync_body["signed_pdf_path"]

    db_session_fixture.expire_all()
    contract_after_sync = db_session_fixture.get(Contract, contract.id)
    assert contract_after_sync is not None
    assert contract_after_sync.status == ContractStatus.SIGNED

    signed_doc = db_session_fixture.exec(
        select(ContractDocument).where(
            ContractDocument.contract_id == contract.id,
            ContractDocument.tenant_id == tenant.id,
            ContractDocument.doc_type == ContractDocumentType.SIGNED,
        )
    ).one_or_none()
    assert signed_doc is not None
    assert Path(signed_doc.path).exists()


def test_signaturit_webhook_records_event(
    client: TestClient,
    db_session_fixture: Session,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "signaturit_api_token", "test-token")
    monkeypatch.setattr(settings, "signaturit_webhook_token", "whsec_test")
    tenant, contract = _create_contract_with_document(db_session_fixture, tmp_path)

    req = SignatureProviderRequest(
        tenant_id=tenant.id,
        contract_id=contract.id,
        created_by_id=None,
        provider="signaturit",
        status="in_progress",
        provider_signature_id="sig_456",
        provider_document_id="doc_456",
    )
    db_session_fixture.add(req)
    db_session_fixture.commit()
    db_session_fixture.refresh(req)

    def _fake_sync(session: Session, req: SignatureProviderRequest) -> SignatureProviderRequest:
        session.commit()
        return req

    monkeypatch.setattr("app.domains.signatures._core.service.sync_request_status", _fake_sync)

    webhook_payload = {
        "type": "sign_signed",
        "document": {"id": "sig_456", "status": "completed"},
    }
    res = client.post(
        "/public/signaturit/events",
        headers={"X-Webhook-Token": "whsec_test"},
        json=webhook_payload,
    )
    assert res.status_code == 200
    assert res.json()["ok"] is True

    db_session_fixture.expire_all()
    event = db_session_fixture.exec(
        select(SignatureProviderEvent).where(
            SignatureProviderEvent.signature_request_id == req.id,
            SignatureProviderEvent.event_type == "sign_signed",
        )
    ).one_or_none()
    assert event is not None

