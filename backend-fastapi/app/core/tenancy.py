from __future__ import annotations

from typing import Optional, Union

from fastapi import HTTPException, status

from app.models.user import User


def _parse_tenant_id(x_tenant_id: Optional[Union[int, str]]) -> Optional[int]:
    if x_tenant_id is None:
        return None
    if isinstance(x_tenant_id, int):
        return x_tenant_id
    if isinstance(x_tenant_id, str):
        candidate = x_tenant_id.strip()
        if candidate.isdigit():
            return int(candidate)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="X-Tenant-Id invalido.",
    )


def tenant_required_for_superadmin(
    current_user: User,
    x_tenant_id: Optional[Union[int, str]],
) -> int:
    """
    Resuelve tenant efectivo con reglas estrictas:
    - Superadmin: requiere X-Tenant-Id valido (int).
    - Usuario normal: usa current_user.tenant_id y valida mismatch.
    """

    if current_user.is_super_admin:
        tenant_id = _parse_tenant_id(x_tenant_id)
        if tenant_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Tenant-Id requerido para superadmin.",
            )
        return tenant_id

    if current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant requerido.",
        )

    if x_tenant_id is not None:
        tenant_id = _parse_tenant_id(x_tenant_id)
        if tenant_id is not None and tenant_id != current_user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="X-Tenant-Id no coincide con el tenant del usuario.",
            )

    return current_user.tenant_id
