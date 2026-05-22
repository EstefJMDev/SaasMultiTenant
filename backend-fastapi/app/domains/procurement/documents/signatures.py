from __future__ import annotations

import io
import logging
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, select

from app.platform.contracts_core.models import (
    Contract,
    ContractDocument,
    ContractDocumentType,
    ContractNotificationEvent,
    ContractNotificationLog,
    ContractOffer,
    ContractStatus,
    ComparativeStatus,
    SignatureRequest,
    SignatureStatus,
    Supplier,
    SupplierInvitation,
    SupplierStatus,
)
from app.platform.contracts_core.permissions import (
    _is_tenant_admin,
    can_edit_contract,
    can_write_comparative,
    ensure_tenant_access,
)
from app.core.config import settings
from app.domains.procurement.contracts import crud as contract_crud
from app.domains.procurement.contracts.crud import _get_contract_or_404
from app.domains.procurement.contracts.validators import (
    is_valid_email,
    normalize_email,
    normalize_tax_id,
)
from app.core.email import _send_email
from app.domains.procurement.documents import pdf as documents_pdf
from app.workers.tasks.contracts import send_contract_notification
from app.domains.procurement.workflow import notifications as workflow_notifications
from app.storage.local import (
    build_contract_base_path,
    ensure_upload_extension,
    save_signed_contract_upload,
)
from app.models.user import User

logger = logging.getLogger("app.platform.contracts_core")

MAX_SIGNED_CONTRACT_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _contract_status_supported(session: Session, enum_label: str) -> bool:
    """Comprueba de forma defensiva si el enum de DB admite un estado dado."""
    try:
        udt_name_stmt = text(
            """
            SELECT udt_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'contract'
              AND column_name = 'status'
            LIMIT 1
            """
        )
        udt_row = session.exec(udt_name_stmt).one_or_none()
        if not udt_row:
            # Si no podemos resolver metadata, no bloqueamos el flujo.
            return True
        try:
            udt_name = udt_row[0]
        except (TypeError, IndexError):
            udt_name = udt_row

        enum_exists_stmt = text(
            """
            SELECT 1
            FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE t.typname = :enum_name
              AND e.enumlabel = :enum_label
            LIMIT 1
            """
        ).bindparams(enum_name=str(udt_name), enum_label=enum_label)
        return session.exec(enum_exists_stmt).one_or_none() is not None
    except Exception as exc:
        logger.warning(
            "No se pudo verificar compatibilidad de estado de contrato (%s): %s",
            enum_label,
            exc,
        )
        return True


def _create_supplier_invitation(
    session: Session,
    *,
    supplier: Supplier,
    contract: Optional[Contract],
    email: Optional[str],
) -> Optional[SupplierInvitation]:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    ttl_days = max(1, int(settings.supplier_onboarding_ttl_days))
    invitation = SupplierInvitation(
        tenant_id=supplier.tenant_id,
        supplier_id=supplier.id,  # type: ignore[arg-type]
        contract_id=contract.id if contract else None,
        email=email,
        token=token,
        created_at=now,
        expires_at=now + timedelta(days=ttl_days),
    )
    session.add(invitation)
    session.commit()
    session.refresh(invitation)

    frontend_url = settings.frontend_base_url
    if frontend_url and email:
        onboarding_url = _build_supplier_onboarding_url(token)
        subject, body = _build_supplier_email(
            contract=contract,
            onboarding_url=onboarding_url,
            expires_at=invitation.expires_at,
        )
        try:
            _send_email([email], subject, body)
        except Exception as exc:
            logger.warning(
                "No se pudo enviar email de onboarding supplier_id=%s contract_id=%s: %s",
                supplier.id,
                contract.id if contract else None,
                exc,
            )

    return invitation


def _build_supplier_onboarding_url(token: str) -> str:
    base = (settings.frontend_base_url or "").strip()
    if not base:
        base = "http://localhost:5173"
    route = "supplier-onboarding"
    query = f"token={token}"
    if "#/" in base:
        prefix, _ = base.split("#/", 1)
        return f"{prefix.rstrip('/')}/#/{route}?{query}"
    return f"{base.rstrip('/')}/#/{route}?{query}"


def _get_saludo() -> str:
    hour = datetime.now().hour
    if 6 <= hour <= 12:
        return "Buenos días"
    if 13 <= hour <= 21:
        return "Buenas tardes"
    return "Buenos días"


