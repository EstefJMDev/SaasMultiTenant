from pydantic import BaseModel, EmailStr


class LoginResponse(BaseModel):
    """
    Respuesta del endpoint de login (primer paso).
    """

    access_token: str | None = None
    token_type: str | None = None
    mfa_required: bool
    message: str | None = None


class MFAVerifyRequest(BaseModel):
    """
    Cuerpo de la petición para verificar MFA (paso 2).
    """

    username: EmailStr
    mfa_code: str


class MFAVerifyResponse(BaseModel):
    """
    Respuesta tras verificar MFA correctamente.
    """

    access_token: str
    token_type: str
    mfa_required: bool

