import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import redis
from celery import Task
from celery.exceptions import MaxRetriesExceededError
from sqlmodel import Session, select

from app.ai.client import (
    OllamaClient,
    build_extraction_meta,
    normalize_invoice_json,
    _looks_like_bad_supplier_name,
    _looks_like_customer,
    _find_supplier_name_in_header,
)
from app.ai.errors import AIInvalidResponseError, AIUnavailableError
from app.core.config import settings
from app.core.email import send_invoice_created_email, send_invoice_due_reminder_email
from app.domains.invoices.ocr import service as ocr_service
from app.db.session import engine
from app.domains.invoices.models import (
    Invoice,
    InvoiceEventType,
    InvoiceStatus,
    NotificationLog,
    NotificationType,
)
from app.domains.invoices.schemas import InvoiceExtractionData
from app.domains.invoices.service import apply_extraction, log_invoice_event, mark_extraction_failed
from app.models.user import User
from app.workers.celery_app import celery_app


logger = logging.getLogger("app.domains.invoices")


def _merge_recipients(*groups: list[str]) -> list[str]:
    merged: list[str] = []
    seen = set()
    for group in groups:
        for email in group:
            if not email:
                continue
            clean = email.strip().lower()
            if not clean or clean in seen:
                continue
            seen.add(clean)
            merged.append(clean)
    return merged


def _get_base_recipients(recipient_email: Optional[str]) -> list[str]:
    base = []
    if recipient_email:
        base.append(recipient_email)
    return _merge_recipients(base, settings.invoice_due_base_recipients)


def _get_due_recipients(
    recipient_email: Optional[str],
    reminder_type: NotificationType,
) -> list[str]:
    base = _get_base_recipients(recipient_email)
    if reminder_type == NotificationType.DUE_10:
        return _merge_recipients(base, settings.invoice_due_extra_recipients_10)
    if reminder_type == NotificationType.DUE_5:
        return _merge_recipients(base, settings.invoice_due_extra_recipients_5)
    return base


def _get_created_recipients(recipient_email: Optional[str]) -> list[str]:
    base = [recipient_email] if recipient_email else []
    return _merge_recipients(base, settings.invoice_created_extra_recipients)


def _redis_client() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def _ai_breaker_key() -> str:
    return "ai:down"


def _is_ai_down(client: redis.Redis) -> Optional[int]:
    try:
        ttl = client.ttl(_ai_breaker_key())
        return ttl if ttl and ttl > 0 else None
    except redis.RedisError:
        logger.warning("No se pudo consultar circuit breaker de IA en Redis; se continua sin breaker.")
        return None


def _set_ai_down(client: redis.Redis) -> None:
    try:
        client.set(_ai_breaker_key(), "1", ex=settings.ai_circuit_breaker_ttl_seconds)
    except redis.RedisError:
        logger.warning("No se pudo registrar circuit breaker de IA en Redis.")


def _clear_ai_down(client: redis.Redis) -> None:
    try:
        client.delete(_ai_breaker_key())
    except redis.RedisError:
        logger.warning("No se pudo limpiar circuit breaker de IA en Redis.")


def _extract_text_pdf(path: str) -> str:
    return ocr_service.extract_text_from_pdf(path)


def _ocr_pdf(path: str, client: OllamaClient, dpi: int = 200, timeout_seconds: Optional[float] = None) -> str:
    return ocr_service.ocr_pdf_to_text(path, client, dpi=dpi, timeout_seconds=timeout_seconds, max_pages=2)


def _ocr_pdf_high(path: str, client: OllamaClient, timeout_seconds: Optional[float] = None) -> str:
    return ocr_service.ocr_pdf_to_text(
        path,
        client,
        dpi=300,
        max_pages=2,
        timeout_seconds=timeout_seconds,
    )


def _ocr_pdf_header(
    path: str,
    client: OllamaClient,
    dpi: int = 400,
    timeout_seconds: Optional[float] = None,
) -> str:
    return ocr_service.ocr_pdf_header(path, client, dpi=dpi, timeout_seconds=timeout_seconds)


def _ocr_image(path: str, client: OllamaClient, timeout_seconds: Optional[float] = None) -> str:
    return ocr_service.ocr_image(path, client, timeout_seconds=timeout_seconds)


def _should_ocr(text: str) -> bool:
    return len(text.strip()) < settings.invoice_min_text_length


def _has_extracted_core(extraction: InvoiceExtractionData) -> bool:
    return (
        extraction.total_amount is not None
        or extraction.issue_date is not None
        or extraction.due_date is not None
        or extraction.invoice_number is not None
    )


class BaseInvoiceTask(Task):
    autoretry_for = (AIUnavailableError,)
    retry_backoff = True
    retry_jitter = True
    max_retries = 5


