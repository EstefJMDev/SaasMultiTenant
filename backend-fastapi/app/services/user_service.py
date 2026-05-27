from pathlib import Path
from typing import List
from datetime import datetime, timezone

from fastapi import UploadFile
from pydantic import EmailStr, TypeAdapter
from sqlmodel import Session, select
from sqlalchemy.exc import IntegrityError

from app.core.audit import log_action
from app.core.config import settings
from app.core.security import hash_password
from app.core.email import send_tenant_admin_welcome_email
from app.core.permission_cache import invalidate_role_permissions_cache
from app.core.role_permissions import collect_user_permission_codes
from app.core.user_me_cache import (
    get_user_me_cache,
    invalidate_user_me_cache,
    set_user_me_cache,
)
from app.models.hr import Department, EmployeeDepartment, EmployeeProfile, Position
from app.models.tenant import Tenant
from app.models.user import User
from app.models.role import Role
from app.models.audit_log import AuditLog
from app.schemas.user import (
    UserCreate,
    UserRead,
    UserUpdateAdmin,
    UserUpdateMe,
    UserStatusUpdate,
)
from app.storage.local import save_avatar_to_disk

OFFICIAL_NON_SUPERADMIN_ROLES = {"tenant_admin", "gerencia", "support", "user"}
_EMAIL_ADAPTER = TypeAdapter(EmailStr)


def _safe_email_for_read(user: User) -> str:
    candidate = (user.email or "").strip()
    try:
        return str(_EMAIL_ADAPTER.validate_python(candidate))
    except Exception:
        user_id = user.id or 0
        return f"user-{user_id}@invalid.local"

def _get_or_create_role(session: Session, role_name: str) -> Role:
    role = session.exec(select(Role).where(Role.name == role_name)).one_or_none()
    if role:
        return role
    role = Role(name=role_name, description=f"Rol base: {role_name}")
    session.add(role)
    session.commit()
    session.refresh(role)
    return role


def _role_name_for(session: Session, user: User) -> str | None:
    """Lookup role_name for a User; safe (devuelve None si no hay rol)."""
    if not user.role_id:
        return None
    try:
        role = session.get(Role, user.role_id)
        return role.name if role else None
    except Exception:
        return None


def _resolve_avatar_url(avatar_url: str | None) -> str | None:
    if not avatar_url:
        return None
    if "/api/v1/users/avatar-files/" in avatar_url:
        return avatar_url
    if "/static/avatars/" not in avatar_url:
        return avatar_url
    filename = avatar_url.rsplit("/", 1)[-1]
    file_path = Path(settings.avatars_storage_path) / filename
    if not file_path.exists():
        return None
    return f"/api/v1/users/avatar-files/{filename}"


def _user_to_read(
    user: User,
    role_name: str | None = None,
    permissions: list[str] | None = None,
    department_nav_config: dict[str, bool] | None = None,
    position_info: dict | None = None,
    contract_caps: dict | None = None,
) -> UserRead:
    created_at = user.created_at or datetime.now(timezone.utc)
    safe_user_id = user.id or 0
    safe_email = _safe_email_for_read(user)
    safe_full_name = user.full_name or safe_email
    safe_language = user.language or "en"
    pinfo = position_info or {}
    ccaps = contract_caps or {}
    # Solo super_admin bypassea caps de comparativo. tenant_admin debe tener
    # Position con caps si necesita aprobar/editar; si no, no ve los botones.
    admin_bypass = bool(user.is_super_admin)
    return UserRead(
        id=safe_user_id,
        email=safe_email,
        full_name=safe_full_name,
        is_active=bool(user.is_active),
        is_super_admin=user.is_super_admin,
        tenant_id=user.tenant_id,
        role_id=user.role_id,
        role_name=role_name,
        permissions=permissions or [],
        language=safe_language,
        avatar_url=_resolve_avatar_url(user.avatar_url),
        department_nav_config=department_nav_config,
        created_at=created_at,
        position_id=pinfo.get("position_id"),
        position_name=pinfo.get("position_name"),
        can_create_comparative=bool(pinfo.get("can_create_comparative") or admin_bypass),
        can_edit_comparative=bool(pinfo.get("can_edit_comparative") or admin_bypass),
        can_delete_comparative=bool(pinfo.get("can_delete_comparative") or admin_bypass),
        can_approve_comparative=bool(pinfo.get("can_approve_comparative") or admin_bypass),
        can_reject_comparative=bool(pinfo.get("can_reject_comparative") or admin_bypass),
        can_view_all_comparatives=bool(pinfo.get("can_view_all_comparatives") or admin_bypass),
        full_approver=bool(pinfo.get("full_approver") or admin_bypass),
        can_view_contract=bool(ccaps.get("can_view_contract") or admin_bypass),
        can_edit_contract=bool(ccaps.get("can_edit_contract") or admin_bypass),
        can_regenerate_contract=bool(ccaps.get("can_regenerate_contract") or admin_bypass),
        can_approve_contract=bool(ccaps.get("can_approve_contract") or admin_bypass),
        can_reject_contract=bool(ccaps.get("can_reject_contract") or admin_bypass),
        can_view_worksite=bool(ccaps.get("can_view_worksite") or admin_bypass),
        can_edit_worksite=bool(ccaps.get("can_edit_worksite") or admin_bypass),
        can_view_provider=bool(ccaps.get("can_view_provider") or admin_bypass),
        can_edit_provider=bool(ccaps.get("can_edit_provider") or admin_bypass),
    )


