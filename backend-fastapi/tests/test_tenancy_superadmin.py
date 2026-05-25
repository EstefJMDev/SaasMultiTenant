from fastapi import HTTPException

from app.core.tenancy import tenant_required_for_superadmin
from app.models.user import User


def _superadmin() -> User:
    return User(
        email="super@example.com",
        full_name="Super Admin",
        hashed_password="x",
        is_super_admin=True,
        tenant_id=None,
    )


def _tenant_user(tenant_id: int) -> User:
    return User(
        email="user@example.com",
        full_name="Tenant User",
        hashed_password="x",
        is_super_admin=False,
        tenant_id=tenant_id,
    )


def test_superadmin_requires_tenant_header() -> None:
    user = _superadmin()
    try:
        tenant_required_for_superadmin(user, None)
    except HTTPException as exc:
        assert exc.status_code == 400
        assert exc.detail == "X-Tenant-Id requerido para superadmin."
    else:
        raise AssertionError("Expected HTTPException for missing tenant header.")


def test_superadmin_accepts_valid_tenant_header() -> None:
    user = _superadmin()
    assert tenant_required_for_superadmin(user, "5") == 5


def test_superadmin_rejects_invalid_tenant_header() -> None:
    user = _superadmin()
    try:
        tenant_required_for_superadmin(user, "abc")
    except HTTPException as exc:
        assert exc.status_code == 400
        assert exc.detail == "X-Tenant-Id invalido."
    else:
        raise AssertionError("Expected HTTPException for invalid tenant header.")


def test_normal_user_uses_own_tenant() -> None:
    user = _tenant_user(7)
    assert tenant_required_for_superadmin(user, None) == 7


def test_normal_user_rejects_mismatched_tenant_header() -> None:
    user = _tenant_user(7)
    try:
        tenant_required_for_superadmin(user, "8")
    except HTTPException as exc:
        assert exc.status_code == 403
        assert exc.detail == "X-Tenant-Id no coincide con el tenant del usuario."
    else:
        raise AssertionError("Expected HTTPException for tenant mismatch.")
