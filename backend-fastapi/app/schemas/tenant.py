from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TenantBase(BaseModel):
    name: str
    subdomain: str
    is_active: bool = True


class TenantCreate(TenantBase):
    """
    Esquema de creación de tenant.
    """


class TenantRead(TenantBase):
    """
    Esquema de lectura de tenant.
    """

    id: int
    created_at: datetime


class TenantUpdate(BaseModel):
    """
    Esquema de actualizaci?n de tenant (parcial).
    """

    name: Optional[str] = None
    subdomain: Optional[str] = None
    is_active: Optional[bool] = None
