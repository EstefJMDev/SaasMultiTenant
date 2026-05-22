from datetime import datetime, timedelta, timezone
import secrets
import re

from sqlalchemy import func
from sqlmodel import Session, select

from app.core.audit import log_action
from app.core.config import settings
from app.core.email import send_mfa_email_code
from app.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
    verify_password_and_update,
)
from app.models.mfa_email_code import MFAEmailCode
from app.models.user import User
from app.schemas.auth import LoginResponse, MFAVerifyResponse
from app.schemas.password import ChangePasswordRequest

_TRIVIAL_PASSWORDS = {
    "password",
    "password123",
    "12345678",
    "123456789",
    "1234567890",
    "qwerty",
    "qwerty123",
    "admin",
    "admin123",
    "letmein",
}
_MFA_MAX_FAILED_ATTEMPTS = 3
_MFA_COOLDOWN_MINUTES = 5


class MFAThrottleError(ValueError):
    def __init__(self, message: str, *, retry_after_seconds: int) -> None:
        super().__init__(message)
        self.retry_after_seconds = max(1, int(retry_after_seconds))


def _validate_new_password_strength(value: str) -> None:
    if len(value) < 12:
        raise ValueError("La nueva contraseña debe tener al menos 12 caracteres")
    if value.strip() != value:
        raise ValueError("La nueva contraseña no puede tener espacios al inicio o final")

    has_upper = re.search(r"[A-Z]", value) is not None
    has_lower = re.search(r"[a-z]", value) is not None
    has_digit = re.search(r"\d", value) is not None
    has_symbol = re.search(r"[^A-Za-z0-9]", value) is not None

    if not (has_upper and has_lower and has_digit and has_symbol):
        raise ValueError(
            "La nueva contraseña debe incluir mayúsculas, minúsculas, números y símbolos"
        )

    lowered = value.lower()
    if lowered in _TRIVIAL_PASSWORDS:
        raise ValueError("La nueva contraseña es demasiado común o trivial")


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _mark_login_success(session: Session, user: User) -> None:
    now_utc = datetime.now(timezone.utc)
    user.last_login_at = now_utc
    user.last_seen_at = now_utc
    session.add(user)
    session.flush()


def _find_user_by_email(session: Session, email: str) -> User | None:
    normalized_email = (email or "").strip().lower()
    if not normalized_email:
        return None
    return session.exec(
        select(User).where(func.lower(User.email) == normalized_email),
    ).one_or_none()


def authenticate_user(session: Session, email: str, password: str) -> User:
    """
    Autentica un usuario por email y contraseña.

    Lanza ValueError si las credenciales no son válidas.
    """

    user = _find_user_by_email(session, email)

    if not user:
        raise ValueError("Credenciales incorrectas")

    is_valid, updated_hash = verify_password_and_update(password, user.hashed_password)
    if not is_valid:
        raise ValueError("Credenciales incorrectas")

    if updated_hash:
        user.hashed_password = updated_hash
        session.add(user)
        session.commit()
        session.refresh(user)

    return user


def _build_mfa_trust_token(user: User) -> str:
    return create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(hours=settings.mfa_trust_hours),
        token_type="mfa_trust",
    )


def _is_mfa_trusted_for_user(user: User, mfa_trust_token: str | None) -> bool:
    if not mfa_trust_token:
        return False
    try:
        payload = decode_token(mfa_trust_token)
    except Exception:
        return False
    if payload.get("typ") != "mfa_trust":
        return False
    return payload.get("sub") == str(user.id)


def login_step1(
    session: Session,
    email: str,
    password: str,
    mfa_trust_token: str | None = None,
) -> LoginResponse:
    """
    Paso 1 de login:
    - Valida credenciales.
    - Si el usuario es SUPER_ADMIN, devuelve token directo sin MFA.
    - Para el resto de usuarios, genera y envía un código MFA por email
      y marca `mfa_required=True`.
    """

    user = authenticate_user(session, email, password)

    # Si el usuario está desactivado por administración, no debe poder iniciar sesión.
    if not user.is_active:
        raise ValueError("Tu usuario está desactivado. Contacta con administración.")

    # Modo temporal sin MFA para todos los usuarios.
    if not settings.mfa_enabled:
        _mark_login_success(session, user)
        access_token = create_access_token(
            subject=str(user.id),
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        )
        log_action(
            session,
            user_id=user.id,
            tenant_id=user.tenant_id,
            action="login.no_mfa",
            details="Login sin MFA (MFA_ENABLED=false)",
        )
        session.commit()
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            mfa_required=False,
        )

    # Super Admin nunca usa MFA.
    if user.is_super_admin:
        _mark_login_success(session, user)
        # Access token is minimal; roles are always read from the database.
        access_token = create_access_token(
            subject=str(user.id),
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        )

        log_action(
            session,
            user_id=user.id,
            tenant_id=user.tenant_id,
            action="login",
            details="Login sin MFA (SUPER_ADMIN)",
        )
        session.commit()

        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            mfa_required=False,
        )

    # Si el dispositivo ya fue marcado como confiable en las ultimas 24h,
    # omitimos MFA y emitimos token de acceso directamente.
    if _is_mfa_trusted_for_user(user, mfa_trust_token):
        _mark_login_success(session, user)
        access_token = create_access_token(
            subject=str(user.id),
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        )
        log_action(
            session,
            user_id=user.id,
            tenant_id=user.tenant_id,
            action="login.mfa_trusted",
            details="Login sin MFA por dispositivo confiable",
        )
        session.commit()
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            mfa_required=False,
        )

    # Resto de usuarios: MFA por email.
    # If there is an active cooldown, do not issue a fresh code yet.
    mfa_record = session.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one_or_none()
    now_utc = datetime.now(timezone.utc)
    if mfa_record and mfa_record.failed_attempts >= _MFA_MAX_FAILED_ATTEMPTS:
        lock_until = _as_utc(mfa_record.created_at) + timedelta(minutes=_MFA_COOLDOWN_MINUTES)
        if lock_until > now_utc:
            retry_after = int((lock_until - now_utc).total_seconds())
            raise MFAThrottleError(
                "Too many failed MFA attempts. Please wait before requesting a new code.",
                retry_after_seconds=retry_after,
            )

    code = f"{secrets.randbelow(1_000_000):06d}"
    code_hash = hash_password(code)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    if mfa_record:
        mfa_record.code_hash = code_hash
        mfa_record.expires_at = expires_at
        mfa_record.failed_attempts = 0
        mfa_record.created_at = now_utc
        session.add(mfa_record)
    else:
        session.add(
            MFAEmailCode(
                user_id=user.id,
                code_hash=code_hash,
                expires_at=expires_at,
                failed_attempts=0,
                created_at=now_utc,
            ),
        )

    session.commit()

    # Enviamos el código por email y fallamos el login si no se puede entregar.
    # Evita dejar al usuario bloqueado en MFA requerido sin haber recibido código.
    email_sent = send_mfa_email_code(to_email=user.email, code=code)
    if not email_sent:
        raise ValueError(
            "No se pudo enviar el código MFA por correo. "
            "Revisa la configuración SMTP o contacta con soporte.",
        )

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="login.mfa_request",
        details="Se ha enviado un código MFA por correo electrónico",
    )

    return LoginResponse(
        mfa_required=True,
        message="MFA requerido, revisa tu correo para obtener el código (válido 24h)",
    )