_SUBCONTRATA_DOCS = (
    "- Escritura de poderes\n"
    "- DNI persona firmante\n"
    "- REA actualizado\n"
    "- Certificado negativo de Hacienda\n"
    "- Certificado de estar al corriente de pago en la Seguridad Social"
)

_SUMINISTRO_SERVICIO_DOCS = (
    "- Datos Empresa\n"
    "- DNI persona firmante\n"
    "- Escritura de poderes"
)


def _build_supplier_email(
    *,
    contract: Optional[Contract],
    onboarding_url: str,
    expires_at: Optional[datetime] = None,
    missing_fields: Optional[list[str]] = None,
) -> tuple[str, str]:
    """Construye (subject, body) del email al proveedor, con saludo por hora
    y plantilla según el tipo de contrato (subcontratación, suministro/servicio).
    Fallback genérico cuando no hay contrato o tipo conocido.
    """
    from app.platform.contracts_core.models import ContractType

    saludo = _get_saludo()
    obra = (contract.title if contract and contract.title else (str(contract.id) if contract else "")) or ""
    expires_line = ""
    if expires_at is not None:
        try:
            expires_line = f"\n\nEl enlace caduca el {expires_at.date().isoformat()}."
        except Exception:
            expires_line = ""

    ctype = getattr(contract, "type", None) if contract else None

    if ctype == ContractType.SUBCONTRATACION:
        subject = f"Solicitud de documentación — contrato de subcontratación {obra}".strip()
        body = (
            f"{saludo},\n\n"
            f"Para poder confeccionarles el contrato de subcontratación de la obra {obra}, "
            f"les solicitamos nos envíen la siguiente documentación, a la mayor brevedad posible:\n\n"
            f"{_SUBCONTRATA_DOCS}\n\n"
            f"A través de este enlace:\n"
            f"{onboarding_url}\n\n"
            f"Cualquier consulta o aclaración no duden en ponerse en contacto con nosotros.\n\n"
            f"Un saludo."
            f"{expires_line}"
        )
        return subject, body

    if ctype in (ContractType.SUMINISTRO, ContractType.SERVICIO):
        subject = f"Solicitud de documentación — contrato {obra}".strip()
        body = (
            f"{saludo},\n\n"
            f"Para poder confeccionarles el contrato de la obra {obra}, "
            f"les solicitamos nos envíen la siguiente documentación, a la mayor brevedad posible:\n\n"
            f"{_SUMINISTRO_SERVICIO_DOCS}\n\n"
            f"A través de este enlace:\n"
            f"{onboarding_url}\n\n"
            f"Cualquier consulta o aclaración no duden en ponerse en contacto con nosotros.\n\n"
            f"Un saludo."
            f"{expires_line}"
        )
        return subject, body

    fields_text = ""
    if missing_fields:
        fields_text = "\n".join(f"- {f}" for f in missing_fields) + "\n\n"
    subject = f"Solicitud de datos para contrato — {obra}".strip() if obra else "Completar datos del proveedor"
    body = (
        f"{saludo},\n\n"
        f"Para completar la formalización del contrato necesitamos que nos faciliten los datos pendientes del proveedor.\n\n"
        f"{fields_text}"
        f"A través de este enlace:\n"
        f"{onboarding_url}\n\n"
        f"Cualquier consulta o aclaración no duden en ponerse en contacto con nosotros.\n\n"
        f"Un saludo."
        f"{expires_line}"
    )
    return subject, body


def _find_active_supplier_invitation(
    session: Session,
    *,
    tenant_id: int,
    supplier_id: int,
    contract_id: Optional[int],
) -> Optional[SupplierInvitation]:
    now = datetime.now(timezone.utc)
    statement = (
        select(SupplierInvitation)
        .where(
            SupplierInvitation.tenant_id == tenant_id,
            SupplierInvitation.supplier_id == supplier_id,
            SupplierInvitation.contract_id == contract_id,
            SupplierInvitation.used_at.is_(None),
            SupplierInvitation.expires_at > now,
        )
        .order_by(SupplierInvitation.created_at.desc())
    )
    return session.exec(statement).first()


