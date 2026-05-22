from pydantic import BaseModel


class MessageResponse(BaseModel):
    """
    Esquema genérico para respuestas simples tipo mensaje.
    """

    message: str

