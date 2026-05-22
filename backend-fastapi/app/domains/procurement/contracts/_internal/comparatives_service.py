from __future__ import annotations

from typing import Any

from fastapi import UploadFile
from sqlmodel import Session

from app.models.user import User
from app.domains.procurement.api import (
    add_offer as _add_offer,
    approve_comparative as _approve_comparative,
    get_comparative_offers as _get_comparative_offers,
    rebuild_comparative as _rebuild_comparative,
    reject_comparative as _reject_comparative,
    return_comparative as _return_comparative,
    save_comparative_draft as _save_comparative_draft,
    select_offer as _select_offer,
    submit_comparative as _submit_comparative,
    sync_comparative_offer_ids as _sync_comparative_offer_ids,
    validate_rea_for_contract as _validate_rea_for_contract,
    send_supplier_form_after_approval as _send_supplier_form_after_approval,
)

__all__ = [
    "get_comparative_offers",
    "save_draft",
    "sync_offer_ids",
    "add_offer",
    "select_offer",
    "submit",
    "validate_rea",
    "send_supplier_form_after_approval",
    "rebuild",
    "approve",
    "reject",
    "return_comparative",
]


def get_comparative_offers(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[dict]:
    return _get_comparative_offers(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def save_draft(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    payload: dict[str, Any],
    user: User,
):
    return _save_comparative_draft(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        payload=payload,
        user=user,
    )


def sync_offer_ids(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[dict]:
    return _sync_comparative_offer_ids(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def add_offer(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    payload: dict[str, Any],
    upload: UploadFile,
    user: User,
):
    return _add_offer(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        payload=payload,
        upload=upload,
        user=user,
    )


def select_offer(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    offer_id: int,
    user: User,
):
    return _select_offer(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        offer_id=offer_id,
        user=user,
    )


def submit(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
):
    return _submit_comparative(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def validate_rea(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> dict:
    return _validate_rea_for_contract(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def send_supplier_form_after_approval(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
):
    return _send_supplier_form_after_approval(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def rebuild(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
):
    return _rebuild_comparative(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def approve(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: str | None,
):
    return _approve_comparative(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
        comment=comment,
    )


def reject(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    reason: str,
):
    return _reject_comparative(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
        reason=reason,
    )


def return_comparative(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: str,
):
    return _return_comparative(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
        comment=comment,
    )