def start_supplier_invitation(
    session: Session,
    *,
    contract: Contract,
    missing_fields: list[str],
) -> Optional[SupplierInvitation]:
    from app.domains.procurement.suppliers import get_supplier_by_tax_id

    supplier: Optional[Supplier] = None
    if contract.supplier_id:
        supplier = session.get(Supplier, contract.supplier_id)
    if not supplier and contract.supplier_tax_id:
        supplier = get_supplier_by_tax_id(
            session,
            tenant_id=contract.tenant_id,
            tax_id=contract.supplier_tax_id,
        )

    if not supplier:
        if not contract.supplier_tax_id:
            contract.status = ContractStatus.PENDING_JEFE_OBRA
            contract.updated_at = datetime.now(timezone.utc)
            session.add(contract)
            contract_crud._log_event(
                session,
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                user_id=None,
                event_type="contract.supplier_data_missing",
                payload={"missing_fields": missing_fields},
            )
            return None
        supplier = Supplier(
            tenant_id=contract.tenant_id,
            created_by_id=contract.created_by_id,
            tax_id=contract.supplier_tax_id,
            name=contract.supplier_name,
            email=contract.supplier_email,
            phone=contract.supplier_phone,
            address=contract.supplier_address,
            city=contract.supplier_city,
            postal_code=contract.supplier_postal_code,
            country=contract.supplier_country,
            contact_name=contract.supplier_contact_name,
            bank_iban=contract.supplier_bank_iban,
            bank_bic=contract.supplier_bank_bic,
            status=SupplierStatus.PENDING,
            updated_at=datetime.now(timezone.utc),
        )
        session.add(supplier)
        session.commit()
        session.refresh(supplier)

    if contract.supplier_id != supplier.id:
        contract.supplier_id = supplier.id

    supplier_email = (contract.supplier_email or supplier.email or "").strip().lower() or None
    invitation = _find_active_supplier_invitation(
        session,
        tenant_id=contract.tenant_id,
        supplier_id=supplier.id,
        contract_id=contract.id,
    )
    if invitation is None:
        invitation = _create_supplier_invitation(
            session,
            supplier=supplier,
            contract=contract,
            email=None,  # Enviamos email custom abajo incluyendo campos faltantes.
        )

    if supplier_email and invitation:
        onboarding_url = _build_supplier_onboarding_url(invitation.token)
        subject, body = _build_supplier_email(
            contract=contract,
            onboarding_url=onboarding_url,
            expires_at=invitation.expires_at,
            missing_fields=missing_fields,
        )
        try:
            _send_email([supplier_email], subject, body)
        except Exception as exc:
            logger.warning(
                "No se pudo enviar email de proveedor contract_id=%s email=%s: %s",
                contract.id,
                supplier_email,
                exc,
            )
        # Best-effort: no romper el flujo si la tabla de logs tiene secuencia desajustada.
        try:
            with session.begin_nested():
                already_logged = session.exec(
                    select(ContractNotificationLog).where(
                        ContractNotificationLog.tenant_id == contract.tenant_id,
                        ContractNotificationLog.contract_id == contract.id,
                        ContractNotificationLog.event_type == ContractNotificationEvent.DOCS_GENERATED,
                        ContractNotificationLog.recipient_email == supplier_email,
                    )
                ).one_or_none()
                if not already_logged:
                    session.add(
                        ContractNotificationLog(
                            tenant_id=contract.tenant_id,
                            contract_id=contract.id,
                            event_type=ContractNotificationEvent.DOCS_GENERATED,
                            recipient_email=supplier_email,
                        )
                    )
        except Exception as exc:
            logger.warning(
                "No se pudo registrar contract_notification_log contract_id=%s email=%s: %s",
                contract.id,
                supplier_email,
                exc,
            )

    contract.status = ContractStatus.PENDING_JEFE_OBRA
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        user_id=None,
        event_type="contract.supplier_data_requested",
        payload={"missing_fields": missing_fields, "invitation_id": invitation.id if invitation else None},
    )
    workflow_notifications._enqueue_contract_notification(
        ContractNotificationEvent.DOCS_GENERATED,
        contract.id,
    )
    return invitation