@celery_app.task(bind=True, base=BaseInvoiceTask, name="app.workers.tasks.invoices.extract_invoice")
def extract_invoice(self: BaseInvoiceTask, invoice_id: int) -> None:
    client = _redis_client()
    ttl = _is_ai_down(client)
    if ttl:
        # Fast path: si el breaker sigue activo pero la IA ya responde,
        # limpiamos y continuamos sin esperar al siguiente retry.
        try:
            if OllamaClient().health_check(timeout=settings.ai_health_check_timeout_seconds):
                _clear_ai_down(client)
                ttl = None
        except Exception:
            # Si falla el probe puntual, no bloqueamos toda la cola de facturas
            # por un estado potencialmente obsoleto del breaker.
            ttl = None
    if ttl:
        try:
            raise self.retry(countdown=ttl)
        except MaxRetriesExceededError:
            with Session(engine) as session:
                invoice = session.get(Invoice, invoice_id)
                if invoice:
                    mark_extraction_failed(
                        session=session,
                        invoice=invoice,
                        error_message="Servicio de extraccion no disponible tras varios reintentos.",
                    )
            return

    with Session(engine) as session:
        invoice = session.get(Invoice, invoice_id)
        if not invoice:
            return
        if invoice.status in {InvoiceStatus.EXTRACTED, InvoiceStatus.VALIDATED, InvoiceStatus.PAID}:
            return

        invoice.status = InvoiceStatus.EXTRACTING
        invoice.updated_at = datetime.now(timezone.utc)
        session.add(invoice)
        session.commit()

        ai_client = OllamaClient()
        start = datetime.now(timezone.utc)
        text = ""
        ocr_timeout = float(min(30, max(10, int(settings.ollama_ocr_timeout_seconds))))
        json_timeout = float(min(30, max(10, int(settings.ollama_json_timeout_seconds))))
        header_ocr_timeout = float(min(8, ocr_timeout))

        try:
            path_lower = invoice.file_path.lower()
            is_image = path_lower.endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp"))
            if is_image:
                text = _ocr_image(invoice.file_path, ai_client, timeout_seconds=ocr_timeout)
            else:
                text = _extract_text_pdf(invoice.file_path)
                if _should_ocr(text):
                    text = _ocr_pdf(invoice.file_path, ai_client, timeout_seconds=ocr_timeout)
            if not text or not text.strip():
                mark_extraction_failed(
                    session=session,
                    invoice=invoice,
                    error_message="No se pudo extraer texto de la factura (OCR vacio).",
                )
                return

            # Fast path: si el parser local ya obtiene campos clave, evitamos
            # esperar al LLM remoto (principal fuente de latencia/timeouts).
            raw_local = ocr_service.parse_invoice_fields(text)
            extraction_local = InvoiceExtractionData.model_validate(raw_local)
            has_local_core = _has_extracted_core(extraction_local)
            if has_local_core:
                local_text = text
                if extraction_local.supplier_name is None and not is_image:
                    try:
                        header_text = _ocr_pdf_header(
                            invoice.file_path,
                            ai_client,
                            timeout_seconds=header_ocr_timeout,
                        )
                        if header_text and header_text.strip():
                            local_text = f"{header_text}\n{text}"
                            raw_local = ocr_service.parse_invoice_fields(local_text)
                            extraction_local = InvoiceExtractionData.model_validate(raw_local)
                    except Exception as exc:
                        logger.warning(
                            "OCR cabecera fast-path no disponible en invoice id=%s: %s",
                            invoice.id,
                            exc,
                        )
                if _looks_like_bad_supplier_name(
                    extraction_local.supplier_name,
                    extraction_local.invoice_number,
                ):
                    filename_guess = ocr_service.supplier_name_from_filename(invoice.original_filename)
                    if filename_guess:
                        extraction_local.supplier_name = filename_guess
                        raw_local["supplier_name"] = filename_guess

                meta = build_extraction_meta()
                meta["started_at"] = start.isoformat()
                meta["finished_at"] = datetime.now(timezone.utc).isoformat()
                meta["extraction_mode"] = "fallback_local_fast"
                apply_extraction(
                    session=session,
                    invoice=invoice,
                    extraction=extraction_local,
                    raw_text=local_text,
                    raw_json=raw_local,
                    meta=meta,
                )
                return

            raw_json = ai_client.invoice_text_to_json(
                text,
                timeout_seconds=json_timeout,
                max_retries=1,
            )
            normalized_json = normalize_invoice_json(raw_json, fallback_text=text)

            if not is_image and _looks_like_customer(normalized_json.get("supplier_name")):
                header_text = _ocr_pdf_header(
                    invoice.file_path,
                    ai_client,
                    timeout_seconds=header_ocr_timeout,
                )
                combined_text = f"{header_text}\n{text}" if header_text else text
                normalized_json = normalize_invoice_json(raw_json, fallback_text=combined_text)
                if _looks_like_customer(normalized_json.get("supplier_name")):
                    ocr_text = _ocr_pdf_high(
                        invoice.file_path,
                        ai_client,
                        timeout_seconds=ocr_timeout,
                    )
                    if ocr_text and ocr_text != text:
                        raw_json_ocr = ai_client.invoice_text_to_json(
                            ocr_text,
                            timeout_seconds=json_timeout,
                            max_retries=1,
                        )
                        combined_ocr = (
                            f"{header_text}\n{ocr_text}" if header_text else ocr_text
                        )
                        normalized_json_ocr = normalize_invoice_json(raw_json_ocr, fallback_text=combined_ocr)
                        if not _looks_like_customer(normalized_json_ocr.get("supplier_name")):
                            text = ocr_text
                            raw_json = raw_json_ocr
                            normalized_json = normalized_json_ocr
                if _looks_like_customer(normalized_json.get("supplier_name")) and header_text:
                    header_guess = _find_supplier_name_in_header(header_text)
                    if header_guess:
                        normalized_json["supplier_name"] = header_guess
            supplier_name = normalized_json.get("supplier_name")
            if _looks_like_bad_supplier_name(supplier_name, normalized_json.get("invoice_number")):
                filename_guess = ocr_service.supplier_name_from_filename(invoice.original_filename)
                if filename_guess:
                    normalized_json["supplier_name"] = filename_guess
            extraction = InvoiceExtractionData.model_validate(normalized_json)
            if not _has_extracted_core(extraction):
                mark_extraction_failed(
                    session=session,
                    invoice=invoice,
                    error_message="Extraccion vacia: no se detectaron importe, fechas ni numero de factura.",
                )
                return
            meta = build_extraction_meta()
            meta["started_at"] = start.isoformat()
            meta["finished_at"] = datetime.now(timezone.utc).isoformat()

            apply_extraction(
                session=session,
                invoice=invoice,
                extraction=extraction,
                raw_text=text,
                raw_json=raw_json,
                meta=meta,
            )
            # Encolar correo de "factura registrada" como tarea independiente.
            try:
                send_invoice_created_notification.delay(invoice.id)
            except Exception as exc:
                logger.exception(
                    "No se pudo encolar notificacion de factura registrada id=%s: %s",
                    invoice.id,
                    exc,
                )
        except AIUnavailableError:
            # Si hay texto ya extraido (PDF nativo o parcial), aplicamos fallback local
            # para no dejar la factura bloqueada por dependencia externa de IA.
            if text and text.strip():
                try:
                    fallback_text = text
                    # En muchos PDFs el emisor (logo/cabecera) no viene en el texto embebido.
                    # Intentamos OCR solo de cabecera para capturar proveedor real.
                    if not is_image:
                        try:
                            header_text = _ocr_pdf_header(
                                invoice.file_path,
                                ai_client,
                                dpi=400,
                                timeout_seconds=header_ocr_timeout,
                            )
                            if header_text and header_text.strip():
                                fallback_text = f"{header_text}\n{text}"
                        except Exception as exc:
                            logger.warning(
                                "OCR cabecera fallback no disponible en invoice id=%s: %s",
                                invoice.id,
                                exc,
                            )

                    raw_json = ocr_service.parse_invoice_fields(fallback_text)
                    # En fallback local usamos directamente el parser heuristico;
                    # evita que la normalizacion vuelva a "adivinar" campos del header.
                    extraction = InvoiceExtractionData.model_validate(raw_json)
                    meta = build_extraction_meta()
                    meta["started_at"] = start.isoformat()
                    meta["finished_at"] = datetime.now(timezone.utc).isoformat()
                    meta["extraction_mode"] = "fallback_local"
                    meta["ai_unavailable"] = True
                    apply_extraction(
                        session=session,
                        invoice=invoice,
                        extraction=extraction,
                        raw_text=fallback_text,
                        raw_json=raw_json,
                        meta=meta,
                    )
                    return
                except Exception:
                    logger.exception(
                        "Fallo en fallback local de extraccion para invoice id=%s",
                        invoice.id,
                    )
            _set_ai_down(client)
            if self.request.retries >= self.max_retries:
                mark_extraction_failed(
                    session=session,
                    invoice=invoice,
                    error_message="Servicio de extraccion no disponible tras varios reintentos.",
                )
                return
            raise
        except AIInvalidResponseError as exc:
            mark_extraction_failed(session=session, invoice=invoice, error_message=str(exc))
        except Exception as exc:
            mark_extraction_failed(session=session, invoice=invoice, error_message=str(exc))


