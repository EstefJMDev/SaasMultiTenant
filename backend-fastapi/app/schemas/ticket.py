from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel

from app.models.ticket import TicketPriority, TicketStatus


class TicketBase(SQLModel):
    """
    Campos base para creación/edición de tickets.
    """

    subject: str
    description: str
    tool_slug: Optional[str] = None
    category: Optional[str] = None


class TicketCreate(TicketBase):
    """
    Payload de creación de ticket.
    """

    priority: Optional[TicketPriority] = None


class TicketUpdate(SQLModel):
    """
    Actualización parcial de campos del ticket.
    """

    status: Optional[TicketStatus] = None
    priority: Optional[TicketPriority] = None
    assigned_to_id: Optional[int] = None


class TicketRead(SQLModel):
    """
    Esquema de lectura de ticket, pensado para listados y detalle.
    """

    id: int
    tenant_id: int
    subject: str
    status: TicketStatus
    priority: TicketPriority
    tool_slug: Optional[str]
    category: Optional[str]
    created_at: datetime
    updated_at: datetime

    # Actividad y SLA
    last_activity_at: datetime
    first_response_at: Optional[datetime]
    resolved_at: Optional[datetime]
    closed_at: Optional[datetime]
    has_attachments: bool

    created_by_email: str
    assigned_to_email: Optional[str]


class TicketMessageCreate(SQLModel):
    """
    Payload para añadir mensajes a un ticket.
    """

    body: str
    is_internal: bool = False


class TicketMessageRead(SQLModel):
    """
    Esquema de lectura de un mensaje de ticket.
    """

    id: int
    author_email: str
    body: str
    is_internal: bool
    created_at: datetime
