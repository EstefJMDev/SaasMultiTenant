from sqlmodel import Field, SQLModel


class TicketParticipant(SQLModel, table=True):
    """
    Participantes de un ticket.

    Permite controlar visibilidad avanzada y preparar notificaciones futuras.
    """

    ticket_id: int = Field(
        foreign_key="ticket.id",
        primary_key=True,
        description="Ticket en el que participa el usuario",
    )
    user_id: int = Field(
        foreign_key="user.id",
        primary_key=True,
        description="Usuario participante",
    )

    is_watcher: bool = Field(
        default=False,
        description="Indica si el usuario solo observa el ticket",
    )

