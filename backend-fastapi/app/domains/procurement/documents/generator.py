from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import Session, select

from app.platform.contracts_core.models import (
    Contract,
    ContractDocument,
    ContractDocumentType,
    ContractNotificationEvent,
    ContractStatus,
    ComparativeStatus,
)
from app.platform.contracts_core.permissions import (
    can_approve_comparative,
    can_write_comparative,
    ensure_tenant_access,
)
from app.domains.documents.service import generate_contract
from app.domains.procurement.contracts import crud as contract_crud
from app.domains.procurement.contracts import validators as contract_validators
from app.domains.procurement.documents import signatures as documents_signatures
from app.domains.procurement.notifications import dispatch_internal_notifications
from app.models.user import User

logger = logging.getLogger("app.platform.contracts_core")

def generate_contract_document(
    session: Session,
    *,
    contract: Contract,
    context: dict[str, Any],
    created_by_id: Optional[int],
    auto_commit: bool = True,
) -> ContractDocument:
    existing = session.exec(
        select(ContractDocument).where(
            ContractDocument.tenant_id == contract.tenant_id,
            ContractDocument.contract_id == contract.id,
            ContractDocument.doc_type == ContractDocumentType.CONTRACT,
        )
    ).first()

    output_path = generate_contract(contract)
    if not output_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay datos suficientes para generar el contrato.",
        )

    if existing:
        existing.path = str(output_path)
        if created_by_id is not None:
            existing.created_by_id = created_by_id
        session.add(existing)
        if auto_commit:
            session.commit()
            session.refresh(existing)
        else:
            session.flush()
        return existing

    doc = ContractDocument(
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        doc_type=ContractDocumentType.CONTRACT,
        path=str(output_path),
        created_by_id=created_by_id,
    )
    session.add(doc)
    if auto_commit:
        session.commit()
        session.refresh(doc)
    else:
        session.flush()
    return doc


def create_documents_for_contract(
    session: Session,
    *,
    contract: Contract,
    created_by_id: Optional[int],
) -> list[ContractDocument]:
    documents: list[ContractDocument] = []

    existing_docs = session.exec(
        select(ContractDocument).where(
            ContractDocument.contract_id == contract.id,
            ContractDocument.tenant_id == contract.tenant_id,
        )
    ).all()
    existing_by_type = {doc.doc_type: doc for doc in existing_docs}

    contract_path = generate_contract(contract)
    contract_existing = existing_by_type.get(ContractDocumentType.CONTRACT)
    if contract_path:
        if contract_existing:
            contract_existing.path = str(contract_path)
            if created_by_id is not None:
                contract_existing.created_by_id = created_by_id
            session.add(contract_existing)
        else:
            documents.append(
                ContractDocument(
                    tenant_id=contract.tenant_id,
                    contract_id=contract.id,
                    doc_type=ContractDocumentType.CONTRACT,
                    path=str(contract_path),
                    created_by_id=created_by_id,
                )
            )

    if documents:
        session.add_all(documents)
    if documents or (contract_path and contract_existing):
        session.commit()
    return documents


