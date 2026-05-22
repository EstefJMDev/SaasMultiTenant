import json
from typing import Optional
from pathlib import Path
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.core.config import settings
from app.models.user import User
from app.models.tenant_branding import TenantBranding
from app.schemas.branding import BrandingRead
from app.services.branding_service import (
    build_palette,
    resolve_branding,
    resolve_logo_path,
    update_branding,
)


router = APIRouter()
_LOGO_NAME_RE = re.compile(r"^tenant_(\d+)\.(jpg|jpeg|png|webp|svg)$", re.IGNORECASE)


def _ensure_tenant_access(current_user: User, tenant_id: int) -> None:
    if current_user.is_super_admin:
        return
    if current_user.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para gestionar este tenant",
        )


@router.get("/logo-files/{filename}")
def get_logo_file(
    filename: str,
    current_user: User = Depends(get_current_active_user),
):
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    match = _LOGO_NAME_RE.match(safe_name)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    logo_tenant_id = int(match.group(1))
    _ensure_tenant_access(current_user, logo_tenant_id)

    file_path = Path(settings.logos_storage_path) / safe_name
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    return FileResponse(path=file_path)


@router.get("/{tenant_id}", response_model=BrandingRead)
def get_branding(
    tenant_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> BrandingRead:
    _ensure_tenant_access(current_user, tenant_id)
    accent_color, logo_path = resolve_branding(session, tenant_id)
    branding = session.exec(
        select(TenantBranding).where(TenantBranding.tenant_id == tenant_id),
    ).one_or_none()
    return BrandingRead(
        logo=resolve_logo_path(logo_path),
        color_palette=build_palette(accent_color),
        accent_color=accent_color,
        company_name=branding.company_name if branding else None,
        company_subtitle=branding.company_subtitle if branding else None,
        show_company_name=branding.show_company_name if branding else True,
        show_company_subtitle=branding.show_company_subtitle if branding else True,
        department_emails=branding.department_emails if branding else None,
        updated_at=branding.updated_at if branding else None,
    )


@router.put(
    "/{tenant_id}",
    response_model=BrandingRead,
)
def update_branding_endpoint(
    tenant_id: int,
    accent_color: Optional[str] = Form(default=None),
    company_name: Optional[str] = Form(default=None),
    company_subtitle: Optional[str] = Form(default=None),
    show_company_name: Optional[bool] = Form(default=None),
    show_company_subtitle: Optional[bool] = Form(default=None),
    department_emails: Optional[str] = Form(default=None),
    logo: Optional[UploadFile] = File(default=None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> BrandingRead:
    _ensure_tenant_access(current_user, tenant_id)
    parsed_department_emails = None
    if department_emails is not None:
        try:
            parsed_department_emails = json.loads(department_emails) or {}
            if not isinstance(parsed_department_emails, dict):
                raise ValueError("department_emails debe ser un objeto")
        except (ValueError, TypeError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Formato inválido para department_emails",
            ) from exc
    try:
        branding = update_branding(
            session,
            tenant_id,
            accent_color,
            logo,
            company_name,
            company_subtitle,
            show_company_name,
            show_company_subtitle,
            parsed_department_emails,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return BrandingRead(
        logo=resolve_logo_path(branding.logo_path),
        color_palette=build_palette(branding.accent_color),
        accent_color=branding.accent_color,
        company_name=branding.company_name,
        company_subtitle=branding.company_subtitle,
        show_company_name=branding.show_company_name,
        show_company_subtitle=branding.show_company_subtitle,
        department_emails=branding.department_emails,
        updated_at=branding.updated_at,
    )
