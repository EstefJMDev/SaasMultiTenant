from datetime import datetime, timezone
import secrets
from urllib.parse import urlencode

from sqlmodel import Session, select

from app.core.audit import log_action
from app.core.config import settings
from app.core.email import send_user_invitation_email
from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_invitation import UserInvitation
from app.models.role import Role
from app.schemas.invitation import (
    UserInvitationAccept,
    UserInvitationCreate,
    UserInvitationRead,
    UserInvitationValidateResponse,
)
from app.schemas.user import UserCreate
from app.services.external_account_service import sync_moodle_user
from app.services.user_service import create_user

INVITABLE_ROLES = {"tenant_admin", "support", "user"}


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


def _as_utc(dt: datetime) -> datetime:
    """
    Normaliza datetimes naive/aware a aware UTC para comparaciones seguras.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _build_frontend_hash_url(frontend_url: str, route_path: str, query: dict[str, str]) -> str:
    """
    Construye una URL compatible con el router hash del frontend.

    Ejemplo:
    - base: http://localhost:5173
    - ruta: /accept-invitation
    - salida: http://localhost:5173/#/accept-invitation?token=...
    """
    base = frontend_url.strip()
    if not base:
        raise ValueError("FRONTEND_BASE_URL no configurado.")

    normalized_route = route_path.lstrip("/")
    query_string = urlencode(query)

    if "#/" in base:
        prefix, _ = base.split("#/", 1)
        return f"{prefix}#/{normalized_route}?{query_string}"
    if base.endswith("#"):
        return f"{base}/{normalized_route}?{query_string}"
    return f"{base.rstrip('/')}/#/{normalized_route}?{query_string}"


def _get_or_create_role(session: Session, role_name: str) -> Role:
    role = session.exec(select(Role).where(Role.name == role_name)).one_or_none()
    if role:
        return role
    role = Role(name=role_name, description=f"Rol base: {role_name}")
    session.add(role)
    session.commit()
    session.refresh(role)
    return role


def create_user_invitation(
    session: Session,
    current_user: User,
    data: UserInvitationCreate,
) -> UserInvitationRead:
    """
    Crea una invitación de usuario y envía un correo con el enlace.

    Solo permitido para:
    - Super Admin (para cualquier tenant).
    - tenant_admin del propio tenant.
    """

    if not current_user.is_super_admin and not current_user.tenant_id:
        raise PermissionError("Solo usuarios asociados a un tenant pueden invitar.")

    # Determinar tenant de la invitación.
    tenant_id: int
    if current_user.is_super_admin:
        if not data.tenant_id:
            raise ValueError("Debe indicarse el tenant para la invitación.")
        tenant_id = data.tenant_id
    else:
        tenant_id = current_user.tenant_id  # type: ignore[assignment]

    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise ValueError("Tenant no encontrado.")

    # Validar rol
    if data.role_name not in INVITABLE_ROLES:
        raise ValueError("Rol de invitacion no valido.")

    _get_or_create_role(session, data.role_name)

    # Eliminar invitaciones antiguas para el mismo email+tenant.
    existing_invites = session.exec(
        select(UserInvitation).where(
            UserInvitation.email == data.email,
            UserInvitation.tenant_id == tenant_id,
        ),
    ).all()
    for inv in existing_invites:
        # No las borramos físicamente, solo las marcamos como usadas si no lo estaban.
        if not inv.used_at:
            inv.used_at = datetime.now(timezone.utc)
            session.add(inv)

    token = _generate_token()

    invitation = UserInvitation(
        email=str(data.email),
        full_name=data.full_name,
        tenant_id=tenant_id,
        role_name=data.role_name,
        token=token,
        created_by_id=current_user.id,
    )
    session.add(invitation)
    session.commit()
    session.refresh(invitation)

    # Enviar email de invitación
    frontend_url = settings.frontend_base_url
    if not frontend_url:
        raise ValueError("FRONTEND_BASE_URL no configurado.")
    accept_url = _build_frontend_hash_url(
        frontend_url=frontend_url,
        route_path="/accept-invitation",
        query={"token": token},
    )

    try:
        send_user_invitation_email(
            to_email=invitation.email,
            tenant_name=tenant.name,
            accept_url=accept_url,
            role_name=data.role_name,
        )
    except Exception:
        # No rompemos la invitación si el correo falla.
        pass

    log_action(
        session=session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="user.invitation.create",
        details=f"Invitación creada para {invitation.email} en tenant_id={tenant_id}",
    )

    return UserInvitationRead(
        id=invitation.id,
        email=invitation.email,
        full_name=invitation.full_name,
        tenant_id=invitation.tenant_id,
        role_name=invitation.role_name,
        created_at=invitation.created_at,
        expires_at=invitation.expires_at,
        used_at=invitation.used_at,
    )


def validate_invitation(
    session: Session,
    token: str,
) -> UserInvitationValidateResponse:
    """
    Devuelve información reducida sobre una invitación.
    """


    invitation = session.exec(
        select(UserInvitation).where(UserInvitation.token == token),
    ).one_or_none()

    if not invitation:
        raise LookupError("Invitacion no encontrada.")

    tenant = session.get(Tenant, invitation.tenant_id)
    tenant_name = tenant.name if tenant else ""

    now = datetime.now(timezone.utc)
    is_used = invitation.used_at is not None
    is_expired = _as_utc(invitation.expires_at) < now

    return UserInvitationValidateResponse(
        email=invitation.email,
        full_name=invitation.full_name,
        tenant_name=tenant_name,
        role_name=invitation.role_name,
        is_valid=not is_used and not is_expired,
        is_used=is_used,
        is_expired=is_expired,
    )


def accept_invitation(
    session: Session,
    data: UserInvitationAccept,
) -> None:
    """
    Acepta una invitación creando el usuario asociado.
    """


    invitation = session.exec(
        select(UserInvitation).where(UserInvitation.token == data.token),
    ).one_or_none()
    if not invitation:
        raise ValueError("Invitación no encontrada.")

    now = datetime.now(timezone.utc)
    if invitation.used_at is not None:
        raise ValueError("La invitación ya ha sido utilizada.")
    if _as_utc(invitation.expires_at) < now:
        raise ValueError("La invitación ha caducado.")

    if data.password != data.password_confirm:
        raise ValueError("La contraseña y su confirmación deben ser iguales.")

    tenant = session.get(Tenant, invitation.tenant_id)
    if not tenant:
        raise ValueError("Tenant asociado a la invitación no encontrado.")

    # Usuario que "crea" a efectos de auditoría es el creador de la invitación.
    created_by = session.get(User, invitation.created_by_id)
    if not created_by:
        raise ValueError("Usuario creador de la invitación no encontrado.")

    # Verificamos si ya existe un usuario con ese email.
    existing_user = session.exec(
        select(User).where(User.email == invitation.email),
    ).one_or_none()
    if existing_user:
        if existing_user.is_super_admin:
            raise ValueError("No se puede reactivar automáticamente un super admin.")
        if existing_user.is_active and existing_user.tenant_id != invitation.tenant_id:
            raise ValueError("Ya existe un usuario activo con este email en otro tenant.")

        role = _get_or_create_role(session, invitation.role_name)
        existing_user.full_name = data.full_name
        existing_user.hashed_password = hash_password(data.password)
        # Permite recuperar cuentas legacy/inactivas y también reutilizar
        # una cuenta activa del mismo tenant (p. ej. para reset controlado via invitación).
        existing_user.tenant_id = invitation.tenant_id
        existing_user.role_id = role.id
        existing_user.is_active = True
        session.add(existing_user)

        sync_moodle_user(
            email=invitation.email,
            full_name=data.full_name,
            password=data.password,
        )

        invitation.used_at = now
        session.add(invitation)
        session.commit()

        log_action(
            session=session,
            user_id=created_by.id,
            tenant_id=invitation.tenant_id,
            action="user.invitation.accept",
            details=f"Invitación aceptada reutilizando usuario existente {invitation.email}",
        )
        return

    user_payload = UserCreate(
        email=invitation.email,
        full_name=data.full_name,
        password=data.password,
        tenant_id=invitation.tenant_id,
        is_super_admin=False,
        role_name=invitation.role_name,
    )

    # Reutilizamos la lógica de creación de usuarios existente.
    create_user(
        session=session,
        current_user=created_by,
        user_in=user_payload,
    )

    sync_moodle_user(
        email=invitation.email,
        full_name=data.full_name,
        password=data.password,
    )

    invitation.used_at = now
    session.add(invitation)
    session.commit()

    log_action(
        session=session,
        user_id=created_by.id,
        tenant_id=invitation.tenant_id,
        action="user.invitation.accept",
        details=f"Invitación aceptada para {invitation.email}",
    )
