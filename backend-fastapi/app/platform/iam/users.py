from pathlib import Path
from typing import List
from datetime import datetime, timezone
import logging
import re

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.api.deps import (
    get_current_active_user,
    require_permissions,
)
from app.db.session import get_session
from app.models.user import User
from app.core.config import settings
from app.schemas.user import (
    UserCreate,
    UserRead,
    UserUpdateAdmin,
    UserUpdateMe,
    UserStatusUpdate,
)
from app.services.user_service import (
    create_user as svc_create_user,
    get_user_me as svc_get_user_me,
    list_users_by_tenant as svc_list_users_by_tenant,
    delete_user as svc_delete_user,
    update_user_status as svc_update_user_status,
    update_user_me as svc_update_user_me,
    update_user_avatar as svc_update_user_avatar,
    update_user_admin as svc_update_user_admin,
)


router = APIRouter()
_AVATAR_NAME_RE = re.compile(r"^user_(\d+)\.(jpg|jpeg|png|webp)$", re.IGNORECASE)
logger = logging.getLogger(__name__)


@router.get("/avatar-files/{filename}")
def get_avatar_file(
    filename: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
):
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    match = _AVATAR_NAME_RE.match(safe_name)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")

    owner_user_id = int(match.group(1))
    owner = session.get(User, owner_user_id)
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    if not current_user.is_super_admin and owner.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para este recurso")

    file_path = Path(settings.avatars_storage_path) / safe_name
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    return FileResponse(path=file_path)


@router.get(
    "/me",
    response_model=UserRead,
    summary="Información del usuario autenticado",
)
def get_me(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UserRead:
    """
    Devuelve la información básica del usuario autenticado.
    """

    try:
        return svc_get_user_me(session=session, current_user=current_user)
    except Exception:
        logger.exception(
            "Error in /users/me fallback response",
            extra={
                "user_id": current_user.id,
                "tenant_id": current_user.tenant_id,
            },
        )
        # Fallback defensivo para evitar 500 por desajustes puntuales de permisos/roles.
        safe_email = (current_user.email or "").strip()
        if "@" not in safe_email:
            safe_email = f"user-{current_user.id or 0}@invalid.local"
        return UserRead(
            id=current_user.id or 0,
            email=safe_email,
            full_name=current_user.full_name or safe_email,
            is_active=bool(current_user.is_active),
            is_super_admin=current_user.is_super_admin,
            tenant_id=current_user.tenant_id,
            role_id=current_user.role_id,
            role_name=None,
            permissions=[],
            language=current_user.language or "en",
            avatar_url=current_user.avatar_url,
            created_at=current_user.created_at or datetime.now(timezone.utc),
        )


@router.patch(
    "/me",
    response_model=UserRead,
    summary="Actualizar perfil del usuario autenticado",
)
def update_me(
    payload: UserUpdateMe,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UserRead:
    """
    Permite al usuario autenticado actualizar sus datos básicos de perfil.
    """

    return svc_update_user_me(
        session=session,
        current_user=current_user,
        data=payload,
    )


@router.post(
    "/me/avatar",
    response_model=UserRead,
    summary="Subir foto de perfil",
)
def upload_my_avatar(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UserRead:
    """
    Permite al usuario autenticado subir su foto de perfil.
    """

    try:
        return svc_update_user_avatar(
            session=session,
            current_user=current_user,
            upload=file,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/by-tenant/{tenant_id}",
    response_model=List[UserRead],
    summary="Listar usuarios de un tenant",
)
def list_users_by_tenant(
    tenant_id: int,
    exclude_assigned: bool = False,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:read"])),
) -> list[UserRead]:
    """
    Lista usuarios de un tenant concreto.
    """

    try:
        return svc_list_users_by_tenant(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
            exclude_assigned=exclude_assigned,
            limit=limit,
            offset=offset,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear usuario (global o por tenant)",
)
def create_user(
    payload: UserCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:create"])),
) -> UserRead:
    """
    Crea un nuevo usuario global o asociado a un tenant.
    """

    try:
        return svc_create_user(
            session=session,
            current_user=current_user,
            user_in=payload,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar usuario",
)
def delete_user_endpoint(
    user_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:delete"])),
) -> None:
    """
    Elimina un usuario. No permite borrar al Super Admin global.
    """

    try:
        return svc_delete_user(
            session=session,
            current_user=current_user,
            user_id=user_id,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{user_id}",
    response_model=UserRead,
    summary="Editar usuario",
)
def update_user_endpoint(
    user_id: int,
    payload: UserUpdateAdmin,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:update"])),
) -> UserRead:
    """
    Actualiza datos b?sicos de un usuario (admin).
    """

    try:
        return svc_update_user_admin(
            session=session,
            current_user=current_user,
            user_id=user_id,
            data=payload,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.patch(
    "/{user_id}/status",
    response_model=UserRead,
    summary="Activar o desactivar usuario",
)
def update_user_status_endpoint(
    user_id: int,
    payload: UserStatusUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:update"])),
) -> UserRead:
    """
    Actualiza el estado de activación de un usuario.
    """

    try:
        return svc_update_user_status(
            session=session,
            current_user=current_user,
            user_id=user_id,
            data=payload,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
