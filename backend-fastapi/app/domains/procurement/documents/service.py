from __future__ import annotations
import logging
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session

from app.platform.contracts_core.models import (
    Contract,
    ContractDocument,
    ContractDocumentType,
    SignatureRequest,
    Supplier,
)
from app.platform.contracts_core.permissions import ensure_tenant_access
from app.models.user import User

from app.domains.procurement.documents import generator as documents_generator
from app.domains.procurement.documents import paths as documents_paths
from app.domains.procurement.documents import repository as documents_repository
from app.domains.procurement.documents import signatures as documents_signatures
from app.domains.procurement.contracts import crud as contract_crud
from app.domains.procurement.contracts import validators as contract_validators


logger = logging.getLogger("app.procurement.documents.service")


def _get_contract_for_document_access(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    return contract_crud.get_contract(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def _try_generate_contract_document_if_missing(
    session: Session,
    *,
    contract: Contract,
    user: User,
) -> Optional[ContractDocument]:
    if contract.template_id is None:
        return None
    try:
        contract_crud.ensure_supplier_snapshot(session, contract=contract)
        context = contract_validators.extract_context(contract)
        return generate_contract_document(
            session,
            contract=contract,
            context=context,
            created_by_id=user.id,
            auto_commit=True,
        )
    except HTTPException as exc:
        logger.warning(
            "On-demand document generation failed contract_id=%s tenant_id=%s detail=%s",
            contract.id,
            contract.tenant_id,
            exc.detail,
        )
        session.rollback()
        return None
    except Exception as exc:
        logger.exception(
            "Unexpected on-demand document generation failure contract_id=%s tenant_id=%s: %s",
            contract.id,
            contract.tenant_id,
            exc,
        )
        session.rollback()
        return None

def generate_contract_document(
    session: Session,
    *,
    contract: Contract,
    context: dict[str, Any],
    created_by_id: Optional[int],
    auto_commit: bool = True,
) -> ContractDocument:
    return documents_generator.generate_contract_document(
        session,
        contract=contract,
        context=context,
        created_by_id=created_by_id,
        auto_commit=auto_commit,
    )

def create_documents_for_contract(
    session: Session,
    *,
    contract: Contract,
    created_by_id: Optional[int],
) -> list[ContractDocument]:
    return documents_generator.create_documents_for_contract(
        session,
        contract=contract,
        created_by_id=created_by_id,
    )

def generate_docs(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    return documents_generator.generate_docs(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )

def regenerate_contract_pdf(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    return documents_generator.regenerate_contract_pdf(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )

def start_supplier_invitation(
    session: Session,
    *,
    contract: Contract,
    missing_fields: list[str],
) -> Optional[Contract]:
    return documents_signatures.start_supplier_invitation(
        session,
        contract=contract,
        missing_fields=missing_fields,
    )

def generate_supplier_onboarding_link(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    supplier_tax_id: Optional[str],
    supplier_email: Optional[str],
) -> dict:
    return documents_signatures.generate_supplier_onboarding_link(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
        supplier_tax_id=supplier_tax_id,
        supplier_email=supplier_email,
    )

def validate_supplier_onboarding(
    session: Session,
    *,
    token: str,
) -> Optional[dict]:
    return documents_signatures.validate_supplier_onboarding(
        session,
        token=token,
    )

def submit_supplier_onboarding(
    session: Session,
    *,
    token: str,
    payload: dict,
) -> Optional[Supplier]:
    return documents_signatures.submit_supplier_onboarding(
        session,
        token=token,
        payload=payload,
    )

def create_signature_request(session: Session, *, contract: Contract) -> SignatureRequest:
    return documents_signatures.create_signature_request(
        session,
        contract=contract,
    )

def sign_contract_by_token(
    session: Session,
    *,
    token: str,
    upload: Optional[UploadFile],
    signer_ip: Optional[str],
    signer_name: Optional[str] = None,
    signer_identifier: Optional[str] = None,
    signer_email: Optional[str] = None,
    signer_company: Optional[str] = None,
    accepted_terms: bool = False,
    signer_user_agent: Optional[str] = None,
    signature_image: Optional[UploadFile] = None,
) -> SignatureRequest:
    return documents_signatures.sign_contract_by_token(
        session,
        token=token,
        upload=upload,
        signer_ip=signer_ip,
        signer_name=signer_name,
        signer_identifier=signer_identifier,
        signer_email=signer_email,
        signer_company=signer_company,
        accepted_terms=accepted_terms,
        signer_user_agent=signer_user_agent,
        signature_image=signature_image,
    )

def validate_signature_token(
    session: Session,
    *,
    token: str,
) -> SignatureRequest:
    return documents_signatures.validate_signature_token(
        session,
        token=token,
    )

def get_contract_pdf_by_signature_token(
    session: Session,
    *,
    token: str,
) -> tuple[Path, str]:
    return documents_signatures.get_contract_pdf_by_signature_token(
        session,
        token=token,
    )

def _generate_signed_contract_from_token_data(
    session: Session,
    *,
    contract: Contract,
    signer_name: str,
    signer_identifier: Optional[str],
    signer_email: Optional[str],
    signer_company: Optional[str],
    signer_ip: Optional[str],
    signer_user_agent: Optional[str],
    signature_image: Optional[UploadFile],
) -> Optional[Path]:
    return documents_signatures._generate_signed_contract_from_token_data(
        session,
        contract=contract,
        signer_name=signer_name,
        signer_identifier=signer_identifier,
        signer_email=signer_email,
        signer_company=signer_company,
        signer_ip=signer_ip,
        signer_user_agent=signer_user_agent,
        signature_image=signature_image,
    )


def list_contract_documents(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[ContractDocument]:
    ensure_tenant_access(user, tenant_id)
    contract = _get_contract_for_document_access(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )
    docs = documents_repository.list_contract_documents(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
    )

    for doc in docs:
        doc.path = documents_paths._public_contract_document_path(doc.path) or doc.path
    return docs


def get_contract_document_by_type(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    doc_type: ContractDocumentType,
) -> ContractDocument:
    contract = _get_contract_for_document_access(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )
    docs = documents_repository.list_contract_documents(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
    )
    for doc in docs:
        doc.path = documents_paths._public_contract_document_path(doc.path) or doc.path
        if doc.doc_type == doc_type:
            return doc
    if doc_type == ContractDocumentType.CONTRACT:
        generated = _try_generate_contract_document_if_missing(
            session,
            contract=contract,
            user=user,
        )
        if generated is not None:
            generated.path = documents_paths._public_contract_document_path(generated.path) or generated.path
            return generated
        if contract.template_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pendiente de seleccionar plantilla.",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plantilla asignada, documento pendiente de generar.",
        )
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Documento no encontrado para el tipo solicitado.",
    )
