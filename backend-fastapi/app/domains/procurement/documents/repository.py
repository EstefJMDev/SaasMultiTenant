from __future__ import annotations

from sqlmodel import Session, select

from app.platform.contracts_core.models import ContractDocument


def list_contract_documents(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
) -> list[ContractDocument]:
    return list(
        session.exec(
            select(ContractDocument)
            .where(
                ContractDocument.contract_id == contract_id,
                ContractDocument.tenant_id == tenant_id,
            )
            .order_by(ContractDocument.created_at.desc(), ContractDocument.id.desc())
        ).all()
    )

