from __future__ import annotations

from typing import Optional

from sqlmodel import Session

from app.platform.contracts_core.models import ContractDocumentType, ContractStatus
from app.models.user import User

from app.domains.procurement.api import (
    approve_all_phases_superadmin,
    approve_contract,
    build_contract_read,
    build_contract_reads,
    create_contract,
    delete_contract,
    generate_docs,
    get_contract,
    get_contract_comparative_approvals,
    get_contract_document_by_type,
    get_contract_workflow_approvals,
    list_contract_documents,
    list_contracts,
    regenerate_contract_pdf,
    reject_contract,
    submit_gerencia,
    update_contract,
)

__all__ = [
    "create",
    "list_for_user",
    "get_by_id",
    "delete_by_id",
    "list_documents",
    "get_document_by_type",
    "update",
    "generate_documents",
    "submit_to_management",
    "approve",
    "reject",
    "regenerate_pdf",
    "approve_all_phases",
    "list_workflow_approvals",
    "list_comparative_approvals",
    "build_read",
    "build_reads",
]


def create(
    session: Session,
    *,
    tenant_id: int,
    created_by: User,
    payload: dict,
):
    return create_contract(
        session=session,
        tenant_id=tenant_id,
        created_by=created_by,
        payload=payload,
    )


def list_for_user(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    status_filter: Optional[ContractStatus] = None,
    pending_only: bool = False,
    assigned_to_me: bool = False,
    limit: int = 100,
    offset: int = 0,
):
    return list_contracts(
        session=session,
        tenant_id=tenant_id,
        current_user=current_user,
        status_filter=status_filter,
        pending_only=pending_only,
        assigned_to_me=assigned_to_me,
        limit=limit,
        offset=offset,
    )


def get_by_id(session: Session, *, contract_id: int, tenant_id: int, user: User):
    return get_contract(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def delete_by_id(session: Session, *, contract_id: int, tenant_id: int, user: User) -> None:
    delete_contract(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def list_documents(session: Session, *, contract_id: int, tenant_id: int, user: User):
    return list_contract_documents(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def get_document_by_type(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    doc_type: ContractDocumentType,
):
    return get_contract_document_by_type(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
        doc_type=doc_type,
    )


def update(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    payload: dict,
    user: User,
):
    return update_contract(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        payload=payload,
        user=user,
    )


def generate_documents(session: Session, *, contract_id: int, tenant_id: int, user: User):
    return generate_docs(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def submit_to_management(session: Session, *, contract_id: int, tenant_id: int, user: User):
    return submit_gerencia(
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
    return approve_contract(
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
    back_to_status,
):
    return reject_contract(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
        reason=reason,
        back_to_status=back_to_status,
    )


def regenerate_pdf(session: Session, *, contract_id: int, tenant_id: int, user: User):
    return regenerate_contract_pdf(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def approve_all_phases(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: str | None,
):
    return approve_all_phases_superadmin(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
        comment=comment,
    )


def list_workflow_approvals(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
):
    return get_contract_workflow_approvals(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def list_comparative_approvals(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
):
    return get_contract_comparative_approvals(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def build_read(session: Session, contract):
    return build_contract_read(session, contract)


def build_reads(session: Session, contracts):
    return build_contract_reads(session, contracts)