def login_step2_verify_mfa(
    session: Session,
    username: str,
    mfa_code: str,
) -> MFAVerifyResponse:
    """
    Paso 2 de login:
    - Verifica el código MFA enviado por correo para el usuario indicado.
    - Devuelve token de acceso completo en caso de éxito.
    """

    normalized_username = (username or "").strip().lower()
    normalized_code = (mfa_code or "").strip()

    if not normalized_username:
        raise ValueError("Usuario no valido para verificacion MFA")
    if not normalized_code:
        raise ValueError("Codigo MFA requerido")

    user = _find_user_by_email(session, normalized_username)

    if not user:
        raise ValueError("Usuario no encontrado")

    if not user.is_active:
        raise ValueError("Tu usuario está desactivado. Contacta con administración.")

    mfa_record = session.exec(
        select(MFAEmailCode).where(MFAEmailCode.user_id == user.id),
    ).one_or_none()

    if not mfa_record:
        raise ValueError("No hay un código MFA activo para este usuario")

    if _as_utc(mfa_record.expires_at) < datetime.now(timezone.utc):
        # Código expirado: lo invalidamos.
        session.delete(mfa_record)
        session.commit()
        raise ValueError("El código MFA ha expirado, vuelve a iniciar sesión")

    # Verificamos el código.
    now_utc = datetime.now(timezone.utc)
    if mfa_record.failed_attempts >= _MFA_MAX_FAILED_ATTEMPTS:
        lock_until = _as_utc(mfa_record.created_at) + timedelta(minutes=_MFA_COOLDOWN_MINUTES)
        if lock_until > now_utc:
            retry_after = int((lock_until - now_utc).total_seconds())
            raise MFAThrottleError(
                "Too many failed MFA attempts. Please wait before trying again.",
                retry_after_seconds=retry_after,
            )

    if not verify_password(normalized_code, mfa_record.code_hash):
        mfa_record.failed_attempts += 1
        if mfa_record.failed_attempts >= _MFA_MAX_FAILED_ATTEMPTS:
            mfa_record.created_at = now_utc
        session.add(mfa_record)
        session.commit()

        if mfa_record.failed_attempts >= _MFA_MAX_FAILED_ATTEMPTS:
            raise ValueError(
                "Has superado el número de intentos. "
                "Espera unos minutos antes de solicitar un nuevo código MFA.",
            )

        raise ValueError("Código MFA incorrecto")

    # Código correcto: invalidamos el registro MFA.
    session.delete(mfa_record)
    session.commit()

    # Access token is minimal; roles are always read from the database.
    _mark_login_success(session, user)
    access_token = create_access_token(
        subject=str(user.id),
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
    )

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="mfa.verify",
        details="Login con MFA por email satisfactorio",
    )
    session.commit()

    return MFAVerifyResponse(
        access_token=access_token,
        token_type="bearer",
        mfa_required=False,
    )


def change_password(
    session: Session,
    user: User,
    data: ChangePasswordRequest,
) -> None:
    """
    Cambia la contraseña del propio usuario verificando la actual
    y aplicando validaciones básicas a la nueva.
    """

    if data.new_password != data.new_password_confirm:
        raise ValueError("La nueva contraseña y su confirmación no coinciden")

    _validate_new_password_strength(data.new_password)

    if not verify_password(data.current_password, user.hashed_password):
        raise ValueError("La contraseña actual no es correcta")

    if verify_password(data.new_password, user.hashed_password):
        raise ValueError("La nueva contraseña no puede ser igual a la actual")

    user.hashed_password = hash_password(data.new_password)
    session.add(user)
    session.commit()

    log_action(
        session,
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="user.change_password",
        details="Cambio de contraseña del propio usuario",
    )
