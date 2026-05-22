from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlmodel import Session

from app.platform.contracts_core.models import (
    ComparativeStatus,
    Contract,
    ContractStatus,
    ContractType,
    Supplier,
    SupplierInvitation,
)
from app.domains.procurement.contracts.validators import build_supplier_onboarding_payload
from app.domains.procurement.documents.signatures import submit_supplier_onboarding
from app.models.tenant import Tenant
from app.models.user import User


def _create_tenant_user_supplier_contract(session: Session) -> tuple[SupplierInvitation, Contract]:
    tenant = Tenant(name="Tenant Onboarding", subdomain=f"onboarding-{datetime.now(timezone.utc).timestamp()}")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    user = User(
        email=f"onboarding-{datetime.now(timezone.utc).timestamp()}@example.com",
        full_name="Onboarding Admin",
        hashed_password="not_used_in_test",
        is_active=True,
        is_super_admin=True,
        tenant_id=None,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    supplier = Supplier(
        tenant_id=tenant.id,
        created_by_id=user.id,
        tax_id="B12345678",
        name="Proveedor Demo",
        contact_name="Ana Responsable",
    )
    session.add(supplier)
    session.commit()
    session.refresh(supplier)

    contract = Contract(
        tenant_id=tenant.id,
        created_by_id=user.id,
        type=ContractType.SERVICIO,
        status=ContractStatus.PENDING_JEFE_OBRA,
        supplier_id=supplier.id,
        supplier_name=supplier.name,
        supplier_tax_id=supplier.tax_id,
        supplier_contact_name=supplier.contact_name,
        supplier_address="Calle Demo 1, Madrid, 28001, ES",
        contract_data={
            "manager": {
                "nombre_gerente": "Ana Responsable",
            }
        },
    )
    session.add(contract)
    session.commit()
    session.refresh(contract)

    invitation = SupplierInvitation(
        tenant_id=tenant.id,
        supplier_id=supplier.id,
        contract_id=contract.id,
        email="proveedor@example.com",
        token=f"test-token-onboarding-nif-{uuid4().hex}",
        created_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    session.add(invitation)
    session.commit()
    session.refresh(invitation)

    return invitation, contract


def test_submit_supplier_onboarding_persists_nif_gerente(
    db_session_fixture: Session,
) -> None:
    invitation, contract = _create_tenant_user_supplier_contract(db_session_fixture)

    before_payload = build_supplier_onboarding_payload(contract)
    assert "nif_gerente" in before_payload["missing_fields"]

    submit_supplier_onboarding(
        db_session_fixture,
        token=invitation.token,
        payload={"nif_gerente": "12345678Z"},
    )

    db_session_fixture.refresh(contract)
    db_session_fixture.refresh(invitation)

    manager = dict((contract.contract_data or {}).get("manager") or {})
    assert manager.get("nif_gerente") == "12345678Z"
    assert invitation.used_at is not None

    after_payload = build_supplier_onboarding_payload(contract)
    assert "nif_gerente" not in after_payload["missing_fields"]


def test_submit_supplier_onboarding_skips_pending_template_if_db_enum_not_supported(
    db_session_fixture: Session,
    monkeypatch,
) -> None:
    invitation, contract = _create_tenant_user_supplier_contract(db_session_fixture)
    contract.status = ContractStatus.DRAFT
    contract.comparative_status = ComparativeStatus.APPROVED
    db_session_fixture.add(contract)
    db_session_fixture.commit()
    db_session_fixture.refresh(contract)

    monkeypatch.setattr(
        "app.domains.procurement.documents.signatures._contract_status_supported",
        lambda *_args, **_kwargs: False,
    )

    submit_supplier_onboarding(
        db_session_fixture,
        token=invitation.token,
        payload={"nif_gerente": "12345678Z"},
    )

    db_session_fixture.refresh(contract)
    manager = dict((contract.contract_data or {}).get("manager") or {})
    assert manager.get("nif_gerente") == "12345678Z"
    assert contract.status == ContractStatus.DRAFT