def generate_supplier_onboarding_link(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    supplier_tax_id: Optional[str] = None,
    supplier_email: Optional[str] = None,
) -> dict[str, Any]:
    from app.domains.procurement.suppliers import (
        get_supplier_by_tax_id,
        validate_supplier_email_if_present,
    )

    ensure_tenant_access(user, tenant_id)
    # Crear token de onboarding de proveedor permite reasignar supplier_tax_id
    # y supplier_email del contrato. Restringido a admin (super/tenant) o a
    # usuarios con capacidad explícita de escritura sobre el comparativo.
    admin_bypass = user.is_super_admin or _is_tenant_admin(session, user)
    if not (admin_bypass or can_write_comparative(session, user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    normalized_override_tax_id = normalize_tax_id(supplier_tax_id)
    normalized_override_email = normalize_email(supplier_email)
    if normalized_override_tax_id and contract.supplier_tax_id != normalized_override_tax_id:
        contract.supplier_tax_id = normalized_override_tax_id
        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)
        session.commit()
        session.refresh(contract)
    if normalized_override_email:
        validate_supplier_email_if_present(normalized_override_email)
        if contract.supplier_email != normalized_override_email:
            contract.supplier_email = normalized_override_email
            contract.updated_at = datetime.now(timezone.utc)
            session.add(contract)
            session.commit()
            session.refresh(contract)
    # Re-sincroniza datos de proveedor desde oferta seleccionada/proveedor maestro
    # para evitar falsos 400 cuando el formulario aun no persistio todos los campos.
    contract_crud.ensure_supplier_snapshot(session, contract=contract)
    session.add(contract)
    session.commit()
    session.refresh(contract)

    # Recuperacion defensiva de CIF cuando el contrato todavia no lo refleja,
    # pero ya existe en oferta seleccionada / comparativo / ofertas del contrato.
    if not contract.supplier_tax_id:
        recovered_tax_id: Optional[str] = None

        if contract.selected_offer_id:
            selected_offer = session.exec(
                select(ContractOffer).where(
                    ContractOffer.id == contract.selected_offer_id,
                    ContractOffer.tenant_id == tenant_id,
                    ContractOffer.contract_id == contract.id,
                )
            ).one_or_none()
            if selected_offer and selected_offer.supplier_tax_id:
                recovered_tax_id = selected_offer.supplier_tax_id

        comparative_data = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
        selected_offer_id = comparative_data.get("selected_offer_id")
        if not recovered_tax_id and isinstance(selected_offer_id, int):
            selected_offer = session.exec(
                select(ContractOffer).where(
                    ContractOffer.id == selected_offer_id,
                    ContractOffer.tenant_id == tenant_id,
                    ContractOffer.contract_id == contract.id,
                )
            ).one_or_none()
            if selected_offer and selected_offer.supplier_tax_id:
                recovered_tax_id = selected_offer.supplier_tax_id

        if not recovered_tax_id:
            fallback_offer = session.exec(
                select(ContractOffer)
                .where(
                    ContractOffer.tenant_id == tenant_id,
                    ContractOffer.contract_id == contract.id,
                    ContractOffer.supplier_tax_id.is_not(None),
                )
                .order_by(ContractOffer.created_at.desc())
            ).first()
            if fallback_offer and fallback_offer.supplier_tax_id:
                recovered_tax_id = fallback_offer.supplier_tax_id

        normalized_recovered = normalize_tax_id(recovered_tax_id)
        if normalized_recovered:
            contract.supplier_tax_id = normalized_recovered
            contract.updated_at = datetime.now(timezone.utc)
            session.add(contract)
            session.commit()
            session.refresh(contract)

    supplier: Optional[Supplier] = None
    if contract.supplier_id:
        supplier = session.get(Supplier, contract.supplier_id)
    if not supplier and contract.supplier_tax_id:
        supplier = get_supplier_by_tax_id(
            session,
            tenant_id=tenant_id,
            tax_id=contract.supplier_tax_id,
        )

    if not supplier:
        if not contract.supplier_tax_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Falta NIF/CIF del proveedor para generar invitacion. "
                    "Actualiza supplier_tax_id en el contrato o selecciona una oferta con CIF."
                ),
            )
        supplier = Supplier(
            tenant_id=tenant_id,
            created_by_id=user.id,
            tax_id=contract.supplier_tax_id,
            name=contract.supplier_name,
            email=contract.supplier_email,
            phone=contract.supplier_phone,
            address=contract.supplier_address,
            city=contract.supplier_city,
            postal_code=contract.supplier_postal_code,
            country=contract.supplier_country,
            contact_name=contract.supplier_contact_name,
            bank_iban=contract.supplier_bank_iban,
            bank_bic=contract.supplier_bank_bic,
            status=SupplierStatus.PENDING,
            updated_at=datetime.now(timezone.utc),
        )
        session.add(supplier)
        session.commit()
        session.refresh(supplier)

    if contract.supplier_id != supplier.id:
        contract.supplier_id = supplier.id
        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)
        session.commit()
        session.refresh(contract)

    if normalized_override_email and supplier.email != normalized_override_email:
        supplier.email = normalized_override_email
        supplier.updated_at = datetime.now(timezone.utc)
        session.add(supplier)
        session.commit()
        session.refresh(supplier)

    recipient_email = (
        normalized_override_email
        or (contract.supplier_email or supplier.email or "").strip().lower()
        or None
    )

    invitation = _create_supplier_invitation(
        session,
        supplier=supplier,
        contract=contract,
        email=None,
    )
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo generar la invitacion del proveedor.",
        )

    if recipient_email:
        invitation.email = recipient_email
        session.add(invitation)
        session.commit()
        session.refresh(invitation)

    email_sent = False
    if is_valid_email(recipient_email):
        onboarding_url = _build_supplier_onboarding_url(invitation.token)
        subject, body = _build_supplier_email(
            contract=contract,
            onboarding_url=onboarding_url,
            expires_at=invitation.expires_at,
        )
        email_sent = _send_email([recipient_email], subject, body)
        if not email_sent:
            logger.warning(
                "No se pudo reenviar enlace de onboarding contract_id=%s email=%s",
                contract.id,
                recipient_email,
            )

    return {
        "token": invitation.token,
        "url": _build_supplier_onboarding_url(invitation.token),
        "expires_at": invitation.expires_at,
        "recipient_email": recipient_email,
        "email_sent": email_sent,
    }