_CONTRACT_CAP_NAMES = (
    "can_view_contract",
    "can_edit_contract",
    "can_regenerate_contract",
    "can_approve_contract",
    "can_reject_contract",
    "can_view_worksite",
    "can_edit_worksite",
    "can_view_provider",
    "can_edit_provider",
)


def resolve_user_domain_caps(session: Session, user: User) -> dict:
    """OR entre Position y todos los Departments del empleado para cada cap de dominio."""
    out = {cap: False for cap in _CONTRACT_CAP_NAMES}
    if not user.tenant_id:
        return out
    try:
        employee = session.exec(
            select(EmployeeProfile).where(
                EmployeeProfile.user_id == user.id,
                EmployeeProfile.tenant_id == user.tenant_id,
                EmployeeProfile.is_active.is_(True),
            )
        ).one_or_none()
        if not employee:
            return out

        if employee.position_id:
            pos = session.get(Position, employee.position_id)
            if pos and pos.is_active and pos.tenant_id == user.tenant_id:
                for cap in _CONTRACT_CAP_NAMES:
                    if getattr(pos, cap, False):
                        out[cap] = True

        dept_ids = [
            row.department_id
            for row in session.exec(
                select(EmployeeDepartment).where(
                    EmployeeDepartment.employee_id == employee.id
                )
            ).all()
        ]
        if dept_ids:
            depts = session.exec(
                select(Department).where(
                    Department.id.in_(dept_ids),
                    Department.tenant_id == user.tenant_id,
                )
            ).all()
            for dept in depts:
                for cap in _CONTRACT_CAP_NAMES:
                    if getattr(dept, cap, False):
                        out[cap] = True
    except Exception:
        return {cap: False for cap in _CONTRACT_CAP_NAMES}
    return out


def _resolve_position_info(session: Session, user: User) -> dict | None:
    """Devuelve dict con id/name + permisos atómicos de la Position activa del usuario."""
    if not user.tenant_id:
        return None
    try:
        employee = session.exec(
            select(EmployeeProfile).where(
                EmployeeProfile.user_id == user.id,
                EmployeeProfile.tenant_id == user.tenant_id,
                EmployeeProfile.is_active.is_(True),
            )
        ).one_or_none()
        if not employee or not employee.position_id:
            return None
        pos = session.get(Position, employee.position_id)
        if not pos or not pos.is_active or pos.tenant_id != user.tenant_id:
            return None

        def _eff(cap: str) -> bool:
            # Cada cap depende solo del puesto. El departamento no condiciona.
            return bool(getattr(pos, cap, False))

        return {
            "position_id": pos.id,
            "position_name": pos.name,
            "can_create_comparative": _eff("can_create_comparative"),
            "can_edit_comparative": _eff("can_edit_comparative"),
            "can_delete_comparative": _eff("can_delete_comparative"),
            "can_approve_comparative": _eff("can_approve_comparative"),
            "can_reject_comparative": _eff("can_reject_comparative"),
            "can_view_all_comparatives": _eff("can_view_all_comparatives"),
            "full_approver": _eff("full_approver"),
        }
    except Exception:
        return None


