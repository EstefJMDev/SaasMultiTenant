from typing import Annotated
import secrets
import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlmodel import Session, select

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_session
from app.models.user import User
from app.schemas.auth import LoginResponse, MFAVerifyRequest, MFAVerifyResponse
from app.schemas.password import ChangePasswordRequest
from app.services.auth_service import (
    MFAThrottleError,
    _build_mfa_trust_token,
    change_password,
    login_step1,
    login_step2_verify_mfa,
)


router = APIRouter()


def _cookie_secure() -> bool:
    # En produccion se fuerza secure=True aunque no venga configurado.
    return settings.auth_cookie_secure or settings.env != "local"


def _set_csrf_cookie(response: Response) -> None:
    csrf_token = secrets.token_urlsafe(32)
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf_token,
        httponly=False,
        secure=_cookie_secure(),
        samesite=settings.auth_cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
    )


def _get_user_by_email(session: Session, email: str) -> User | None:
    normalized = (email or "").strip().lower()
    if not normalized:
        return None
    return session.exec(
        select(User).where(func.lower(User.email) == normalized),
    ).one_or_none()


def _normalize_login_identifier(raw_identifier: str | None) -> str:
    normalized = (raw_identifier or "").strip().lower()
    if not normalized:
        return ""
    # Redis key-safe token to avoid unbounded/surprising key shapes.
    key_safe = re.sub(r"[^a-z0-9._@+-]", "_", normalized)
    return key_safe[:128]


@router.post(
    "/login",
    summary="Login con usuario y contrasena",
    response_model=LoginResponse,
)
def login(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Session = Depends(get_session),
) -> LoginResponse:
    """
    Paso 1 del login:
    - Verificamos email/usuario + contrasena.
    - Si requiere MFA, no devuelve token, solo indica `mfa_required=True`.
    """

    enforce_rate_limit(request, key="auth_login", limit=5, window_seconds=60)
    login_identifier = _normalize_login_identifier(form_data.username)
    if login_identifier:
        # Additional rate limit by email to mitigate distributed brute force.
        enforce_rate_limit(
            request,
            key=f"auth_login_email:{login_identifier}",
            limit=8,
            window_seconds=300,
        )

    try:
        trust_cookie = request.cookies.get(settings.mfa_trust_cookie_name)
        result = login_step1(
            session,
            email=form_data.username,
            password=form_data.password,
            mfa_trust_token=trust_cookie,
        )
        if result.access_token:
            response.set_cookie(
                settings.auth_cookie_name,
                result.access_token,
                httponly=True,
                secure=_cookie_secure(),
                samesite=settings.auth_cookie_samesite,
                max_age=settings.access_token_expire_minutes * 60,
            )
            _set_csrf_cookie(response)
            user = _get_user_by_email(session, form_data.username)
            if user and not user.is_super_admin:
                response.set_cookie(
                    settings.mfa_trust_cookie_name,
                    _build_mfa_trust_token(user),
                    httponly=True,
                    secure=_cookie_secure(),
                    samesite=settings.auth_cookie_samesite,
                    max_age=settings.mfa_trust_hours * 3600,
                )
        return result
    except ValueError as exc:
        if isinstance(exc, MFAThrottleError):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=str(exc),
                headers={"Retry-After": str(exc.retry_after_seconds)},
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/mfa/verify",
    summary="Verificacion MFA (TOTP)",
    response_model=MFAVerifyResponse,
)
def verify_mfa(
    request: Request,
    response: Response,
    body: MFAVerifyRequest,
    session: Session = Depends(get_session),
) -> MFAVerifyResponse:
    """
    Paso 2 del login para usuarios con MFA.
    """

    enforce_rate_limit(request, key="auth_mfa_verify", limit=30, window_seconds=300)

    try:
        result = login_step2_verify_mfa(
            session,
            username=body.username,
            mfa_code=body.mfa_code,
        )
        response.set_cookie(
            settings.auth_cookie_name,
            result.access_token,
            httponly=True,
            secure=_cookie_secure(),
            samesite=settings.auth_cookie_samesite,
            max_age=settings.access_token_expire_minutes * 60,
        )
        _set_csrf_cookie(response)
        user = _get_user_by_email(session, body.username)
        if user and not user.is_super_admin:
            response.set_cookie(
                settings.mfa_trust_cookie_name,
                _build_mfa_trust_token(user),
                httponly=True,
                secure=_cookie_secure(),
                samesite=settings.auth_cookie_samesite,
                max_age=settings.mfa_trust_hours * 3600,
            )
        return result
    except ValueError as exc:
        if isinstance(exc, MFAThrottleError):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=str(exc),
                headers={"Retry-After": str(exc.retry_after_seconds)},
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cambiar contrasena del propio usuario",
)
def change_my_password(
    body: ChangePasswordRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    try:
        return change_password(session=session, user=current_user, data=body)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cerrar sesion y limpiar cookie",
)
def logout(response: Response) -> None:
    response.delete_cookie(
        settings.auth_cookie_name,
        httponly=True,
        secure=_cookie_secure(),
        samesite=settings.auth_cookie_samesite,
    )
    response.delete_cookie(
        settings.mfa_trust_cookie_name,
        httponly=True,
        secure=_cookie_secure(),
        samesite=settings.auth_cookie_samesite,
    )
    response.delete_cookie(
        settings.csrf_cookie_name,
        httponly=False,
        secure=_cookie_secure(),
        samesite=settings.auth_cookie_samesite,
    )