@celery_app.task(name="app.workers.tasks.invoices.send_due_reminders")
def send_due_reminders() -> None:
    today = date.today()
    thresholds = {
        20: NotificationType.DUE_20,
        10: NotificationType.DUE_10,
        5: NotificationType.DUE_5,
        1: NotificationType.DUE_1,
    }
    max_due_days = max(max(thresholds.keys()), int(settings.reminders_daily_threshold or 0))
    max_due_date = today + timedelta(days=max_due_days)
    batch_size = max(100, int(settings.invoice_reminders_batch_size or 1000))

    with Session(engine) as session:
        last_id = 0
        while True:
            statement = (
                select(Invoice)
                .where(
                    Invoice.id > last_id,
                    Invoice.due_date.is_not(None),
                    Invoice.due_date >= today,
                    Invoice.due_date <= max_due_date,
                    Invoice.status != InvoiceStatus.PAID,
                )
                .order_by(Invoice.id.asc())
                .limit(batch_size)
            )
            invoices = session.exec(statement).all()
            if not invoices:
                break

            for invoice in invoices:
                if not invoice.due_date:
                    continue
                days_until = (invoice.due_date - today).days
                if days_until < 0:
                    continue

                reminder_type = thresholds.get(days_until)
                if reminder_type:
                    _send_reminder_if_needed(session, invoice, reminder_type, today, days_until)

                if settings.reminders_daily_enabled and days_until <= settings.reminders_daily_threshold:
                    _send_reminder_if_needed(
                        session,
                        invoice,
                        NotificationType.DUE_DAILY,
                        today,
                        days_until,
                    )
            last_id = invoices[-1].id or last_id


