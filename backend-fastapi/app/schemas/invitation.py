from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class UserInvitationCreate(BaseModel):
  """
  Datos para crear una invitación de usuario.

  Para super admin, `tenant_id` es obligatorio.
  Para tenant_admin se ignora y se usa su propio tenant.
  """

  email: EmailStr
  full_name: Optional[str] = None
  tenant_id: Optional[int] = None
  role_name: str


class UserInvitationRead(BaseModel):
  id: int
  email: EmailStr
  full_name: Optional[str] = None
  tenant_id: int
  role_name: str
  created_at: datetime
  expires_at: datetime
  used_at: Optional[datetime] = None


class UserInvitationValidateResponse(BaseModel):
  """
  Respuesta reducida para que el frontend pueda mostrar
  los datos básicos de la invitación antes de completarla.
  """

  email: EmailStr
  full_name: Optional[str] = None
  tenant_name: str
  role_name: str
  is_valid: bool
  is_used: bool
  is_expired: bool


class UserInvitationAccept(BaseModel):
  """
  Payload para aceptar una invitación.
  """

  token: str
  full_name: str
  password: str
  password_confirm: str