def generate_docs(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_write_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    stable_contract_id = contract.id
    contract_validators._ensure_status_or_400(contract.status, [ContractStatus.DRAFT])
    cd_guard = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    if cd_guard.get("needs_supplier_form_after_approval"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "El proveedor debe completar sus datos antes de generar el contrato. "
                "Espera a que rellene el formulario o reenvialo manualmente."
            ),
        )
    if contract.comparative_status == ComparativeStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comparativo fue rechazado. Corrigelo antes de generar documentos.",
        )
    if contract.comparative_status != ComparativeStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comparativo debe estar aprobado por gerencia antes de generar documentos.",
        )
    if not contract.selected_offer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selecciona la oferta ganadora antes de generar documentos.",
        )
    missing_jefe_obra_intake = contract_validators.validate_jefe_obra_intake(contract)
    if missing_jefe_obra_intake:
        missing_labels = contract_validators.format_jefe_obra_intake_missing_fields(
            missing_jefe_obra_intake
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Faltan datos obligatorios del Jefe de Obra para iniciar el contrato: "
                f"{missing_labels}."
            ),
        )
    try:
        contract_crud.ensure_supplier_snapshot(session, contract=contract)
        context = contract_validators.extract_context(contract)
        required_fields = contract_validators.build_required_fields(contract.type)
        missing_fields = contract_validators.validate_required(context, required_fields)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "Error preparando datos para generar documentos contract_id=%s tenant_id=%s: %s",
            contract.id,
            tenant_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno preparando datos del contrato.",
        ) from exc

    if missing_fields:
        try:
            documents_signatures.start_supplier_invitation(
                session,
                contract=contract,
                missing_fields=missing_fields,
            )
        except HTTPException as exc:
            logger.warning(
                "No se pudo crear invitacion de proveedor contract_id=%s tenant_id=%s: %s",
                stable_contract_id,
                tenant_id,
                exc.detail,
            )
            session.rollback()
            contract = contract_crud._get_contract_or_404(session, stable_contract_id, tenant_id)
            contract.status = ContractStatus.PENDING_JEFE_OBRA
            contract.updated_at = datetime.now(timezone.utc)
            session.add(contract)
            session.commit()
            session.refresh(contract)
            return contract
        except Exception as exc:
            session.rollback()
            logger.warning(
                "Error solicitando datos al proveedor (fallback a PENDING_JEFE_OBRA) contract_id=%s tenant_id=%s: %s",
                stable_contract_id,
                tenant_id,
                exc,
            )
            contract = contract_crud._get_contract_or_404(session, stable_contract_id, tenant_id)
            contract.status = ContractStatus.PENDING_JEFE_OBRA
            contract.updated_at = datetime.now(timezone.utc)
            session.add(contract)
            session.commit()
            session.refresh(contract)
            return contract
        session.refresh(contract)
        return contract

    try:
        generate_contract_document(
            session,
            contract=contract,
            context=context,
            created_by_id=user.id,
        )
    except Exception as exc:
        logger.exception(
            "Error generando documento de contrato contract_id=%s tenant_id=%s: %s",
            contract.id,
            tenant_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo generar el documento de contrato.",
        ) from exc

    contract.status = ContractStatus.PENDING_JEFE_OBRA
    try:
        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)
        session.commit()
        session.refresh(contract)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo guardar por conflicto de datos (CIF/correo duplicado o formato invalido).",
        ) from exc
    except SQLAlchemyError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno guardando el contrato.",
        ) from exc

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.docs_generated",
        payload={"required_fields": required_fields, "missing_fields": []},
    )

    # Dispatch SYNC del bell para no depender de Celery worker.
    try:
        dispatch_internal_notifications(
            session,
            event=ContractNotificationEvent.DOCS_GENERATED,
            contract=contract,
        )
    except Exception:
        logger.exception(
            "Error creando notificacion in-app DOCS_GENERATED contract_id=%s",
            contract.id,
        )
    try:
        dispatch_internal_notifications(
            session,
            event=ContractNotificationEvent.SENT_TO_GERENCIA,
            contract=contract,
        )
    except Exception:
        logger.exception(
            "Error creando notificacion in-app SENT_TO_GERENCIA contract_id=%s",
            contract.id,
        )
    return contract


def regenerate_contract_pdf(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    from app.platform.contracts_core.permissions import can_regenerate_contract
    from app.platform.contracts_core.models import ContractStatus as _CS

    ensure_tenant_access(user, tenant_id)
    if not can_regenerate_contract(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permiso para regenerar el contrato.",
        )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    # REJECTED es terminal: nadie puede regenerar el documento.
    if contract.status == _CS.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El contrato está rechazado y no se puede regenerar.",
        )
    contract_crud.ensure_supplier_snapshot(session, contract=contract)
    context = contract_validators.extract_context(contract)
    generate_contract_document(
        session,
        contract=contract,
        context=context,
        created_by_id=user.id,
    )
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.contract_pdf_regenerated",
    )
    return contract