def _send_reminder_if_needed(
    session: Session,
    invoice: Invoice,
    reminder_type: NotificationType,
    scheduled_for: date,
    days_until: int,
) -> None:
    exists = session.exec(
        select(NotificationLog).where(
            NotificationLog.tenant_id == invoice.tenant_id,
            NotificationLog.invoice_id == invoice.id,
            NotificationLog.notification_type == reminder_type,
            NotificationLog.scheduled_for == scheduled_for,
        )
    ).one_or_none()
    if exists:
        return

    recipient = session.get(User, invoice.created_by_id)
    recipient_email = recipient.email if recipient else None
    recipients = _get_due_recipients(recipient_email, reminder_type)
    if not recipients:
        return

    try:
        send_invoice_due_reminder_email(recipients, invoice, days_until=days_until)
    except Exception as exc:
        logger.exception("Error enviando recordatorio de factura: %s", exc)
        return

    log_entry = NotificationLog(
        tenant_id=invoice.tenant_id,
        invoice_id=invoice.id,
        notification_type=reminder_type,
        recipient_email=recipients[0] if recipients else None,
        scheduled_for=scheduled_for,
    )
    session.add(log_entry)
    session.commit()

    log_invoice_event(
        session=session,
        tenant_id=invoice.tenant_id,
        invoice_id=invoice.id,
        user_id=None,
        event_type=InvoiceEventType.REMINDER_SENT,
        payload={"type": reminder_type, "date": scheduled_for.isoformat()},
    )


@celery_app.task(name="app.workers.tasks.invoices.send_invoice_created_notification")
def send_invoice_created_notification(invoice_id: int) -> None:
    with Session(engine) as session:
        invoice = session.get(Invoice, invoice_id)
        if not invoice:
            return

        scheduled_for = invoice.created_at.date() if invoice.created_at else date.today()
        exists = session.exec(
            select(NotificationLog).where(
                NotificationLog.tenant_id == invoice.tenant_id,
                NotificationLog.invoice_id == invoice.id,
                NotificationLog.notification_type == NotificationType.CREATED,
                NotificationLog.scheduled_for == scheduled_for,
            )
        ).one_or_none()
        if exists:
            return

        recipient = session.get(User, invoice.created_by_id)
        recipient_email = recipient.email if recipient else None
        recipients = _get_created_recipients(recipient_email)
        if not recipients:
            return

        try:
            send_invoice_created_email(recipients, invoice)
        except Exception as exc:
            logger.exception("Error enviando correo de factura registrada: %s", exc)
            return

        log_entry = NotificationLog(
            tenant_id=invoice.tenant_id,
            invoice_id=invoice.id,
            notification_type=NotificationType.CREATED,
            recipient_email=recipients[0] if recipients else None,
            scheduled_for=scheduled_for,
        )
        session.add(log_entry)
        session.commit()

        log_invoice_event(
            session=session,
            tenant_id=invoice.tenant_id,
            invoice_id=invoice.id,
            user_id=None,
            event_type=InvoiceEventType.REMINDER_SENT,
            payload={"type": NotificationType.CREATED, "date": scheduled_for.isoformat()},
        )

