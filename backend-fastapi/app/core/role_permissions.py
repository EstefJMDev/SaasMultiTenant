from sqlmodel import Session, select

from app.core.permission_cache import get_role_permissions_cache, set_role_permissions_cache
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.user import User


def collect_user_permission_codes(session: Session, user: User) -> set[str]:
    if not user.role_id:
        return set()

    cached_permissions = get_role_permissions_cache(user.role_id)
    if cached_permissions is not None:
        return cached_permissions

    try:
        statement = (
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .where(RolePermission.role_id == user.role_id)
        )
        permissions: set[str] = set()
        for row in session.exec(statement).all():
            if isinstance(row, str):
                permissions.add(row)
            elif row and row[0]:
                permissions.add(row[0])
        set_role_permissions_cache(user.role_id, permissions)
        return permissions
    except Exception:
        # Evita error 500 en entornos con esquema parcial/desalineado.
        return set()
