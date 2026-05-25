from __future__ import annotations

import logging
from typing import Iterable, Optional

from sqlmodel import Session, select

from app.platform.contracts_core.models import Contract, ContractNotificationEvent, ContractNotificationLog
from app.core.email import _send_email
from app.models.notification import NotificationType
from app.models.role import Role
from app.models.user import User
from app.platform.notifications.service import create_notification

logger = logging.getLogger("app.platform.contracts_core")


ROLE_ALIASES = {
    # tenant_admin NO se notifica como Gerencia. Son admins del sistema, no
    # aprobadores funcionales. Si necesitan recibir notificaciones, se añaden
    # como recipient explícito por evento.
    "gerencia": {"gerencia", "gerente", "manager", "management"},
    "administracion": {"administracion", "admin", "administration"},
    "compras": {"compras", "purchase", "purchasing"},
    "juridico": {"juridico", "legal"},
    "jefe_obra": {"jefe_obra"},
}


CONTRACT_STATUS_LABELS_ES: dict[str, str] = {
    "DRAFT": "Borrador",
    "PENDING_TEMPLATE": "Pendiente de plantilla",
    "PENDING_DATA_VALIDATION": "Pendiente de validacion de datos",
    "PENDING_REVIEW": "Pendiente de revision",
    "FULLY_APPROVED": "Aprobado",
    "SENT_FOR_SIGNATURE": "Enviado a firma",
    "SIGNED": "Firmado",
    "REJECTED": "Rechazado",
    "PENDING_SUPPLIER": "Pendiente del proveedor",
    "PENDING_JEFE_OBRA": "Pendiente del Jefe de obra",
    "PENDING_GERENCIA": "Pendiente de Gerencia",
    "PENDING_DEPARTAMENTOS": "Pendiente de departamentos",
    "PENDING_ADMIN": "Pendiente de Administracion",
    "PENDING_COMPRAS": "Pendiente de Compras",
    "PENDING_JURIDICO": "Pendiente de Juridico",
    "IN_SIGNATURE": "En firma",
}


def _status_label_es(status) -> str:
    raw = getattr(status, "value", status)
    key = str(raw)
    return CONTRACT_STATUS_LABELS_ES.get(key, key)


def _merge_recipients(*groups: Iterable[str]) -> list[str]:
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


def _get_role_emails(session: Session, tenant_id: int, role_name: str) -> list[str]:
    aliases = ROLE_ALIASES.get(role_name, {role_name})
    roles = session.exec(select(Role).where(Role.name.in_(aliases))).all()
    if not roles:
        return []
    role_ids = [role.id for role in roles if role.id is not None]
    users = session.exec(
        select(User).where(
            User.tenant_id == tenant_id,
            User.role_id.in_(role_ids),
            User.is_active.is_(True),
        )
    ).all()
    return [user.email for user in users if user.email]


def _get_role_user_ids(session: Session, tenant_id: int, role_name: str) -> list[int]:
    aliases = ROLE_ALIASES.get(role_name, {role_name})
    roles = session.exec(select(Role).where(Role.name.in_(aliases))).all()
    if not roles:
        return []
    role_ids = [role.id for role in roles if role.id is not None]
    users = session.exec(
        select(User).where(
            User.tenant_id == tenant_id,
            User.role_id.in_(role_ids),
            User.is_active.is_(True),
        )
    ).all()
    return [user.id for user in users]


def get_department_recipients(session: Session, tenant_id: int) -> dict[str, list[str]]:
    return {
        "gerencia": _get_role_emails(session, tenant_id, "gerencia"),
        "administracion": _get_role_emails(session, tenant_id, "administracion"),
        "compras": _get_role_emails(session, tenant_id, "compras"),
        "juridico": _get_role_emails(session, tenant_id, "juridico"),
        "jefe_obra": _get_role_emails(session, tenant_id, "jefe_obra"),
    }