def validate_supplier_onboarding(
    session: Session,
    *,
    token: str,
) -> SupplierInvitation:
    invitation = session.exec(
        select(SupplierInvitation).where(SupplierInvitation.token == token),
    ).one_or_none()
    if not invitation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token no valido.")
    if invitation.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitacion ya utilizada.")
    if _as_utc(invitation.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitacion caducada.")
    return invitation


def submit_supplier_onboarding(
    session: Session,
    *,
    token: str,
    payload: dict,
) -> Supplier:
    from app.domains.invoices.ocr import service as ocr_service
    from app.domains.procurement.suppliers import (
        normalize_tax_id,
        sync_contract_from_supplier,
    )

    invitation = validate_supplier_onboarding(session, token=token)
    supplier = session.get(Supplier, invitation.supplier_id)
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado.")

    def _norm(value: object) -> Optional[str]:
        if value is None:
            return None
        text_value = str(value).strip()
        return text_value or None

    razon_social = _norm(payload.get("razon_social"))
    empresa = _norm(payload.get("empresa"))
    cif = normalize_tax_id(payload.get("cif"))
    nombre_gerente = _norm(payload.get("nombre_gerente"))
    nif_gerente = _norm(payload.get("nif_gerente"))
    direccion_empresa = _norm(payload.get("direccion_empresa"))
    tipo_escritura = _norm(payload.get("tipo_escritura"))
    fecha_escritura = _norm(payload.get("fecha_escritura"))
    nombre_notario = _norm(payload.get("nombre_notario"))
    num_protocolo = _norm(payload.get("num_protocolo"))

    if razon_social:
        supplier.name = razon_social
    elif empresa and not supplier.name:
        supplier.name = empresa
    if cif:
        # Normalizamos para mantener consistencia con get_supplier_by_tax_id
        # y evitar que el mismo CIF tecleado con/sin guiones genere lookups fallidos.
        supplier.tax_id = normalize_tax_id(cif)
    if nombre_gerente:
        supplier.contact_name = nombre_gerente
        supplier.legal_rep_name = nombre_gerente
    if nif_gerente:
        supplier.legal_rep_dni = nif_gerente
    if direccion_empresa:
        supplier.address = direccion_empresa
        parsed = ocr_service.parse_spanish_address(direccion_empresa)
        supplier.city = parsed.get("city") or supplier.city
        supplier.postal_code = parsed.get("postal_code") or supplier.postal_code
        supplier.country = parsed.get("country") or supplier.country

    supplier.status = SupplierStatus.ACTIVE
    supplier.updated_at = datetime.now(timezone.utc)
    session.add(supplier)
    session.commit()
    session.refresh(supplier)
    invitation_should_be_used = True

    if invitation.contract_id:
        contract = session.get(Contract, invitation.contract_id)
        if contract and contract.tenant_id == supplier.tenant_id:
            if razon_social:
                contract.supplier_name = razon_social
            elif empresa and not contract.supplier_name:
                contract.supplier_name = empresa
            if cif:
                contract.supplier_tax_id = cif
            if nombre_gerente:
                contract.supplier_contact_name = nombre_gerente
                contract.supplier_legal_rep_name = nombre_gerente
            if nif_gerente:
                contract.supplier_legal_rep_dni = nif_gerente
            if direccion_empresa:
                contract.supplier_address = direccion_empresa
                parsed = ocr_service.parse_spanish_address(direccion_empresa)
                contract.supplier_city = parsed.get("city") or contract.supplier_city
                contract.supplier_postal_code = parsed.get("postal_code") or contract.supplier_postal_code
                contract.supplier_country = parsed.get("country") or contract.supplier_country

            contract_data = dict(contract.contract_data or {})
            manager = dict(contract_data.get("manager") or {})
            legal = dict(contract_data.get("legal") or {})
            if nombre_gerente:
                manager["nombre_gerente"] = nombre_gerente
            if nif_gerente:
                manager["nif_gerente"] = nif_gerente
            if tipo_escritura:
                legal["tipo_escritura"] = tipo_escritura
            if fecha_escritura:
                legal["fecha_escritura"] = fecha_escritura
            if nombre_notario:
                legal["nombre_notario"] = nombre_notario
            if num_protocolo:
                legal["num_protocolo"] = num_protocolo
            contract_data["manager"] = manager
            contract_data["legal"] = legal
            contract.contract_data = contract_data

            contract.supplier_id = supplier.id
            sync_contract_from_supplier(contract, supplier)
            # Si el comparativo se envió pero el proveedor no estaba en BD,
            # al completar onboarding NO enviamos directamente a Gerencia: el
            # jefe de obra debe revisar los datos capturados y enviar manualmente.
            # Marcamos un flag para que el frontend muestre el aviso de revisión.
            resume_comparative_to_mgmt = (
                contract.status == ContractStatus.PENDING_SUPPLIER
                and contract.comparative_status
                in {ComparativeStatus.DRAFT, ComparativeStatus.NEEDS_CHANGES}
            )
            if resume_comparative_to_mgmt:
                # Desbloqueamos el contrato (vuelve a DRAFT) y dejamos el
                # comparative_status como estaba (DRAFT/NEEDS_CHANGES) para
                # que el jefe de obra pueda revisarlo y enviarlo.
                contract.status = ContractStatus.DRAFT
                cd = dict(contract.comparative_data or {})
                cd["pending_jefe_review_after_supplier"] = True
                cd["supplier_data_captured_at"] = datetime.now(timezone.utc).isoformat()
                contract.comparative_data = cd
                from sqlalchemy.orm.attributes import flag_modified as _flag_modified
                _flag_modified(contract, "comparative_data")
            # Si el comparativo ya fue aprobado, al completar onboarding debemos
            # reanudar el flujo en selección de plantilla (FASE 4), no volver a
            # dejar el contrato anclado en PENDING_JEFE_OBRA.
            if (
                contract.comparative_status == ComparativeStatus.APPROVED
                and contract.status in {
                    ContractStatus.DRAFT,
                    ContractStatus.PENDING_JEFE_OBRA,
                    ContractStatus.PENDING_SUPPLIER,
                }
            ):
                if _contract_status_supported(session, ContractStatus.PENDING_TEMPLATE.value):
                    contract.status = ContractStatus.PENDING_TEMPLATE
                else:
                    logger.warning(
                        "Estado PENDING_TEMPLATE no soportado por enum DB; "
                        "se mantiene estado actual contract_id=%s",
                        contract.id,
                    )
                cd_capture = dict(contract.comparative_data or {})
                cd_capture["supplier_data_captured_at"] = datetime.now(timezone.utc).isoformat()
                contract.comparative_data = cd_capture
                from sqlalchemy.orm.attributes import flag_modified as _flag_modified
                _flag_modified(contract, "comparative_data")
            contract.updated_at = datetime.now(timezone.utc)
            try:
                session.add(contract)
                session.commit()
            except SQLAlchemyError as exc:
                session.rollback()
                logger.warning(
                    "No se pudieron persistir cambios de contrato tras onboarding contract_id=%s: %s",
                    contract.id,
                    exc,
                )
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=(
                        "No se pudieron guardar los datos del contrato tras completar onboarding. "
                        "Intenta de nuevo en unos segundos."
                    ),
                ) from exc

            from app.domains.procurement.documents.generator import create_documents_for_contract

            try:
                create_documents_for_contract(
                    session,
                    contract=contract,
                    created_by_id=None,
                )
            except Exception as exc:
                session.rollback()
                logger.warning(
                    "No se pudieron generar documentos al completar onboarding contract_id=%s: %s",
                    contract.id,
                    exc,
                )
                # Persistimos al menos el cambio de estado/datos del contrato
                # para no bloquear el flujo del proveedor por errores auxiliares.
                contract.updated_at = datetime.now(timezone.utc)
                session.add(contract)
                session.commit()
                session.refresh(contract)

            contract_crud._log_event(
                session,
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                user_id=None,
                event_type="contract.supplier_completed",
            )
            try:
                send_contract_notification.delay(
                    event=ContractNotificationEvent.DOCS_GENERATED,
                    contract_id=contract.id,
                )
            except Exception as exc:
                logger.warning(
                    "No se pudo encolar notificacion DOCS_GENERATED tras onboarding contract_id=%s: %s",
                    contract.id,
                    exc,
                )
            # No notificamos SENT_TO_GERENCIA aqui: el jefe de obra debe revisar
            # los datos capturados y enviar manualmente desde la UI.
    if invitation_should_be_used:
        invitation.used_at = datetime.now(timezone.utc)
        session.add(invitation)
        session.commit()

    return supplier