def get_user_me(session: Session, current_user: User) -> UserRead:
    """
    Devuelve la representación de lectura del usuario actual.
    """

    cached = get_user_me_cache(current_user.id or 0)
    if cached is not None:
        try:
            return UserRead.model_validate(cached)
        except Exception:
            pass

    role_name: str | None = None
    try:
        role = session.get(Role, current_user.role_id) if current_user.role_id else None
        if role:
            role_name = role.name
    except Exception:
        role_name = None

    try:
        permissions = sorted(collect_user_permission_codes(session, current_user))
    except Exception:
        permissions = []

    department_nav_config: dict[str, bool] | None = None
    try:
        if current_user.tenant_id:
            employee = session.exec(
                select(EmployeeProfile).where(
                    EmployeeProfile.user_id == current_user.id,
                    EmployeeProfile.tenant_id == current_user.tenant_id,
                    EmployeeProfile.is_active.is_(True),
                )
            ).one_or_none()
            if employee:
                # UNION sobre todos los dptos del empleado: un módulo se muestra si
                # algún dpto lo permite. Si no hay ningún dpto, se devuelve None
                # (= sin restricciones, ver todo lo que el rol RBAC ya autorice).
                department_ids = [
                    row.department_id
                    for row in session.exec(
                        select(EmployeeDepartment).where(
                            EmployeeDepartment.employee_id == employee.id
                        )
                    ).all()
                ]
                if department_ids:
                    departments = session.exec(
                        select(Department).where(
                            Department.id.in_(department_ids),
                            Department.tenant_id == current_user.tenant_id,
                        )
                    ).all()
                    union_visibility: dict[str, bool] = {}
                    for dept in departments:
                        if not isinstance(dept.menu_visibility, dict):
                            continue
                        for key, value in dept.menu_visibility.items():
                            skey = str(key)
                            # OR: una vez permitido en cualquier dpto, queda permitido.
                            union_visibility[skey] = bool(union_visibility.get(skey)) or bool(value)
                    if union_visibility:
                        department_nav_config = union_visibility
    except Exception:
        department_nav_config = None

    position_info = _resolve_position_info(session, current_user)
    contract_caps = resolve_user_domain_caps(session, current_user)

    response = _user_to_read(
        current_user,
        role_name=role_name,
        permissions=permissions,
        department_nav_config=department_nav_config,
        position_info=position_info,
        contract_caps=contract_caps,
    )
    try:
        set_user_me_cache(current_user.id or 0, response.model_dump(mode="json"))
    except Exception:
        pass
    return response


def list_users_by_tenant(
    session: Session,
    current_user: User,
    tenant_id: int,
    exclude_assigned: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> List[UserRead]:
    """
    Lista usuarios de un tenant concreto, aplicando reglas de acceso.
    """

    if not current_user.is_super_admin and current_user.tenant_id != tenant_id:
        raise PermissionError("No tienes permisos para ver este tenant")

    tenant_exists = session.get(Tenant, tenant_id)
    if not tenant_exists:
        raise LookupError("Tenant no encontrado")

    stmt = select(User).where(User.tenant_id == tenant_id)
    if exclude_assigned:
        assigned_user_ids = session.exec(
            select(EmployeeProfile.user_id).where(
                EmployeeProfile.tenant_id == tenant_id,
                EmployeeProfile.user_id.is_not(None),
            ),
        ).all()
        assigned_set = {user_id for user_id in assigned_user_ids if user_id is not None}
        if assigned_set:
            stmt = stmt.where(User.id.notin_(assigned_set))

    stmt = stmt.order_by(User.created_at.desc()).offset(offset).limit(limit)
    users = session.exec(stmt).all()

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=tenant_id,
        action="user.list",
        details=f"Listado de {len(users)} usuarios para tenant_id={tenant_id}",
    )

    role_ids = {u.role_id for u in users if u.role_id}
    roles_by_id: dict[int, str] = {}
    if role_ids:
        roles = session.exec(select(Role).where(Role.id.in_(role_ids))).all()
        roles_by_id = {role.id: role.name for role in roles if role.id is not None}

    result: List[UserRead] = []
    for u in users:
        result.append(_user_to_read(u, role_name=roles_by_id.get(u.role_id)))

    return result


def update_user_me(
    session: Session,
    current_user: User,
    data: UserUpdateMe,
) -> UserRead:
    """
    Actualiza los datos básicos del propio usuario (perfil).
    """

    current_user.full_name = data.full_name
    if data.language is not None:
        current_user.language = data.language
    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url.strip() or None
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    invalidate_user_me_cache(current_user.id)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        action="user.update_me",
        details="Actualización de perfil del propio usuario",
    )

    return _user_to_read(current_user, role_name=_role_name_for(session, current_user))


