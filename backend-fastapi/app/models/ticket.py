from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class TicketStatus(str, Enum):
    """
    Estado principal de un ticket de soporte.
    """

    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, Enum):
    """
    Prioridad del ticket. Permite priorizar el trabajo del equipo de soporte.
    """

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Ticket(SQLModel, table=True):
    """
    Ticket de soporte multi-tenant.

    Incluye campos de actividad y SLA básicos para uso empresarial.
    """

    id: Optional[int] = Field(default=None, primary_key=True)

    tenant_id: int = Field(
        foreign_key="tenant.id",
        index=True,
        description="Tenant al que pertenece el ticket",
    )
    created_by_id: int = Field(
        foreign_key="user.id",
        index=True,
        description="Usuario que crea el ticket",
    )
    assigned_to_id: Optional[int] = Field(
        default=None,
        foreign_key="user.id",
        index=True,
        description="Usuario asignado como agente responsable",
    )

    tool_slug: Optional[str] = Field(
        default=None,
        description="Herramienta afectada (ej. moodle, erp, plataforma)",
    )

    category: Optional[str] = Field(
        default=None,
        index=True,
        description=(
            "Categoría funcional del ticket (ERP, Moodle, Plataforma, "
            "Infraestructura, etc.)"
        ),
    )

    subject: str = Field(
        max_length=200,
        index=True,
        description="Asunto corto del ticket",
    )
    description: str = Field(description="Descripción detallada del problema")

    status: TicketStatus = Field(
        default=TicketStatus.OPEN,
        index=True,
        description="Estado actual del ticket",
    )
    priority: TicketPriority = Field(
        default=TicketPriority.MEDIUM,
        index=True,
        description="Prioridad del ticket",
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Actividad y SLA
    last_activity_at: datetime = Field(
        default_factory=datetime.utcnow,
        index=True,
        description="Última actividad registrada (mensaje, cambio de estado, asignación)",
    )
    first_response_at: Optional[datetime] = Field(
        default=None,
        description="Primera respuesta de un agente (tickets:manage) distinto del creador",
    )
    resolved_at: Optional[datetime] = Field(
        default=None,
        description="Momento en el que se marcó RESOLVED por primera vez",
    )
    closed_at: Optional[datetime] = Field(
        default=None,
        description="Momento en el que se cerró el ticket",
    )

    # Preparado para adjuntos futuros
    has_attachments: bool = Field(
        default=False,
        description="Marca si existen adjuntos asociados al ticket",
    )
