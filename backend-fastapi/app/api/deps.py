from datetime import datetime, timedelta, timezone
from typing import Annotated, Callable, Iterable, Optional

from fastapi import Depends, Header, HTTPException, Request, status
from jose import JWTError
from sqlmodel import Session, select

from app.core.config import settings
from app.core.role_permissions import collect_user_permission_codes
from app.core.security import decode_token
from app.core.permissions import has_permission
from app.core.log_context import get_log_tenant_id, set_log_tenant_id, set_log_user_id
from app.core.db_session import get_tenant_session
from app.db.session import get_session
from app.models.tenant import Tenant
from app.models.tool import Tool
from app.models.user import User
from app.core.tenancy import tenant_required_for_superadmin

_LAST_SEEN_THROTTLE = timedelta(minutes=15)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_current_user(
    request: Request,
    authorization: Annotated[Optional[str], Header(alias="Authorization")] = None,
    session: Session = Depends(get_session),
) -> User:
    token: Optional[str] = None
    if authorization:
        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token de autenticacion no proporcionado",
            )
        token = authorization.split(" ", 1)[1]
    else:
        token = request.cookies.get(settings.auth_cookie_name)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticacion no proporcionado",
        )

    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token no valido o expirado",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token no valido o expirado",
        )

    token_type = payload.get("typ")
    if token_type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tipo de token no permitido",
        )

    subject = payload.get("sub")
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sin usuario",
        )

    user: Optional[User] = None
    try:
        user = session.get(User, int(subject))
    except (TypeError, ValueError):
        # Compatibilidad con tokens legacy donde `sub` podia ser el email.
        if isinstance(subject, str) and "@" in subject:
            try:
                user = session.exec(
                    select(User).where(User.email == subject.strip().lower())
                ).one_or_none()
            except Exception:
                session.rollback()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="No se pudo validar la sesion actual",
                )
    except Exception:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo validar la sesion actual",
        )
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
        )

    token_iat = payload.get("iat")
    if user.tokens_valid_after is not None and isinstance(token_iat, (int, float)):
        revoked_after_ts = _as_utc(user.tokens_valid_after).timestamp()
        if float(token_iat) < revoked_after_ts:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sesion invalidada tras cambio de permisos. Inicia sesion de nuevo.",
            )

    now_utc = datetime.now(timezone.utc)
    if user.last_seen_at is None or _as_utc(user.last_seen_at) <= (now_utc - _LAST_SEEN_THROTTLE):
        try:
            user.last_seen_at = now_utc
            session.add(user)
            session.flush()
            session.commit()
        except Exception:
            # No bloquear la autenticacion por un fallo auxiliar al actualizar "last seen".
            session.rollback()

    set_log_user_id(user.id)
    if get_log_tenant_id() is None and user.tenant_id is not None:
        set_log_tenant_id(user.tenant_id)

    return user


def get_current_tenant(
    request: Request,
    x_tenant_id: Annotated[Optional[int], Header(alias="X-Tenant-Id")] = None,
    session: Session = Depends(get_session),
) -> Tenant:
    tenant: Optional[Tenant] = None

    if x_tenant_id is not None:
        tenant = session.get(Tenant, x_tenant_id)
    else:
        host = request.headers.get("host", "")
        host_without_port = host.split(":", 1)[0]
        primary_domain = settings.primary_domain

        if not host_without_port.endswith(primary_domain):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Host no coincide con el dominio principal configurado",
            )

        if host_without_port == primary_domain:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Se requiere subdominio para resolver el tenant",
            )

        suffix = f".{primary_domain}"
        subdomain = host_without_port[: -len(suffix)]

        statement = select(Tenant).where(Tenant.subdomain == subdomain)
        tenant = session.exec(statement).one_or_none()

    if not tenant or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant no encontrado o inactivo",
        )

    return tenant


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario inactivo",
        )
    return current_user


def get_current_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Se requieren permisos de Super Admin",
        )
    return current_user


def require_permissions(required_codes: Iterable[str]) -> Callable[[User, Session], User]:
    def _dependency(
        current_user: User = Depends(get_current_active_user),
        session: Session = Depends(get_session),
    ) -> User:
        if current_user.is_super_admin:
            return current_user

        role_permissions = collect_user_permission_codes(session, current_user)
        if not role_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El usuario no tiene rol asignado",
            )

        if not all(has_permission(role_permissions, code) for code in required_codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes para realizar esta accion",
            )

        return current_user

    return _dependency


def require_any_permissions(required_codes: Iterable[str]) -> Callable[[User, Session], User]:
    def _dependency(
        current_user: User = Depends(get_current_active_user),
        session: Session = Depends(get_session),
    ) -> User:
        if current_user.is_super_admin:
            return current_user

        role_permissions = collect_user_permission_codes(session, current_user)
        if not role_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El usuario no tiene rol asignado",
            )

        if not any(has_permission(role_permissions, code) for code in required_codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permisos insuficientes para realizar esta accion",
            )

        return current_user

    return _dependency


def get_tenant_db(
    current_user: User = Depends(get_current_active_user),
    x_tenant_id: Annotated[Optional[int], Header(alias="X-Tenant-Id")] = None,
) -> Session:
    """
    Sesión con RLS activado (SET LOCAL app.current_tenant_id).

    Usar como sustituto de get_db() en endpoints que operan sobre datos
    de un solo tenant. El tenant_id se resuelve así:
      - Super admin + X-Tenant-Id header → usa el header.
      - Super admin sin header           → None (RLS inactivo, acceso total).
      - Usuario normal                   → su propio tenant_id.

    Compatible con connection pooling: SET LOCAL es transaction-scoped.
    """
    if current_user.is_super_admin:
        tenant_id = x_tenant_id
    else:
        tenant_id = current_user.tenant_id

    yield from get_tenant_session(tenant_id)


def require_tenant_tool_enabled(
    tool_slug: str,
) -> Callable[[User, Session, Optional[int]], User]:
    """
    Verifica que la herramienta exista en el catálogo.
    Las restricciones por tenant están desactivadas: todas las herramientas
    del catálogo se consideran habilitadas para cualquier tenant.
    """

    def _dependency(
        current_user: User = Depends(get_current_active_user),
        session: Session = Depends(get_session),
    ) -> User:
        tool = session.exec(select(Tool).where(Tool.slug == tool_slug)).one_or_none()
        if not tool:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Herramienta '{tool_slug}' no encontrada.",
            )
        return current_user

    return _dependency