def update_user_avatar(
    session: Session,
    current_user: User,
    upload: UploadFile,
) -> UserRead:
    """
    Actualiza la foto de perfil del usuario autenticado.
    """

    content_type = (getattr(upload, "content_type", None) or "").lower().strip()
    ext_map = {
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
    }
    extension = ext_map.get(content_type)
    if not extension:
        filename = (getattr(upload, "filename", None) or "").strip().lower()
        if "." in filename:
            raw_ext = filename.rsplit(".", 1)[-1]
            if raw_ext in {"jpg", "jpeg", "png", "webp"}:
                extension = "jpg" if raw_ext in {"jpg", "jpeg"} else raw_ext
    if not extension:
        raise ValueError("Formato de imagen no soportado (jpeg, png, webp)")

    max_bytes = 5 * 1024 * 1024  # 5MB
    target_path = save_avatar_to_disk(upload, current_user.id, extension, max_size_bytes=max_bytes)
    current_user.avatar_url = f"/api/v1/users/avatar-files/{target_path.name}"
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    invalidate_user_me_cache(current_user.id)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id,
        action="user.update_avatar",
        details="Actualización de foto de perfil",
    )

    return _user_to_read(current_user, role_name=_role_name_for(session, current_user))


def update_user_admin(
    session: Session,
    current_user: User,
    user_id: int,
    data: UserUpdateAdmin,
) -> UserRead:
    """
    Actualiza datos básicos de un usuario (admin).
    """

    user = session.get(User, user_id)
    if not user:
        raise LookupError("Usuario no encontrado")

    if not current_user.is_super_admin:
        if user.is_super_admin:
            raise PermissionError("No puedes editar un Super Admin")
        if current_user.tenant_id != user.tenant_id:
            raise PermissionError("No tienes permisos para editar este usuario")

    if data.email is not None:
        email = data.email.strip().lower()
        if not email:
            raise ValueError("Email no válido")
        existing = session.exec(select(User).where(User.email == email)).one_or_none()
        if existing and existing.id != user.id:
            raise ValueError("Ya existe un usuario con ese email")
        user.email = email

    if data.full_name is not None:
        user.full_name = data.full_name.strip()

    previous_role_id = user.role_id
    role_changed = False
    if data.role_name is not None:
        if data.role_name == "super_admin" and not current_user.is_super_admin:
            raise PermissionError("No tienes permisos para asignar rol Super Admin")
        if data.role_name == "gerencia":
            raise ValueError("El rol Gerencia se asigna automaticamente por departamento.")
        role = _get_or_create_role(session, data.role_name)
        if user.role_id != role.id:
            role_changed = True
        user.role_id = role.id

    if role_changed:
        user.tokens_valid_after = datetime.now(timezone.utc)

    session.add(user)
    session.commit()
    session.refresh(user)
    invalidate_user_me_cache(user.id)

    if role_changed:
        if previous_role_id:
            invalidate_role_permissions_cache(previous_role_id)
        if user.role_id:
            invalidate_role_permissions_cache(user.role_id)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=user.tenant_id,
        action="user.update",
        details=f"Actualización de usuario_id={user.id}",
    )

    role_name = None
    if user.role_id:
        role = session.get(Role, user.role_id)
        role_name = role.name if role else None

    return _user_to_read(user, role_name=role_name)


def create_user(
    session: Session,
    current_user: User,
    user_in: UserCreate,
) -> UserRead:
    """
    Crea un nuevo usuario global o por tenant.

    Se asume que el control de permisos (ej. solo Super Admin o tenant_admin)
    se aplica en la capa de rutas.
    """

    if not current_user.is_super_admin:
        if user_in.is_super_admin:
            raise PermissionError("Solo el Super Admin puede crear otro Super Admin")
        if user_in.tenant_id is None:
            raise PermissionError("Debes indicar un tenant para crear usuarios")
        if current_user.tenant_id != user_in.tenant_id:
            raise PermissionError("No tienes permisos para crear usuarios en otro tenant")
        if user_in.role_name == "super_admin":
            raise PermissionError("No tienes permisos para asignar rol Super Admin")

    if user_in.role_name:
        if user_in.role_name == "super_admin":
            if not current_user.is_super_admin or not user_in.is_super_admin:
                raise ValueError("Rol no permitido para este usuario")
        elif user_in.role_name == "gerencia":
            raise ValueError("El rol Gerencia se asigna automaticamente por departamento.")
        elif user_in.role_name not in OFFICIAL_NON_SUPERADMIN_ROLES:
            raise ValueError("Rol no permitido para este usuario")

    existing = session.exec(
        select(User).where(User.email == user_in.email),
    ).one_or_none()
    if existing:
        raise ValueError("Ya existe un usuario con ese email")

    role_id: int | None = None
    if user_in.role_name:
        role = _get_or_create_role(session, user_in.role_name)
        role_id = role.id

    # Todos los usuarios se crean activos; la desactivación se gestiona explícitamente
    # desde administración y no debe revertirse en login.
    is_active = True

    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=hash_password(user_in.password),
        tenant_id=user_in.tenant_id,
        is_super_admin=user_in.is_super_admin,
        role_id=role_id,
        is_active=is_active,
    )

    session.add(user)
    session.commit()
    session.refresh(user)
    invalidate_user_me_cache(user.id)

    # Si es un admin de tenant, intentamos enviar correo de bienvenida.
    if user.tenant_id and user_in.role_name == "tenant_admin":
        tenant = session.get(Tenant, user.tenant_id)
        if tenant:
            try:
                send_tenant_admin_welcome_email(
                    to_email=user.email,
                    tenant_name=tenant.name,
                    plain_password=user_in.password,
                )
            except Exception:
                # No rompemos la creación del usuario si el correo falla.
                pass

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=user.tenant_id,
        action="user.create",
        details=f"Usuario creado con email '{user.email}'",
    )

    return _user_to_read(user, role_name=user_in.role_name)


