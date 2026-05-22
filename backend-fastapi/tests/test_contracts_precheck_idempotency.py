from datetime import datetime, timezone
from decimal import Decimal

from sqlmodel import Session, select

from app.platform.contracts_core.models import (
    ApprovalStatus,
    Contract,
    ContractDocument,
    ContractDocumentType,
    ContractOffer,
    ContractStatus,
    ContractType,
    ContractWorkflowApproval,
    ContractWorkflowStep,
    Supplier,
    SupplierInvitation,
)
from app.domains.procurement.api import (
    approve_all_phases_superadmin,
    build_required_fields,
    format_jefe_obra_intake_missing_fields,
    generate_contract_document,
    start_supplier_invitation,
    submit_gerencia,
    validate_jefe_obra_intake,
    validate_required,
)
from app.core.config import settings
from app.models.tenant import Tenant
from app.models.user import User


def _create_tenant_and_user(session: Session) -> tuple[Tenant, User]:
    tenant = Tenant(name="Tenant Contracts", subdomain=f"contracts-{datetime.now(timezone.utc).timestamp()}")
    session.add(tenant)
    session.commit()
    session.refresh(tenant)

    user = User(
        email=f"contracts-{datetime.now(timezone.utc).timestamp()}@example.com",
        full_name="Contracts Admin",
        hashed_password="not_used_in_test",
        is_active=True,
        is_super_admin=True,
        tenant_id=None,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return tenant, user


def test_validate_required_detects_missing_for_subcontract() -> None:
    required = build_required_fields(ContractType.SUBCONTRATACION)
    context = {
        "razon_social": "Proveedor X",
        "cif_empresa": "B12345678",
        "forma_pago": "CONFIRMING 60",
    }
    missing = validate_required(context, required)
    assert "tipo_escritura" in missing
    assert "direccion_empresa" in missing
    assert "empresa" in missing
    assert "razon_social" not in missing


def test_validate_jefe_obra_intake_detects_missing_fields() -> None:
    contract = Contract(
        tenant_id=1,
        created_by_id=1,
        type=ContractType.SUBCONTRATACION,
        status=ContractStatus.DRAFT,
        supplier_name="Proveedor X",
        supplier_tax_id="B12345678",
        contract_data={"economic": {"payment_method": "CONFIRMING 60"}},
    )
    missing = validate_jefe_obra_intake(contract)
    # Solo bloqueamos por campos siempre visibles en el formulario.
    assert "precio_total_ejecucion" in missing
    assert "nombre_contacto" not in missing
    assert "email_contacto" not in missing
    labels = format_jefe_obra_intake_missing_fields(missing)
    assert "Precio total ejecuci" in labels


def test_start_supplier_invitation_is_idempotent(db_session_fixture: Session, monkeypatch) -> None:
    tenant, user = _create_tenant_and_user(db_session_fixture)
    monkeypatch.setattr("app.domains.procurement.notifications._send_email", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        "app.domains.procurement.notifications.send_contract_notification.delay",
        lambda **_kwargs: None,
    )

    supplier = Supplier(
        tenant_id=tenant.id,
        created_by_id=user.id,
        tax_id="B12345678",
        name="Proveedor Uno",
        email="proveedor@example.com",
    )
    db_session_fixture.add(supplier)
    db_session_fixture.commit()
    db_session_fixture.refresh(supplier)

    contract = Contract(
        tenant_id=tenant.id,
        created_by_id=user.id,
        type=ContractType.SERVICIO,
        status=ContractStatus.DRAFT,
        supplier_id=supplier.id,
        supplier_tax_id=supplier.tax_id,
        supplier_email=supplier.email,
    )
    db_session_fixture.add(contract)
    db_session_fixture.commit()
    db_session_fixture.refresh(contract)

    first = start_supplier_invitation(
        db_session_fixture,
        contract=contract,
        missing_fields=["nombre_gerente", "categoria_servicio"],
    )
    second = start_supplier_invitation(
        db_session_fixture,
        contract=contract,
        missing_fields=["nombre_gerente", "categoria_servicio"],
    )

    invitations = db_session_fixture.exec(
        select(SupplierInvitation).where(SupplierInvitation.contract_id == contract.id)
    ).all()
    assert first is not None
    assert second is not None
    assert first.id == second.id
    assert len(invitations) == 1


def test_generate_contract_document_is_idempotent(
    db_session_fixture: Session, monkeypatch, tmp_path
) -> None:
    tenant, user = _create_tenant_and_user(db_session_fixture)
    monkeypatch.setattr(settings, "contracts_storage_path", str(tmp_path))
    contract = Contract(
        tenant_id=tenant.id,
        created_by_id=user.id,
        type=ContractType.SUMINISTRO,
        status=ContractStatus.DRAFT,
        supplier_name="Proveedor Dos",
        supplier_tax_id="B87654321",
        supplier_email="proveedor2@example.com",
    )
    db_session_fixture.add(contract)
    db_session_fixture.commit()
    db_session_fixture.refresh(contract)

    context = {"razon_social": "Proveedor Dos", "cif": "B87654321"}
    first_doc = generate_contract_document(
        db_session_fixture,
        contract=contract,
        context=context,
        created_by_id=user.id,
    )
    second_doc = generate_contract_document(
        db_session_fixture,
        contract=contract,
        context=context,
        created_by_id=user.id,
    )

    docs = db_session_fixture.exec(
        select(ContractDocument).where(
            ContractDocument.contract_id == contract.id,
            ContractDocument.doc_type == ContractDocumentType.CONTRACT,
        )
    ).all()
    assert first_doc.id == second_doc.id
    assert len(docs) == 1


def test_submit_gerencia_runs_precheck_and_moves_to_pending_departamentos(
    db_session_fixture: Session, monkeypatch
) -> None:
    tenant, user = _create_tenant_and_user(db_session_fixture)
    monkeypatch.setattr("app.domains.procurement.notifications._send_email", lambda *_args, **_kwargs: None)
    monkeypatch.setattr("app.domains.procurement.documents.signatures._send_email", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        "app.domains.procurement.notifications.send_contract_notification.delay",
        lambda **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.send_contract_notification.delay",
        lambda **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.documents_service.generate_contract_document",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.generate_comparative",
        lambda _contract: "/tmp/smoke-compare.pdf",
    )

    from app.platform.contracts_core.models import ComparativeStatus

    contract = Contract(
        tenant_id=tenant.id,
        created_by_id=user.id,
        type=ContractType.SUMINISTRO,
        status=ContractStatus.DRAFT,
        comparative_status=ComparativeStatus.APPROVED,
        supplier_name="Proveedor Tres",
        supplier_tax_id="B11223344",
        supplier_email="proveedor3@example.com",
        supplier_phone="600000000",
        supplier_contact_name="Ana Responsable",
        supplier_address="Calle Falsa 123",
        supplier_city="Madrid",
        supplier_postal_code="28001",
        supplier_country="ES",
        contract_data={
            "economic": {
                "payment_method": "CONFIRMING 60",
                "payment_method_agreed": "CONFIRMING 60",
                "price_type": "CERRADO",
                "total_execution_price": "1000.00",
            },
            "schedule": {
                "start_date": "2025-06-02",
                "end_date": "2025-08-31",
                "duration": "Tres meses",
            },
            "resources": {"work_number": "2512"},
            "additional": {
                "milestones": "Hito 1 - Hito 2",
                "units_description": "Detalle de unidades",
            },
            "manager": {
                "nombre_gerente": "Ana Responsable",
                "nif_gerente": "12345678Z",
            },
        },
    )
    db_session_fixture.add(contract)
    db_session_fixture.commit()
    db_session_fixture.refresh(contract)

    offer = ContractOffer(
        tenant_id=tenant.id,
        contract_id=contract.id,
        created_by_id=user.id,
        supplier_name="Proveedor Tres",
        supplier_tax_id="B11223344",
        supplier_email="proveedor3@example.com",
        total_amount=Decimal("1000.00"),
        currency="EUR",
    )
    db_session_fixture.add(offer)
    db_session_fixture.commit()
    db_session_fixture.refresh(offer)

    contract.selected_offer_id = offer.id
    db_session_fixture.add(contract)
    db_session_fixture.commit()
    db_session_fixture.refresh(contract)

    updated = submit_gerencia(
        db_session_fixture,
        contract_id=contract.id,
        tenant_id=tenant.id,
        user=user,
    )
    assert updated.status == ContractStatus.PENDING_DEPARTAMENTOS


def test_approve_all_phases_superadmin_force_path_is_single_bypass(
    db_session_fixture: Session,
    monkeypatch,
) -> None:
    tenant, user = _create_tenant_and_user(db_session_fixture)

    contract = Contract(
        tenant_id=tenant.id,
        created_by_id=user.id,
        type=ContractType.SERVICIO,
        status=ContractStatus.DRAFT,
        supplier_name="Proveedor Cuatro",
        supplier_tax_id="B55667788",
        supplier_email="proveedor4@example.com",
        supplier_phone="600123123",
    )
    db_session_fixture.add(contract)
    db_session_fixture.commit()
    db_session_fixture.refresh(contract)

    offer = ContractOffer(
        tenant_id=tenant.id,
        contract_id=contract.id,
        created_by_id=user.id,
        supplier_name="Proveedor Cuatro",
        supplier_tax_id="B55667788",
        supplier_email="proveedor4@example.com",
        total_amount=Decimal("2000.00"),
        currency="EUR",
    )
    db_session_fixture.add(offer)
    db_session_fixture.commit()
    db_session_fixture.refresh(offer)

    contract.selected_offer_id = offer.id
    db_session_fixture.add(contract)
    db_session_fixture.commit()
    db_session_fixture.refresh(contract)

    # Keep this test focused on workflow bypass semantics, not doc/render internals.
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.contract_validators.validate_required",
        lambda *_args, **_kwargs: [],
    )
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.contract_crud.ensure_supplier_snapshot",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.documents_service.generate_contract_document",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.generate_comparative",
        lambda _contract: "/tmp/force-compare.pdf",
    )
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.send_contract_notification.delay",
        lambda **_kwargs: None,
    )
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.submit_gerencia",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("legacy path should not be called")),
    )
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.approve_contract",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("legacy path should not be called")),
    )
    monkeypatch.setattr(
        "app.domains.procurement.workflow.approvals.documents_service.generate_docs",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("legacy path should not be called")),
    )

    updated = approve_all_phases_superadmin(
        db_session_fixture,
        contract_id=contract.id,
        tenant_id=tenant.id,
        user=user,
        comment="force-approve-test",
    )

    assert updated.status == ContractStatus.IN_SIGNATURE
    assert updated.approved_at is not None

    approvals = db_session_fixture.exec(
        select(ContractWorkflowApproval).where(
            ContractWorkflowApproval.tenant_id == tenant.id,
            ContractWorkflowApproval.contract_id == contract.id,
        )
    ).all()
    assert approvals
    assert all(row.status == ApprovalStatus.APPROVED for row in approvals)
    assert all(row.decided_by_id == user.id for row in approvals)

    steps = db_session_fixture.exec(
        select(ContractWorkflowStep).where(ContractWorkflowStep.tenant_id == tenant.id)
    ).all()
    assert steps