def create_signature_request(session: Session, *, contract: Contract) -> SignatureRequest:
    now = datetime.now(timezone.utc)
    existing = session.exec(
        select(SignatureRequest).where(
            SignatureRequest.contract_id == contract.id,
            SignatureRequest.tenant_id == contract.tenant_id,
            SignatureRequest.status == SignatureStatus.SENT,
        )
    ).one_or_none()
    if existing and _as_utc(existing.expires_at) > now:
        return existing

    token = uuid4().hex
    expires_at = now + timedelta(hours=settings.signature_request_ttl_hours)
    request = SignatureRequest(
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        token=token,
        expires_at=expires_at,
        status=SignatureStatus.SENT,
        recipient_email=contract.supplier_email,
    )
    session.add(request)
    session.commit()
    session.refresh(request)
    return request


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
    signature = session.exec(
        select(SignatureRequest).where(SignatureRequest.token == token)
    ).one_or_none()
    if not signature:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token no valido")

    if signature.status == SignatureStatus.SIGNED:
        return signature

    if _as_utc(signature.expires_at) < datetime.now(timezone.utc):
        signature.status = SignatureStatus.EXPIRED
        session.add(signature)
        session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token expirado")

    if not accepted_terms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes aceptar los terminos para firmar el contrato.",
        )

    normalized_name = (signer_name or "").strip()
    if not normalized_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del firmante es obligatorio.",
        )

    contract = session.get(Contract, signature.contract_id)
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contrato no encontrado")

    signed_file_path = None
    if upload:
        ensure_upload_extension(
            upload.filename,
            allowed_extensions={"pdf"},
            detail="El contrato firmado debe subirse en formato PDF.",
        )
        signed_file_path = save_signed_contract_upload(
            upload,
            contract.tenant_id,
            contract.id,
            max_size_bytes=MAX_SIGNED_CONTRACT_UPLOAD_BYTES,
        )
    else:
        signed_file_path = _generate_signed_contract_from_token_data(
            session,
            contract=contract,
            signer_name=normalized_name,
            signer_identifier=signer_identifier,
            signer_email=signer_email,
            signer_company=signer_company,
            signer_ip=signer_ip,
            signer_user_agent=signer_user_agent,
            signature_image=signature_image,
        )
    if signed_file_path:
        signature.signed_file_path = str(signed_file_path)
        doc = ContractDocument(
            tenant_id=contract.tenant_id,
            contract_id=contract.id,
            doc_type=ContractDocumentType.SIGNED,
            path=str(signed_file_path),
            created_by_id=None,
        )
        session.add(doc)

    signature.status = SignatureStatus.SIGNED
    signature.signed_at = datetime.now(timezone.utc)
    signature.signed_ip = signer_ip
    session.add(signature)

    contract.status = ContractStatus.SIGNED
    contract.signed_at = signature.signed_at
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)

    session.commit()
    session.refresh(signature)

    contract_crud._log_event(
        session,
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        user_id=None,
        event_type="contract.signed",
        payload={
            "signer_name": normalized_name,
            "signer_identifier": (signer_identifier or "").strip() or None,
            "signer_email": (signer_email or "").strip().lower() or None,
            "signer_company": (signer_company or "").strip() or None,
            "accepted_terms": True,
            "signed_ip": signer_ip,
            "signed_user_agent": (signer_user_agent or "").strip() or None,
            "signed_file_path": str(signed_file_path) if signed_file_path else None,
            "signed_at": signature.signed_at.isoformat() if signature.signed_at else None,
        },
    )

    send_contract_notification.delay(
        event=ContractNotificationEvent.SIGNED,
        contract_id=contract.id,
    )

    return signature