def delete_user(
    session: Session,
    current_user: User,
    user_id: int,
) -> None:
    """
    Elimina un usuario, aplicando reglas de acceso.
    """

    user = session.get(User, user_id)
    if not user:
        raise LookupError("Usuario no encontrado")

    # No permitimos borrar al Super Admin global
    if user.is_super_admin:
        raise PermissionError("No se puede eliminar al Super Admin global")

    # Reglas de acceso:
    # - Super Admin puede borrar cualquier usuario no-super-admin.
    # - Un tenant_admin solo puede borrar usuarios de su mismo tenant.
    if not current_user.is_super_admin:
        if current_user.tenant_id is None or current_user.tenant_id != user.tenant_id:
            raise PermissionError("No tienes permisos para eliminar este usuario")

    # Antes de borrar el usuario, desvinculamos sus registros de auditoría
    # para no perder el histórico pero evitar el error de clave foránea.
    logs = session.exec(
        select(AuditLog).where(AuditLog.user_id == user.id),
    ).all()
    for log in logs:
        log.user_id = None
        session.add(log)

    try:
        session.delete(user)
        session.commit()
        invalidate_user_me_cache(user.id)
    except IntegrityError:
        session.rollback()
        user.is_active = False
        session.add(user)
        session.commit()
        invalidate_user_me_cache(user.id)
        log_action(
            session,
            user_id=current_user.id,
            tenant_id=user.tenant_id,
            action="user.deactivate_on_delete_conflict",
            details=(
                "No se pudo eliminar por referencias relacionadas; "
                f"usuario desactivado con email '{user.email}'"
            ),
        )
        return

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=user.tenant_id,
        action="user.delete",
        details=f"Usuario eliminado con email '{user.email}'",
    )


def update_user_status(
    session: Session,
    current_user: User,
    user_id: int,
    data: UserStatusUpdate,
) -> UserRead:
    """
    Activa o desactiva un usuario, aplicando reglas de acceso similares a delete_user.
    """

    user = session.get(User, user_id)
    if not user:
        raise LookupError("Usuario no encontrado")

    # No permitimos desactivar al Super Admin global
    if user.is_super_admin:
        raise PermissionError("No se puede desactivar al Super Admin global")

    # Evita dejar sin sesión operativa al propio usuario administrador.
    if current_user.id == user.id and data.is_active is False:
        raise PermissionError("No puedes desactivar tu propio usuario.")

    # Reglas de acceso:
    # - Super Admin puede cambiar cualquier usuario no-super-admin.
    # - Un tenant_admin solo puede cambiar usuarios de su mismo tenant.
    if not current_user.is_super_admin:
        if current_user.tenant_id is None or current_user.tenant_id != user.tenant_id:
            raise PermissionError("No tienes permisos para actualizar este usuario")

    user.is_active = data.is_active
    session.add(user)
    session.commit()
    session.refresh(user)
    invalidate_user_me_cache(user.id)

    log_action(
        session,
        user_id=current_user.id,
        tenant_id=user.tenant_id,
        action="user.status_update",
        details=(
            f"Usuario {'activado' if data.is_active else 'desactivado'} con email "
            f"'{user.email}'"
        ),
    )

    return _user_to_read(user, role_name=_role_name_for(session, user))
