from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class TicketMessage(SQLModel, table=True):
    """
    Mensaje dentro de un ticket de soporte.

    Puede ser un mensaje visible para el usuario o una nota interna
    solo para el equipo (según `is_internal`).
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    ticket_id: int = Field(
        foreign_key="ticket.id",
        index=True,
        description="Ticket al que pertenece el mensaje",
    )
    author_id: int = Field(
        foreign_key="user.id",
        index=True,
        description="Usuario que escribe el mensaje",
    )

    body: str = Field(description="Contenido del mensaje")

    is_internal: bool = Field(
        default=False,
        description=(
            "Si es True, el mensaje es una nota interna y "
            "solo es visible para Super Admin y usuarios con permisos de gestión"
        ),
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)

