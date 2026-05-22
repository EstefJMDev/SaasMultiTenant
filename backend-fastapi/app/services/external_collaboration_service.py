from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from app.models.erp import ExternalCollaboration
from app.schemas.erp import ExternalCollaborationCreate, ExternalCollaborationUpdate


def list_external_collaborations(
    session: Session, tenant_id: Optional[int]
) -> list[ExternalCollaboration]:
    stmt = select(ExternalCollaboration).order_by(ExternalCollaboration.created_at.desc())
    if tenant_id is not None:
        stmt = stmt.where(ExternalCollaboration.tenant_id == tenant_id)
    return session.exec(stmt).all()


def create_external_collaboration(
    session: Session, data: ExternalCollaborationCreate, tenant_id: Optional[int]
) -> ExternalCollaboration:
    name = data.name.strip()
    legal_name = data.legal_name.strip()
    cif = data.cif.strip()
    contact_email = data.contact_email.strip()
    collaboration_type = data.collaboration_type.strip()
    if not name or not legal_name or not cif or not contact_email or not collaboration_type:
        raise ValueError("Todos los campos son obligatorios.")

    now = datetime.now(timezone.utc)
    collaboration = ExternalCollaboration(
        tenant_id=tenant_id,
        collaboration_type=collaboration_type,
        name=name,
        legal_name=legal_name,
        cif=cif,
        contact_email=contact_email,
        created_at=now,
        updated_at=now,
    )
    session.add(collaboration)
    session.commit()
    session.refresh(collaboration)
    return collaboration


def update_external_collaboration(
    session: Session,
    collaboration_id: int,
    data: ExternalCollaborationUpdate,
    tenant_id: Optional[int],
) -> ExternalCollaboration:
    collaboration = session.get(ExternalCollaboration, collaboration_id)
    if not collaboration or (tenant_id is not None and collaboration.tenant_id != tenant_id):
        raise LookupError("Colaboracion externa no encontrada.")

    if data.collaboration_type is not None:
        value = data.collaboration_type.strip()
        if not value:
            raise ValueError("Tipo obligatorio.")
        collaboration.collaboration_type = value
    if data.name is not None:
        value = data.name.strip()
        if not value:
            raise ValueError("Nombre obligatorio.")
        collaboration.name = value
    if data.legal_name is not None:
        value = data.legal_name.strip()
        if not value:
            raise ValueError("Razon social obligatoria.")
        collaboration.legal_name = value
    if data.cif is not None:
        value = data.cif.strip()
        if not value:
            raise ValueError("CIF obligatorio.")
        collaboration.cif = value
    if data.contact_email is not None:
        value = data.contact_email.strip()
        if not value:
            raise ValueError("Correo obligatorio.")
        collaboration.contact_email = value

    collaboration.updated_at = datetime.now(timezone.utc)
    session.add(collaboration)
    session.commit()
    session.refresh(collaboration)
    return collaboration


def delete_external_collaboration(
    session: Session, collaboration_id: int, tenant_id: Optional[int]
) -> None:
    collaboration = session.get(ExternalCollaboration, collaboration_id)
    if not collaboration or (tenant_id is not None and collaboration.tenant_id != tenant_id):
        raise LookupError("Colaboracion externa no encontrada.")
    session.delete(collaboration)
    session.commit()
