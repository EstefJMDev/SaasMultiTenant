from email.message import EmailMessage
from contextlib import contextmanager
import logging
import smtplib
from typing import Iterator, Optional

from app.core.config import settings


logger = logging.getLogger("app.email")


def _get_smtp_params() -> tuple[str | None, int, str | None, str | None, str | None, bool]:
    host = getattr(settings, "smtp_host", None)
    port = getattr(settings, "smtp_port", 587)
    username = getattr(settings, "smtp_username", None)
    password = getattr(settings, "smtp_password", None)
    from_email = getattr(settings, "smtp_from", None) or username
    use_tls = getattr(settings, "smtp_use_tls", True)
    return host, port, username, password, from_email, use_tls


@contextmanager
def _connect_smtp(
    host: str,
    port: int,
    username: str,
    password: str,
    use_tls: bool,
) -> Iterator[smtplib.SMTP]:
    with smtplib.SMTP(host, port) as server:
        if use_tls:
            server.starttls()
        server.login(username, password)
        yield server


def _send_email(to_emails: list[str], subject: str, body: str) -> bool:
    host, port, username, password, from_email, use_tls = _get_smtp_params()
    if not host or not username or not password or not from_email:
        return False

    recipients = [email.strip() for email in to_emails if email and email.strip()]
    if not recipients:
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = ", ".join(sorted(set(recipients)))
    msg.set_content(body)

    try:
        with _connect_smtp(host, port, username, password, use_tls) as server:
            server.send_message(msg)
        return True
    except Exception as exc:
        logger.exception("Error enviando email a %s: %s", msg["To"], exc)
        return False


def send_tenant_admin_welcome_email(
    to_email: str,
    tenant_name: str,
    plain_password: Optional[str] = None,
) -> None:
    """
    Correo de bienvenida al admin del tenant (sin enviar contraseña en claro).
    """

    host, port, username, password, from_email, use_tls = _get_smtp_params()
    if not host or not username or not password or not from_email:
        return

    frontend_url = settings.frontend_base_url
    if not frontend_url:
        return

    subject = f"Bienvenido como administrador del tenant {tenant_name}"
    body = (
        f"Hola,\n\n"
        f"Te hemos dado de alta como administrador del tenant '{tenant_name}'.\n\n"
        f"Puedes acceder al panel en:\n"
        f"{frontend_url}\n\n"
        f"Si no esperabas este correo, contacta con el administrador de la plataforma.\n\n"
        f"Un saludo.\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(body)

    try:
        with _connect_smtp(host, port, username, password, use_tls) as server:
            server.send_message(msg)
    except Exception as exc:
        logger.exception("Error enviando email de bienvenida a %s: %s", to_email, exc)


def send_mfa_email_code(to_email: str, code: str) -> bool:
    """
    Envía un código MFA de un solo uso al correo del usuario.

    Si SMTP no está configurado, en modo DEBUG se muestra el código en logs.
    """

    host, port, username, password, from_email, use_tls = _get_smtp_params()
    if not host or not username or not password or not from_email:
        if getattr(settings, "debug", False):
            logger.warning(
                "DEBUG MFA: código para %s (sin SMTP configurado) = %s",
                to_email,
                code,
            )
        return False

    subject = "Tu código de verificación (MFA)"
    body = (
        f"Hola,\n\n"
        f"Tu código de verificación es: {code}\n\n"
        f"Este código caduca en unos minutos y es válido solo para este inicio de sesión.\n\n"
        f"Si no has intentado iniciar sesión, ignora este mensaje.\n\n"
        f"Un saludo.\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(body)

    try:
        with _connect_smtp(host, port, username, password, use_tls) as server:
            server.send_message(msg)
        return True
    except Exception as exc:
        logger.exception("Error enviando código MFA a %s: %s", to_email, exc)
        if getattr(settings, "debug", False):
            logger.warning(
                "DEBUG MFA (fallo SMTP): código para %s = %s",
                to_email,
                code,
            )
        return False


def send_user_invitation_email(
    to_email: str,
    tenant_name: str,
    accept_url: str,
    role_name: str,
) -> None:
    """
    Envía un correo de invitación para que un usuario complete su alta.
    """

    host, port, username, password, from_email, use_tls = _get_smtp_params()
    if not host or not username or not password or not from_email:
        # Sin SMTP configurado simplemente no enviamos correo.
        if getattr(settings, "debug", False):
            logger.warning(
                "DEBUG INVITATION: enlace de invitación para %s = %s",
                to_email,
                accept_url,
            )
        return

    platform_name = (settings.platform_display_name or "Plataforma").strip()
    subject = f"Invitación a la plataforma {platform_name} ({tenant_name})"
    body = (
        f"Hola,\n\n"
        f"Has sido invitado a la plataforma {platform_name} como '{role_name}' "
        f"en el tenant '{tenant_name}'.\n\n"
        f"Para completar tu alta y definir tu contraseña, entra en:\n"
        f"{accept_url}\n\n"
        f"Si no estabas esperando esta invitación, puedes ignorar este mensaje.\n\n"
        f"Un saludo.\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(body)

    try:
        with _connect_smtp(host, port, username, password, use_tls) as server:
            server.send_message(msg)
    except Exception as exc:
        logger.exception("Error enviando email de invitación a %s: %s", to_email, exc)


def send_invoice_created_email(to_emails: list[str], invoice: object) -> None:
    """
    Envia un correo cuando se registra una nueva factura.
    """
    invoice_number = getattr(invoice, "invoice_number", None) or "N/A"
    issue_date = getattr(invoice, "issue_date", None)
    due_date = getattr(invoice, "due_date", None)

    subject = "Factura registrada"
    body = (
        f"Hola,\n\n"
        f"Se ha registrado una nueva factura.\n\n"
        f"Numero Factura: {invoice_number}\n"
        f"Fecha emision: {issue_date}\n"
        f"Fecha vencimiento: {due_date}\n"
        f"\n"
        f"Un saludo.\n"
    )
    _send_email(to_emails, subject, body)


def send_invoice_due_reminder_email(
    to_emails: list[str],
    invoice: object,
    days_until: Optional[int] = None,
) -> None:
    """
    Envia un recordatorio de vencimiento de factura.
    """
    due_date = getattr(invoice, "due_date", None)
    invoice_number = getattr(invoice, "invoice_number", None) or "N/A"
    days_line = f"Días hasta vencimiento: {days_until}\n" if days_until is not None else ""

    subject = "Recordatorio de vencimiento de factura"
    body = (
        f"Hola,\n\n"
        f"Recordatorio de vencimiento de factura.\n\n"
        f"Factura: {invoice_number}\n"
        f"Vence: {due_date}\n"
        f"{days_line}"
        f"\n"
        f"Un saludo.\n"
    )
    _send_email(to_emails, subject, body)

