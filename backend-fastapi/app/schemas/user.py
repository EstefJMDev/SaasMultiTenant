from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    is_active: bool = True
    is_super_admin: bool = False


class UserCreate(BaseModel):
    """
    Esquema de entrada para crear usuarios.
    """

    email: EmailStr
    full_name: str
    password: str
    tenant_id: int | None = None
    is_super_admin: bool = False
    # Nombre de rol lógico (super_admin, tenant_admin, gerencia, user).
    role_name: str | None = None


class UserRead(UserBase):
    """
    Esquema de lectura de usuario.
    """

    id: int
    tenant_id: int | None
    role_id: int | None
    role_name: str | None = None
    permissions: list[str] = Field(default_factory=list)
    language: str | None = None
    avatar_url: str | None = None
    department_nav_config: dict[str, bool] | None = None
    created_at: datetime
    # Flags derivados de Position (organigrama) - UNION sobre posiciones activas.
    position_id: int | None = None
    position_name: str | None = None
    can_create_comparative: bool = False
    can_edit_comparative: bool = False
    can_delete_comparative: bool = False
    can_approve_comparative: bool = False
    can_reject_comparative: bool = False
    can_view_all_comparatives: bool = False
    full_approver: bool = False
    # Flags caps contrato (OR entre Department y Position).
    can_view_contract: bool = False
    can_edit_contract: bool = False
    can_regenerate_contract: bool = False
    can_approve_contract: bool = False
    can_reject_contract: bool = False
    can_view_worksite: bool = False
    can_edit_worksite: bool = False
    can_view_provider: bool = False
    can_edit_provider: bool = False


class UserUpdateMe(BaseModel):
    """
    Esquema de actualización del propio usuario.
    Solo permite cambiar datos básicos de perfil.
    """

    full_name: str
    language: str | None = None
    avatar_url: str | None = None


class UserStatusUpdate(BaseModel):
    """
    Esquema para activar o desactivar un usuario.
    """

    is_active: bool


class UserUpdateAdmin(BaseModel):
    """
    Esquema para editar usuarios desde administraci?n.
    """

    email: EmailStr | None = None
    full_name: str | None = None
    role_name: str | None = None