def get_comparative_approvers(session: Session, tenant_id: int) -> tuple[list[int], list[str]]:
    """Devuelve (user_ids, emails) de usuarios con permiso de aprobar comparativos.

    Combina:
      - Legacy: usuarios con rol `gerencia` (alias incluidos).
      - Nuevo: empleados con Position.can_approve_comparative=true.
    UNION sin duplicados.
    """
    from app.models.hr import EmployeeProfile, Position

    # Legacy via role
    legacy_ids = set(_get_role_user_ids(session, tenant_id, "gerencia"))

    # Nuevo via position
    position_user_ids = session.exec(
        select(EmployeeProfile.user_id)
        .join(Position, Position.id == EmployeeProfile.position_id)
        .where(
            EmployeeProfile.tenant_id == tenant_id,
            EmployeeProfile.is_active.is_(True),
            EmployeeProfile.user_id.is_not(None),
            Position.is_active.is_(True),
            Position.can_approve_comparative.is_(True),
        )
    ).all()
    position_ids = {uid for uid in position_user_ids if uid}

    all_ids = legacy_ids | position_ids
    if not all_ids:
        return [], []

    users = session.exec(
        select(User).where(
            User.id.in_(list(all_ids)),
            User.is_active.is_(True),
        )
    ).all()
    user_ids = [u.id for u in users if u.id]
    emails = [u.email for u in users if u.email]
    return user_ids, emails


def get_department_user_ids(session: Session, tenant_id: int) -> dict[str, list[int]]:
    return {
        "gerencia": _get_role_user_ids(session, tenant_id, "gerencia"),
        "administracion": _get_role_user_ids(session, tenant_id, "administracion"),
        "compras": _get_role_user_ids(session, tenant_id, "compras"),
        "juridico": _get_role_user_ids(session, tenant_id, "juridico"),
        "jefe_obra": _get_role_user_ids(session, tenant_id, "jefe_obra"),
    }


