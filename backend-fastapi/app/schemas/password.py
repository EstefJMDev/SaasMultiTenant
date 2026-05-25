from pydantic import BaseModel, Field


class ChangePasswordRequest(BaseModel):
    """
    Esquema para el cambio de contraseña del propio usuario.
    """

    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=12)
    new_password_confirm: str = Field(..., min_length=12)