def validate_signature_token(
    session: Session,
    *,
    token: str,
) -> SignatureRequest:
    signature = session.exec(
        select(SignatureRequest).where(SignatureRequest.token == token)
    ).one_or_none()
    if not signature:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token no valido")

    if signature.status == SignatureStatus.SIGNED:
        return signature

    if _as_utc(signature.expires_at) < datetime.now(timezone.utc):
        signature.status = SignatureStatus.EXPIRED
        session.add(signature)
        session.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Token expirado")

    return signature


def get_contract_pdf_by_signature_token(
    session: Session,
    *,
    token: str,
) -> tuple[Path, str]:
    signature = validate_signature_token(session=session, token=token)
    contract = session.get(Contract, signature.contract_id)
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contrato no encontrado")

    contract_doc = session.exec(
        select(ContractDocument).where(
            ContractDocument.tenant_id == contract.tenant_id,
            ContractDocument.contract_id == contract.id,
            ContractDocument.doc_type == ContractDocumentType.CONTRACT,
        )
    ).first()
    if not contract_doc or not contract_doc.path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento de contrato no disponible.",
        )

    file_path = Path(contract_doc.path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo de contrato no encontrado en almacenamiento.",
        )

    filename = f"Contrato_CT_{contract.id}.pdf"
    return file_path, filename


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
    PdfReader, PdfWriter = documents_pdf.get_pypdf()
    A4, ImageReader, pdf_canvas = documents_pdf.get_reportlab()

    contract_doc = session.exec(
        select(ContractDocument).where(
            ContractDocument.tenant_id == contract.tenant_id,
            ContractDocument.contract_id == contract.id,
            ContractDocument.doc_type == ContractDocumentType.CONTRACT,
        )
    ).first()
    if not contract_doc or not contract_doc.path:
        return None

    source_pdf = Path(contract_doc.path)
    if not source_pdf.exists():
        return None

    base = build_contract_base_path(contract.tenant_id, contract.id) / "signed"
    base.mkdir(parents=True, exist_ok=True)
    output_pdf = base / f"signed_contract_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}.pdf"

    if PdfReader is None or PdfWriter is None or pdf_canvas is None:
        output_pdf.write_bytes(source_pdf.read_bytes())
        return output_pdf

    appendix_buffer = io.BytesIO()
    c = pdf_canvas.Canvas(appendix_buffer, pagesize=A4)
    width, height = A4
    left = 40
    y = height - 60
    c.setFont("Helvetica-Bold", 14)
    c.drawString(left, y, "EVIDENCIA DE FIRMA ELECTRONICA")
    y -= 28
    c.setFont("Helvetica", 10)
    rows = [
        f"Contrato: CT-{contract.id}",
        f"Firmante: {signer_name}",
        f"DNI/NIF: {(signer_identifier or '').strip() or '-'}",
        f"Email: {(signer_email or '').strip() or '-'}",
        f"Empresa: {(signer_company or '').strip() or '-'}",
        f"Fecha UTC: {datetime.now(timezone.utc).isoformat()}",
        f"IP: {(signer_ip or '').strip() or '-'}",
        f"User-Agent: {(signer_user_agent or '').strip() or '-'}",
    ]
    for row in rows:
        c.drawString(left, y, row[:160])
        y -= 16

    if signature_image and ImageReader is not None:
        try:
            signature_image.file.seek(0)
            img_data = signature_image.file.read()
            if img_data:
                img = ImageReader(io.BytesIO(img_data))
                c.setFont("Helvetica-Bold", 10)
                c.drawString(left, y - 10, "Trazo de firma:")
                c.drawImage(
                    img,
                    left,
                    y - 120,
                    width=220,
                    height=90,
                    preserveAspectRatio=True,
                    mask="auto",
                )
        except Exception:
            pass

    c.showPage()
    c.save()
    appendix_buffer.seek(0)

    writer = PdfWriter()
    source_reader = PdfReader(str(source_pdf))
    for page in source_reader.pages:
        writer.add_page(page)

    appendix_reader = PdfReader(appendix_buffer)
    for page in appendix_reader.pages:
        writer.add_page(page)

    with output_pdf.open("wb") as f:
        writer.write(f)
    return output_pdf