def _contract_label(contract: Contract) -> str:
    """Etiqueta humana del contrato (codigo, titulo o numero)."""
    for attr in ("code", "contract_number", "title", "name"):
        value = getattr(contract, attr, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return f"#{contract.id}"


def _format_date_es(value) -> str:
    if value is None:
        return ""
    try:
        return value.strftime("%d/%m/%Y")
    except Exception:
        return str(value)


def _comparative_body(
    contract: Contract,
    *,
    date_value=None,
    date_label: str = "Fecha de creación",
) -> str:
    """Formato bell: intro, ID, intro, fecha."""
    fecha = _format_date_es(
        date_value if date_value is not None else getattr(contract, "created_at", None)
    )
    lines = [f"ID: CP-{contract.id}"]
    if fecha:
        lines.append(f"{date_label}: {fecha}")
    return "\n".join(lines)


def _contract_generated_body(contract: Contract) -> str:
    """Formato bell: ID contrato, ID comparativo, fecha."""
    fecha = _format_date_es(
        getattr(contract, "updated_at", None) or getattr(contract, "created_at", None)
    )
    lines = [
        f"ID: CT-{contract.id}",
        f"Comparativo asociado: CP-{contract.id}",
    ]
    if fecha:
        lines.append(f"Fecha de generación: {fecha}")
    return "\n".join(lines)


def build_inapp_payload(
    event: ContractNotificationEvent,
    contract: Contract,
    *,
    department_label: Optional[str] = None,
) -> tuple[str, str]:
    """Texto para la campana en lenguaje natural, sin tecnicismos."""
    label = _contract_label(contract)
    dept = department_label

    if event == ContractNotificationEvent.COMPARATIVE_CREATED:
        return (
            "Comparativo creado",
            _comparative_body(contract, date_label="Fecha de creación"),
        )
    if event == ContractNotificationEvent.COMPARATIVE_PENDING_APPROVAL:
        return (
            "Comparativo a la espera de aprobación",
            _comparative_body(contract, date_label="Fecha de creación"),
        )
    if event == ContractNotificationEvent.COMPARATIVE_APPROVED:
        who = dept or "Gerencia"
        return (
            f"Comparativo aprobado por {who}",
            _comparative_body(
                contract,
                date_value=getattr(contract, "updated_at", None),
                date_label="Fecha de aprobación",
            ),
        )
    if event == ContractNotificationEvent.COMPARATIVE_REJECTED:
        who = dept or "Gerencia"
        return (
            f"Comparativo rechazado por {who}",
            _comparative_body(
                contract,
                date_value=getattr(contract, "updated_at", None),
                date_label="Fecha de rechazo",
            ),
        )
    if event == ContractNotificationEvent.COMPARATIVE_AUTO_APPROVED:
        return (
            "Comparativo aprobado automáticamente",
            _comparative_body(
                contract,
                date_value=getattr(contract, "updated_at", None),
                date_label="Fecha de aprobación",
            ),
        )
    if event == ContractNotificationEvent.SENT_TO_GERENCIA:
        return (
            "Contrato generado pendiente de Gerencia",
            f"El contrato {label} se ha generado y esta pendiente de aprobacion por Gerencia.",
        )
    if event == ContractNotificationEvent.GERENCIA_APPROVED:
        return (
            "Comparativo aprobado",
            f"Gerencia ha aprobado el comparativo {label}. Ya puedes continuar con el contrato.",
        )
    if event == ContractNotificationEvent.GERENCIA_REJECTED:
        return (
            "Comparativo rechazado",
            f"Gerencia ha rechazado el comparativo {label}.",
        )
    if event == ContractNotificationEvent.DEPT_APPROVED:
        who = dept or "Un departamento"
        return (
            f"Contrato aprobado por {who}",
            f"{who} ha aprobado el contrato {label}.",
        )
    if event == ContractNotificationEvent.DEPT_REJECTED:
        who = dept or "Un departamento"
        return (
            f"Contrato rechazado por {who}",
            f"{who} ha rechazado el contrato {label}.",
        )
    if event == ContractNotificationEvent.DOCS_GENERATED:
        return ("Contrato generado", _contract_generated_body(contract))
    if event == ContractNotificationEvent.SIGNATURE_SENT:
        return (
            "Contrato enviado a firma",
            f"El contrato {label} se ha enviado a firma del proveedor.",
        )
    if event == ContractNotificationEvent.SIGNED:
        return (
            "Contrato firmado",
            f"El proveedor ha firmado el contrato {label}.",
        )
    if event == ContractNotificationEvent.ALL_APPROVED:
        return (
            "Contrato totalmente aprobado",
            f"Todos los departamentos han aprobado el contrato {label}.",
        )
    if event == ContractNotificationEvent.REJECTED:
        return ("Contrato rechazado", f"El contrato {label} ha sido rechazado.")
    return ("Actualizacion de contrato", f"Hay novedades en el contrato {label}.")


def build_email_payload(
    event: ContractNotificationEvent,
    contract: Contract,
    *,
    department_label: Optional[str] = None,
) -> tuple[str, str]:
    subject = "Contrato"
    body = ""
    if event == ContractNotificationEvent.DOCS_GENERATED:
        subject = "Nuevo documento generado"
        body = f"Estado: {_status_label_es(contract.status)}"
    elif event == ContractNotificationEvent.SENT_TO_GERENCIA:
        subject = "Contrato pendiente de aprobacion (Gerencia)"
        body = f"Contrato {contract.id} listo para revision de Gerencia."
    elif event == ContractNotificationEvent.GERENCIA_APPROVED:
        dept_label = department_label or "Gerencia"
        subject = f"Contrato aprobado por {dept_label}"
        body = f"Contrato {contract.id} aprobado por {dept_label}."
    elif event == ContractNotificationEvent.GERENCIA_REJECTED:
        subject = "Contrato rechazado por Gerencia"
        body = f"Contrato {contract.id} rechazado por Gerencia."
    elif event == ContractNotificationEvent.DEPT_APPROVED:
        dept_label = department_label or "un departamento"
        subject = f"Contrato aprobado por {dept_label}"
        body = f"Contrato {contract.id} aprobado por {dept_label}."
    elif event == ContractNotificationEvent.DEPT_REJECTED:
        dept_label = department_label or "un departamento"
        subject = f"Contrato rechazado por {dept_label}"
        body = f"Contrato {contract.id} rechazado por {dept_label}."
    elif event == ContractNotificationEvent.SIGNATURE_SENT:
        subject = "Contrato para firma"
        body = "Se ha generado una solicitud de firma electronica del contrato."
    elif event == ContractNotificationEvent.SIGNED:
        subject = "Contrato firmado"
        body = f"Contrato {contract.id} firmado por el proveedor."
    return subject, body


_COMPARATIVE_EVENTS = {
    ContractNotificationEvent.COMPARATIVE_CREATED,
    ContractNotificationEvent.COMPARATIVE_PENDING_APPROVAL,
    ContractNotificationEvent.COMPARATIVE_APPROVED,
    ContractNotificationEvent.COMPARATIVE_REJECTED,
    ContractNotificationEvent.COMPARATIVE_AUTO_APPROVED,
}

_DOC_EVENTS: dict[ContractNotificationEvent, str] = {
    ContractNotificationEvent.SIGNED: "SIGNED",
}

# Solo eventos criticos disparan email. El resto se queda en campana.
EMAIL_CRITICAL_EVENTS = {
    ContractNotificationEvent.SIGNATURE_SENT,
    ContractNotificationEvent.SIGNED,
    ContractNotificationEvent.GERENCIA_REJECTED,
    ContractNotificationEvent.DEPT_REJECTED,
    ContractNotificationEvent.REJECTED,
}


def _build_contract_reference(event: ContractNotificationEvent, contract: Contract) -> str:
    base = f"contract_id={contract.id}"
    if event in _COMPARATIVE_EVENTS:
        return f"{base}&view=comparativo-review"
    if event == ContractNotificationEvent.DOCS_GENERATED:
        return f"{base}&view=contrato-form"
    doc_type = _DOC_EVENTS.get(event)
    if doc_type:
        return f"{base}&view=documents&doc={doc_type}"
    return base


def _resolve_internal_user_ids(
    event: ContractNotificationEvent,
    contract: Contract,
    dept_users: dict[str, list[int]],
    *,
    extra_user_ids: Optional[list[int]] = None,
) -> list[int]:
    if event == ContractNotificationEvent.COMPARATIVE_CREATED:
        return [contract.created_by_id] if contract.created_by_id else []
    if event == ContractNotificationEvent.COMPARATIVE_PENDING_APPROVAL:
        # Aprobadores = Gerencia + Director Técnico (positions con can_approve).
        # El creador no recibe nada.
        creator = contract.created_by_id
        return [uid for uid in (extra_user_ids or []) if uid and uid != creator]
    if event in {
        ContractNotificationEvent.COMPARATIVE_APPROVED,
        ContractNotificationEvent.COMPARATIVE_REJECTED,
    }:
        # Aprobación/rechazo del comparativo notifica al creador.
        return [contract.created_by_id] if contract.created_by_id else []
    if event == ContractNotificationEvent.COMPARATIVE_AUTO_APPROVED:
        # Auto-aprobación notifica a aprobadores (Gerencia + Director Técnico)
        # y a Jefe de Obra.
        return [
            *(extra_user_ids or []),
            *dept_users.get("jefe_obra", []),
        ]
    if event == ContractNotificationEvent.DOCS_GENERATED:
        return [contract.created_by_id]
    if event == ContractNotificationEvent.SENT_TO_GERENCIA:
        gerencia = dept_users.get("gerencia", [])
        return [*gerencia, contract.created_by_id]
    if event == ContractNotificationEvent.GERENCIA_APPROVED:
        return [
            *dept_users.get("administracion", []),
            *dept_users.get("compras", []),
            *dept_users.get("juridico", []),
            *dept_users.get("jefe_obra", []),
        ]
    if event in {
        ContractNotificationEvent.DEPT_APPROVED,
        ContractNotificationEvent.DEPT_REJECTED,
    }:
        return [
            *dept_users.get("gerencia", []),
            contract.created_by_id,
        ]
    if event == ContractNotificationEvent.GERENCIA_REJECTED:
        return [contract.created_by_id]
    if event == ContractNotificationEvent.SIGNED:
        return [
            *dept_users.get("gerencia", []),
            *dept_users.get("administracion", []),
            *dept_users.get("compras", []),
            *dept_users.get("juridico", []),
            contract.created_by_id,
        ]
    return []


_COMPARATIVE_VIEW_EVENTS = {
    ContractNotificationEvent.COMPARATIVE_CREATED,
    ContractNotificationEvent.COMPARATIVE_PENDING_APPROVAL,
    ContractNotificationEvent.COMPARATIVE_APPROVED,
    ContractNotificationEvent.COMPARATIVE_REJECTED,
    ContractNotificationEvent.COMPARATIVE_AUTO_APPROVED,
}


def _build_notification_meta(
    event: ContractNotificationEvent,
    contract: Contract,
) -> dict:
    """Payload estructurado para que el frontend enrute a vista solo-lectura."""
    is_comparative = event in _COMPARATIVE_VIEW_EVENTS
    entity = "comparative" if is_comparative else "contract"
    view = None
    if is_comparative:
        view = "comparativo-review"
    elif event == ContractNotificationEvent.DOCS_GENERATED:
        view = "contrato-form"
    elif event in _DOC_EVENTS:
        view = "documents"
    elif event in {
        ContractNotificationEvent.SENT_TO_GERENCIA,
        ContractNotificationEvent.SIGNATURE_SENT,
        ContractNotificationEvent.SIGNED,
        ContractNotificationEvent.ALL_APPROVED,
        ContractNotificationEvent.DEPT_APPROVED,
        ContractNotificationEvent.DEPT_REJECTED,
        ContractNotificationEvent.REJECTED,
        ContractNotificationEvent.GERENCIA_APPROVED,
        ContractNotificationEvent.GERENCIA_REJECTED,
    }:
        view = "contrato-form"

    meta: dict = {
        "entity": entity,
        "contract_id": contract.id,
        "event": event.value if hasattr(event, "value") else str(event),
        "mode": "ver",
    }
    if view:
        meta["view"] = view
    if event in _DOC_EVENTS:
        meta["doc"] = _DOC_EVENTS[event]
    return meta


def dispatch_internal_notifications(
    session: Session,
    *,
    event: ContractNotificationEvent,
    contract: Contract,
    department_label: Optional[str] = None,
    extra_user_ids: Optional[list[int]] = None,
) -> int:
    """Crea filas Notification (campana) para los usuarios internos."""
    contract_id = contract.id
    tenant_id = contract.tenant_id
    dept_users = get_department_user_ids(session, contract.tenant_id)
    if extra_user_ids is None and event in {
        ContractNotificationEvent.COMPARATIVE_PENDING_APPROVAL,
        ContractNotificationEvent.COMPARATIVE_AUTO_APPROVED,
    }:
        extra_user_ids, _ = get_comparative_approvers(session, contract.tenant_id)
    user_ids = _resolve_internal_user_ids(
        event, contract, dept_users, extra_user_ids=extra_user_ids
    )
    title, body = build_inapp_payload(event, contract, department_label=department_label)
    reference = _build_contract_reference(event, contract)
    meta = _build_notification_meta(event, contract)
    created = 0
    for user_id in sorted({uid for uid in user_ids if uid}):
        try:
            create_notification(
                session,
                tenant_id=tenant_id,
                user_id=user_id,
                type=NotificationType.GENERIC,
                title=title,
                body=body,
                reference=reference,
                meta=meta,
            )
            created += 1
        except Exception:
            session.rollback()
            logger.exception(
                "No se pudo crear Notification user_id=%s contract_id=%s event=%s",
                user_id,
                contract_id,
                event,
            )
    return created


def send_contract_notification(
    session: Session,
    *,
    event: ContractNotificationEvent,
    contract: Contract,
    recipients: Iterable[str],
    signature_token: Optional[str] = None,
    department_label: Optional[str] = None,
    force_email: bool = False,
) -> int:
    try:
        dispatch_internal_notifications(
            session,
            event=event,
            contract=contract,
            department_label=department_label,
        )
    except Exception:
        logger.exception(
            "Fallo dispatch in-app contract_id=%s event=%s",
            contract.id,
            event,
        )

    # Email solo en eventos criticos o si el caller fuerza.
    if not force_email and event not in EMAIL_CRITICAL_EVENTS:
        return 0

    recipients_list = _merge_recipients(recipients)
    if not recipients_list:
        return 0

    subject, body = build_email_payload(event, contract, department_label=department_label)
    if event == ContractNotificationEvent.SIGNATURE_SENT and signature_token:
        body = f"{body} Enlace de firma: {signature_token}"

    sent_count = 0
    for email in recipients_list:
        exists = session.exec(
            select(ContractNotificationLog).where(
                ContractNotificationLog.tenant_id == contract.tenant_id,
                ContractNotificationLog.contract_id == contract.id,
                ContractNotificationLog.event_type == event,
                ContractNotificationLog.recipient_email == email,
            )
        ).one_or_none()
        if exists:
            continue

        sent = _send_email([email], subject, body)
        if sent:
            log_entry = ContractNotificationLog(
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                event_type=event,
                recipient_email=email,
            )
            session.add(log_entry)
            session.commit()
            sent_count += 1
        else:
            logger.warning(
                "No se pudo enviar email contract_id=%s event=%s recipient=%s",
                contract.id,
                event,
                email,
            )

    return sent_count


def _send_contract_notification_delay(*args, **kwargs):
    from app.workers.tasks.contracts import send_contract_notification as task

    return task.delay(*args, **kwargs)


send_contract_notification.delay = _send_contract_notification_delay  # type: ignore[attr-defined]


__all__ = [
    "ROLE_ALIASES",
    "build_email_payload",
    "dispatch_internal_notifications",
    "get_department_recipients",
    "get_department_user_ids",
    "send_contract_notification",
]
