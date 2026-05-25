
from sqlmodel import Session, select

from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.ticket import Ticket
from app.models.ticket_message import TicketMessage
from app.models.ticket_participant import TicketParticipant
from app.models.user import User


def get_user_permission_codes(session: Session, user: User) -> set[str]:
    if not user.role_id:
        return set()
    statement = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == user.role_id)
    )
    return {row[0] for row in session.exec(statement).all()}


def list_tenant_users(session: Session, tenant_id: int) -> list[User]:
    return session.exec(
        select(User).where(User.tenant_id == tenant_id, User.is_active.is_(True)),
    ).all()


def list_superadmins(session: Session) -> list[User]:
    return session.exec(
        select(User).where(User.is_super_admin.is_(True), User.is_active.is_(True)),
    ).all()


def list_ticket_participant_ids(session: Session, ticket_id: int) -> set[int]:
    statement = select(TicketParticipant.user_id).where(
        TicketParticipant.ticket_id == ticket_id,
    )
    return {row for row in session.exec(statement).all()}


def get_role(session: Session, role_id: int | None) -> Role | None:
    if role_id is None:
        return None
    return session.get(Role, role_id)


def get_ticket(session: Session, ticket_id: int) -> Ticket | None:
    return session.get(Ticket, ticket_id)


def get_ticket_participant(
    session: Session,
    ticket_id: int,
    user_id: int,
) -> TicketParticipant | None:
    return session.get(TicketParticipant, (ticket_id, user_id))


def list_ticket_messages(
    session: Session,
    ticket_id: int,
    *,
    include_internal: bool,
) -> list[TicketMessage]:
    statement = select(TicketMessage).where(TicketMessage.ticket_id == ticket_id)
    if not include_internal:
        statement = statement.where(TicketMessage.is_internal.is_(False))
    return session.exec(statement.order_by(TicketMessage.created_at.asc())).all()


def list_tickets_with_statement(
    session: Session,
    statement,
) -> list[Ticket]:
    return session.exec(statement).all()
