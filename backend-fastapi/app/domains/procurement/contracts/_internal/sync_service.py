from __future__ import annotations

from typing import Any

from sqlmodel import Session

from app.domains.procurement.api import (
    get_contract_workflow_config as _get_contract_workflow_config,
    set_contract_workflow_config as _set_contract_workflow_config,
)

from app.domains.invoices.ocr.service import lookup_supplier as _lookup_supplier
from app.domains.procurement.api import (
    build_supplier_onboarding_payload as _build_supplier_onboarding_payload,
    generate_supplier_onboarding_link as _generate_supplier_onboarding_link,
)
from app.models.user import User


def lookup_supplier(
    session: Session,
    *,
    tenant_id: int,
    tax_id: str,
    contract_type,
):
    return _lookup_supplier(
        session=session,
        tenant_id=tenant_id,
        tax_id=tax_id,
        contract_type=contract_type,
    )


def get_workflow_config(session: Session, *, tenant_id: int):
    return _get_contract_workflow_config(session=session, tenant_id=tenant_id)


def set_workflow_config(session: Session, *, tenant_id: int, steps: list[dict[str, Any]]):
    return _set_contract_workflow_config(session=session, tenant_id=tenant_id, steps=steps)


def generate_supplier_onboarding_link(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    supplier_tax_id: str | None = None,
    supplier_email: str | None = None,
):
    return _generate_supplier_onboarding_link(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
        supplier_tax_id=supplier_tax_id,
        supplier_email=supplier_email,
    )


def build_supplier_onboarding_payload(contract):
    return _build_supplier_onboarding_payload(contract)
