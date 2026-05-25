from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.api.deps import require_permissions
from app.db.session import get_session
from app.models.user import User
from app.schemas.invitation import (
    UserInvitationAccept,
    UserInvitationCreate,
    UserInvitationRead,
    UserInvitationValidateResponse,
)
from app.services.invitation_service import (
    accept_invitation,
    create_user_invitation,
    validate_invitation,
)


router = APIRouter()


@router.post(
    "",
    response_model=UserInvitationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear invitación de usuario",
)
def api_create_invitation(
    body: UserInvitationCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions(["users:create"])),
) -> UserInvitationRead:
    """
    Crea una invitación para dar de alta un usuario por email.
    """

    try:
        return create_user_invitation(session=session, current_user=current_user, data=body)
    except (ValueError, PermissionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/validate",
    response_model=UserInvitationValidateResponse,
    summary="Validar token de invitación",
)
def api_validate_invitation(
    token: str = Query(..., description="Token de invitación recibido por email"),
    session: Session = Depends(get_session),
) -> UserInvitationValidateResponse:
    """
    Devuelve información reducida sobre una invitación.
    No requiere autenticación.
    """

    try:
        return validate_invitation(session=session, token=token)
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


@router.post(
    "/accept",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Aceptar invitación y crear usuario",
)
def api_accept_invitation(
    body: UserInvitationAccept,
    session: Session = Depends(get_session),
) -> None:
    """
    Acepta una invitación, creando el usuario asociado.
    No requiere autenticación previa.
    """

    try:
        return accept_invitation(session=session, data=body)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

