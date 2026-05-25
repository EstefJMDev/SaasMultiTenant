from typing import Optional, Union

from sqlmodel import Session

from app.models.user import User
from app.core.tenancy import tenant_required_for_superadmin


def tenant_for_write(
    current_user: User,
    x_tenant_id: Optional[Union[int, str]],
    session: Session,
) -> int:
    return tenant_required_for_superadmin(current_user, x_tenant_id)
