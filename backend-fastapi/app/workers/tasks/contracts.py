import logging
from datetime import datetime, timezone

from celery import Task
from sqlmodel import Session, select

from app.platform.contracts_core.models import Contract, ContractNotificationEvent, ContractOffer
from app.domains.procurement.notifications import (
    dispatch_internal_notifications,
    send_contract_notification as send_contract_email,
)
from app.domains.documents.service import generate_contract
from app.platform.contracts_core.models import ContractDocument, ContractDocumentType
from app.core.config import settings
from app.db.session import engine
from app.workers.celery_app import celery_app


logger = logging.getLogger("app.platform.contracts_core")


class BaseContractTask(Task):
    autoretry_for = ()
    retry_backoff = True
    retry_jitter = True
    max_retries = 3


def _dispatch_supplier_email(
    session: Session,
    *,
    event: ContractNotificationEvent,
    contract: Contract,
    signature_token: str | None,
    department_label: str | None,
) -> None:
    if event != ContractNotificationEvent.SIGNATURE_SENT:
        return
    if not contract.supplier_email:
        return

    send_contract_email(
        session,
        event=event,
        contract=contract,
        recipients=[contract.supplier_email],
        signature_token=signature_token,
        department_label=department_label,
    )


@celery_app.task(bind=True, base=BaseContractTask, name="app.workers.tasks.contracts.generate_contract_docs")
def generate_contract_docs(self: BaseContractTask, contract_id: int) -> None:
    with Session(engine) as session:
        contract = session.get(Contract, contract_id)
        if not contract:
            return

        existing = session.exec(
            select(ContractDocument).where(
                ContractDocument.contract_id == contract.id,
                ContractDocument.tenant_id == contract.tenant_id,
            )
        ).all()
        existing_types = {doc.doc_type for doc in existing}

        contract_path = generate_contract(contract)
        if contract_path and ContractDocumentType.CONTRACT not in existing_types:
            session.add(
                ContractDocument(
                    tenant_id=contract.tenant_id,
                    contract_id=contract.id,
                    doc_type=ContractDocumentType.CONTRACT,
                    path=str(contract_path),
                    created_by_id=None,
                )
            )

        session.commit()


@celery_app.task(name="app.workers.tasks.contracts.send_contract_notification")
def send_contract_notification(
    event: ContractNotificationEvent,
    contract_id: int,
    signature_token: str | None = None,
    department_label: str | None = None,
) -> None:
    with Session(engine) as session:
        if isinstance(event, str):
            event = ContractNotificationEvent(event)
        contract = session.get(Contract, contract_id)
        if not contract:
            return
        try:
            dispatch_internal_notifications(
                session,
                event=event,
                contract=contract,
                department_label=department_label,
            )
        except Exception:
            logger.exception(
                "Error creating internal notifications for contract_id=%s event=%s",
                contract.id,
                event.value if hasattr(event, "value") else event,
            )

        try:
            _dispatch_supplier_email(
                session,
                event=event,
                contract=contract,
                signature_token=signature_token,
                department_label=department_label,
            )
        except Exception:
            logger.exception(
                "Error sending supplier email for contract_id=%s event=%s",
                contract.id,
                event.value if hasattr(event, "value") else event,
            )


@celery_app.task(name="app.workers.tasks.contracts.ocr_extract_offer")
def ocr_extract_offer(offer_id: int) -> None:
    with Session(engine) as session:
        offer = session.get(ContractOffer, offer_id)
        if not offer:
            return
        offer.extraction_meta = {
            "status": "skipped",
            "reason": "OCR hook placeholder",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        session.add(offer)
        session.commit()


@celery_app.task(name="app.workers.tasks.contracts.auto_approve_stale_workflow")
def auto_approve_stale_workflow() -> dict[str, int]:
    """
    Autoaprueba pendientes de workflow con mas de 48h cuando el resto
    de departamentos ya ha aprobado.
    """
    with Session(engine) as session:
        from app.domains.procurement.workflow import approvals as workflow_approvals

        summary = workflow_approvals.auto_approve_stale_workflow_approvals(
            session=session,
            grace_days=settings.contracts_auto_approve_grace_days,
            batch_size=settings.contracts_auto_approve_batch_size,
        )
        logger.info("Autoaprobacion workflow contratos: %s", summary)
        return summary


@celery_app.task(
    bind=True,
    base=BaseContractTask,
    name="app.workers.tasks.contracts.retry_send_supplier_form_after_approval",
)
def retry_send_supplier_form_after_approval(
    self: BaseContractTask,
    *,
    contract_id: int,
    tenant_id: int,
    user_id: int,
) -> None:
    """Reintenta enviar el formulario de onboarding al proveedor tras un fallo
    transitorio de base de datos en `approve_management_comparative`.

    Solo actua si el comparativo sigue APPROVED y el proveedor aun no ha
    completado los datos. Programado con countdown=3600 (1 hora).
    """
    from app.models.user import User
    from app.domains.procurement.comparatives import service as comparatives_service
    from app.platform.contracts_core.models import ComparativeStatus

    with Session(engine) as session:
        contract = session.get(Contract, contract_id)
        if not contract or contract.tenant_id != tenant_id:
            return
        cd = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
        if contract.comparative_status != ComparativeStatus.APPROVED:
            return
        if cd.get("supplier_data_captured_at"):
            return
        if not cd.get("needs_supplier_form_after_approval") and not cd.get(
            "supplier_form_sent_at"
        ):
            return

        user = session.get(User, user_id)
        if not user:
            logger.warning(
                "Reintento envio formulario abortado: usuario %s no encontrado contract_id=%s",
                user_id,
                contract_id,
            )
            return
        try:
            comparatives_service.send_supplier_form_after_approval(
                session,
                contract_id=contract_id,
                tenant_id=tenant_id,
                user=user,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Reintento envio formulario fallido contract_id=%s: %s",
                contract_id,
                exc,
            )


@celery_app.task(name="app.workers.tasks.contracts.auto_approve_stale_comparatives")
def auto_approve_stale_comparatives() -> dict[str, int]:
    """Auto-aprueba comparativos PENDING_MGMT_APPROVAL con más de 3 días naturales."""
    with Session(engine) as session:
        from app.domains.procurement.comparatives import service as comparatives_service

        summary = comparatives_service.auto_approve_stale_comparatives(
            session=session,
            grace_days=settings.comparatives_auto_approve_grace_days,
            batch_size=settings.contracts_auto_approve_batch_size,
        )
        logger.info("Autoaprobacion comparativos: %s", summary)
        return summary


