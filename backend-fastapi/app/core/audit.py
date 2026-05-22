from typing import Optional
import contextvars
import logging

from sqlmodel import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger("app.audit")


_audit_source_ctx: contextvars.ContextVar[str] = contextvars.ContextVar(
    "audit_source",
    default="app",
)


def set_audit_source(source: str) -> contextvars.Token:
    return _audit_source_ctx.set(source)


def reset_audit_source(token: contextvars.Token) -> None:
    _audit_source_ctx.reset(token)


def get_audit_source() -> str:
    return _audit_source_ctx.get()


def log_action(
    session: Session,
    *,
    user_id: Optional[int],
    tenant_id: Optional[int],
    action: str,
    details: Optional[str] = None,
    source: Optional[str] = None,
) -> None:
    """
    Registra una acción en la tabla de auditoría.

    Parámetros:
    - `user_id`: ID del usuario que realiza la acción (si está autenticado).
    - `tenant_id`: ID del tenant sobre el que se actúa (si aplica).
    - `action`: Descripción corta de la acción (ej: 'user.login', 'tenant.create').
    - `details`: Información adicional (JSON serializado, texto, etc.).
    """

    audit = AuditLog(
        user_id=user_id,
        tenant_id=tenant_id,
        source=source or get_audit_source(),
        action=action,
        details=details,
    )
    try:
        # Savepoint local: no hace commit independiente y evita romper el flujo principal.
        with session.begin_nested():
            session.add(audit)
    except Exception as exc:
        logger.warning(
            "No se pudo registrar auditoria action=%s tenant_id=%s: %s",
            action,
            tenant_id,
            exc,
        )
