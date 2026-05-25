from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

from sqlmodel import Session, select

from app.core.config import settings
from app.models.tenant import Tenant
from app.models.tenant_branding import TenantBranding
from app.storage.local import save_logo_to_disk


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    value = hex_color.lstrip("#")
    if len(value) != 6:
        raise ValueError("Color inválido. Usa formato #RRGGBB.")
    r = int(value[0:2], 16) / 255.0
    g = int(value[2:4], 16) / 255.0
    b = int(value[4:6], 16) / 255.0
    return r, g, b


def _rgb_to_hex(r: float, g: float, b: float) -> str:
    return "#{:02x}{:02x}{:02x}".format(
        int(round(r * 255)),
        int(round(g * 255)),
        int(round(b * 255)),
    )


def _mix_rgb(
    base: tuple[float, float, float],
    target: tuple[float, float, float],
    ratio: float,
) -> tuple[float, float, float]:
    return (
        base[0] + (target[0] - base[0]) * ratio,
        base[1] + (target[1] - base[1]) * ratio,
        base[2] + (target[2] - base[2]) * ratio,
    )


def build_palette(accent_color: str) -> Dict[str, str]:
    """
    Genera paleta con la misma relación siempre:
    - 50..400: mezcla del color con blanco (más claro)
    - 600..900: mezcla del color con negro (más oscuro)
    - 500: color exacto elegido
    """

    base = _hex_to_rgb(accent_color)
    white = (1.0, 1.0, 1.0)
    black = (0.0, 0.0, 0.0)

    # Ratios calibrados con la paleta URDECON (#00662b)
    # para mantener la misma relación entre tonos.
    light_mix = {
        "50": 0.9227,
        "100": 0.8365,
        "200": 0.6845,
        "300": 0.5216,
        "400": 0.3582,
    }
    dark_mix = {
        "600": 0.1794,
        "700": 0.3540,
        "800": 0.4973,
        "900": 0.6504,
    }

    palette: Dict[str, str] = {}
    for key, ratio in light_mix.items():
        r, g, b = _mix_rgb(base, white, ratio)
        palette[key] = _rgb_to_hex(r, g, b)

    palette["500"] = accent_color.lower()

    for key, ratio in dark_mix.items():
        r, g, b = _mix_rgb(base, black, ratio)
        palette[key] = _rgb_to_hex(r, g, b)

    return palette


def get_branding(session: Session, tenant_id: int) -> TenantBranding | None:
    return session.exec(
        select(TenantBranding).where(TenantBranding.tenant_id == tenant_id),
    ).one_or_none()


def ensure_tenant_exists(session: Session, tenant_id: int) -> None:
    tenant = session.get(Tenant, tenant_id)
    if not tenant:
        raise LookupError("Tenant no encontrado")


def resolve_branding(
    session: Session,
    tenant_id: int,
) -> tuple[str, Optional[str]]:
    branding = get_branding(session, tenant_id)
    if branding:
        return branding.accent_color, resolve_logo_path(branding.logo_path)
    return settings.default_brand_accent_color, None


def resolve_logo_path(logo_path: Optional[str]) -> Optional[str]:
    if not logo_path:
        return None
    if "/api/v1/branding/logo-files/" in logo_path:
        return logo_path
    if "/static/logos/" not in logo_path:
        return logo_path
    filename = logo_path.rsplit("/", 1)[-1]
    file_path = Path(settings.logos_storage_path) / filename
    if not file_path.exists():
        return None
    return f"/api/v1/branding/logo-files/{filename}"


def update_branding(
    session: Session,
    tenant_id: int,
    accent_color: Optional[str],
    logo_upload,
    company_name: Optional[str],
    company_subtitle: Optional[str],
    show_company_name: Optional[bool] = None,
    show_company_subtitle: Optional[bool] = None,
    department_emails: Optional[Dict[str, str]] = None,
) -> TenantBranding:
    ensure_tenant_exists(session, tenant_id)

    branding = get_branding(session, tenant_id)
    if branding is None:
        branding = TenantBranding(tenant_id=tenant_id)

    if accent_color:
        if not accent_color.startswith("#"):
            raise ValueError("El color debe estar en formato #RRGGBB")
        _hex_to_rgb(accent_color)
        branding.accent_color = accent_color.lower()

    if company_name is not None:
        branding.company_name = company_name.strip() or None

    if company_subtitle is not None:
        branding.company_subtitle = company_subtitle.strip() or None

    if show_company_name is not None:
        branding.show_company_name = bool(show_company_name)

    if show_company_subtitle is not None:
        branding.show_company_subtitle = bool(show_company_subtitle)

    if department_emails is not None:
        cleaned: Dict[str, str] = {}
        for raw_key, raw_email in department_emails.items():
            key = (raw_key or "").strip()
            email = (raw_email or "").strip()
            if not key or not email:
                continue
            if "@" not in email:
                raise ValueError(f"Email inválido para '{key}'")
            cleaned[key] = email
        branding.department_emails = cleaned or None

    if logo_upload is not None:
        content_type = getattr(logo_upload, "content_type", None) or ""
        filename = (logo_upload.filename or "").lower()
        ext_map = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/svg+xml": "svg",
            "image/jpg": "jpg",
        }
        extension = ext_map.get(content_type)
        if not extension and "." in filename:
            extension = filename.rsplit(".", 1)[-1]
        if extension == "jpeg":
            extension = "jpg"
        if extension not in {"jpg", "png", "webp", "svg"}:
            raise ValueError("Formato de logo no soportado (jpeg, png, webp, svg)")
        target_path = save_logo_to_disk(logo_upload, tenant_id, extension)
        branding.logo_path = f"/api/v1/branding/logo-files/{target_path.name}"

    branding.updated_at = datetime.now(timezone.utc)
    session.add(branding)
    session.commit()
    session.refresh(branding)
    return branding
