from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, SQLModel

from app.core.db import get_db
from app.core.permissions import (
    TICKETS_CREATE,
    TICKETS_MANAGE,
    TICKETS_READ_OWN,
)
from app.domains.tickets.deps import mark_legacy_tickets_alias, require_tickets_tool
from app.domains.tickets.schemas import (
    TicketCreate,
    TicketMessageCreate,
    TicketMessageRead,
    TicketRead,
    TicketUpdate,
)
from app.domains.tickets.service import (
    add_message,
    assign_ticket,
    close_ticket,
    create_ticket,
    get_ticket,
    list_messages,
    list_tickets,
    reopen_ticket,
    update_ticket,
)
from app.models.ticket import TicketPriority, TicketStatus
from app.models.user import User
from app.platform.tools.deps import require_perm


base_router = APIRouter()
router = APIRouter(dependencies=[Depends(require_tickets_tool)])


@base_router.get("", response_model=List[TicketRead], summary="Listar tickets de soporte")
def api_list_tickets(
    tenant_id: Optional[int] = Query(
        default=None,
        description="Filtrar por ID de tenant (solo Super Admin).",
    ),
    status: Optional[TicketStatus] = Query(
        default=None,
        description="Filtrar por estado",
    ),
    priority: Optional[TicketPriority] = Query(
        default=None,
        description="Filtrar por prioridad",
    ),
    tool_slug: Optional[str] = Query(
        default=None,
        description="Filtrar por herramienta afectada",
    ),
    mine_only: bool = Query(
        default=False,
        description="Si es True, devuelve solo tickets creados por el usuario",
    ),
    limit: int = Query(
        default=50,
        ge=1,
        le=200,
        description="Número máximo de tickets a devolver",
    ),
    offset: int = Query(
        default=0,
        ge=0,
        description="Desplazamiento para paginación",
    ),
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm(TICKETS_READ_OWN)),
) -> List[TicketRead]:
    """
    Lista tickets visibles para el usuario actual, aplicando paginación y filtros.
    """

    try:
        return list_tickets(
            session=session,
            current_user=current_user,
            tenant_id=tenant_id,
            status=status,
            priority=priority,
            tool_slug=tool_slug,
            mine_only=mine_only,
            limit=limit,
            offset=offset,
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@base_router.post(
    "",
    response_model=TicketRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un ticket de soporte",
)
def api_create_ticket(
    data: TicketCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm(TICKETS_CREATE)),
) -> TicketRead:
    """
    Crea un nuevo ticket de soporte asociado al tenant actual del usuario.
    """

    try:
        return create_ticket(session=session, current_user=current_user, data=data)
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@base_router.get("/{ticket_id}", response_model=TicketRead, summary="Obtener detalle de un ticket")
def api_get_ticket(
    ticket_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm(TICKETS_READ_OWN)),
) -> TicketRead:
    """
    Devuelve el detalle de un ticket concreto.
    """

    try:
        return get_ticket(session=session, current_user=current_user, ticket_id=ticket_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@base_router.patch("/{ticket_id}", response_model=TicketRead, summary="Actualizar campos de un ticket")
def api_update_ticket(
    ticket_id: int,
    data: TicketUpdate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm(TICKETS_MANAGE)),
) -> TicketRead:
    """
    Actualización parcial de un ticket (estado, prioridad, asignación).
    """

    try:
        return update_ticket(
            session=session,
            current_user=current_user,
            ticket_id=ticket_id,
            data=data,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@base_router.post("/{ticket_id}/close", response_model=TicketRead, summary="Cerrar un ticket")
def api_close_ticket(
    ticket_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm(TICKETS_MANAGE)),
) -> TicketRead:
    """
    Marca un ticket como cerrado.
    """

    try:
        return close_ticket(session=session, current_user=current_user, ticket_id=ticket_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@base_router.post("/{ticket_id}/reopen", response_model=TicketRead, summary="Reabrir un ticket")
def api_reopen_ticket(
    ticket_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm(TICKETS_MANAGE)),
) -> TicketRead:
    """
    Reabre un ticket previamente resuelto/cerrado.
    """

    try:
        return reopen_ticket(
            session=session,
            current_user=current_user,
            ticket_id=ticket_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


class AssignPayload(SQLModel):
    """
    Payload para asignar un ticket a un usuario.
    """

    assignee_id: int


@base_router.post("/{ticket_id}/assign", response_model=TicketRead, summary="Asignar ticket a un usuario")
def api_assign_ticket(
    ticket_id: int,
    payload: AssignPayload,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm(TICKETS_MANAGE)),
) -> TicketRead:
    """
    Asigna el ticket a un usuario del tenant.
    """

    try:
        return assign_ticket(
            session=session,
            current_user=current_user,
            ticket_id=ticket_id,
            assignee_id=payload.assignee_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@base_router.get(
    "/{ticket_id}/messages",
    response_model=List[TicketMessageRead],
    summary="Listar mensajes de un ticket",
)
def api_list_messages(
    ticket_id: int,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm(TICKETS_READ_OWN)),
) -> List[TicketMessageRead]:
    """
    Devuelve la conversación de un ticket.
    """

    try:
        return list_messages(
            session=session,
            current_user=current_user,
            ticket_id=ticket_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


@base_router.post(
    "/{ticket_id}/messages",
    response_model=TicketMessageRead,
    status_code=status.HTTP_201_CREATED,
    summary="Añadir mensaje a un ticket",
)
def api_add_message(
    ticket_id: int,
    data: TicketMessageCreate,
    session: Session = Depends(get_db),
    current_user: User = Depends(require_perm(TICKETS_READ_OWN)),
) -> TicketMessageRead:
    """
    Añade un mensaje (o nota interna) a un ticket.
    """

    try:
        return add_message(
            session=session,
            current_user=current_user,
            ticket_id=ticket_id,
            data=data,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


router.include_router(
    base_router,
    prefix="/tickets",
    tags=["tickets"],
)
router.include_router(
    base_router,
    prefix="/tickets-legacy",
    tags=["tickets"],
    deprecated=True,
    dependencies=[Depends(mark_legacy_tickets_alias)],
)
