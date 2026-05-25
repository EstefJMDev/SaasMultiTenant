from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.api.deps import get_current_active_user, require_permissions
from app.core.config import settings
from app.core.permissions import CONTRACTS_APPROVE
from app.platform.contracts_core.models import ContractDocumentType, ContractStatus
from app.domains.procurement.contracts.routers.router_common import tenant_for_write
from app.platform.contracts_core.schemas import (
    ApprovalDecision,
    ContractComparativeApprovalRead,
    ContractCreate,
    ContractDocumentRead,
    ContractRead,
    ContractUpdate,
    ContractWorkflowApprovalRead,
    RejectRequest,
)
from app.domains.procurement.contracts.service import contracts_service
from app.db.session import get_session
from app.models.user import User


router = APIRouter()


@router.post("", response_model=ContractRead)
def create_contract_endpoint(
    payload: ContractCreate,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = contracts_service.create(
        session=session,
        tenant_id=tenant_id,
        created_by=current_user,
        payload=payload.model_dump(),
    )
    return contracts_service.build_read(session, contract)


@router.get("", response_model=list[ContractRead])
def list_contracts_endpoint(
    status_filter: Optional[ContractStatus] = None,
    pending_only: bool = False,
    assigned_to_me: bool = False,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ContractRead]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contracts = contracts_service.list_for_user(
        session=session,
        tenant_id=tenant_id,
        current_user=current_user,
        status_filter=status_filter,
        pending_only=pending_only,
        assigned_to_me=assigned_to_me,
        limit=limit,
        offset=offset,
    )
    return contracts_service.build_reads(session, contracts)


@router.get("/pending", response_model=list[ContractRead])
def list_pending_contracts_endpoint(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ContractRead]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contracts = contracts_service.list_for_user(
        session=session,
        tenant_id=tenant_id,
        current_user=current_user,
        pending_only=True,
        limit=limit,
        offset=offset,
    )
    return contracts_service.build_reads(session, contracts)


@router.get("/{contract_id}", response_model=ContractRead)
def get_contract_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = contracts_service.get_by_id(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return contracts_service.build_read(session, contract)


@router.delete("/{contract_id}", status_code=status.HTTP_200_OK)
def delete_contract_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contracts_service.delete_by_id(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return {"message": "Contrato eliminado exitosamente"}


@router.get("/{contract_id}/documents", response_model=list[ContractDocumentRead])
def get_contract_documents_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ContractDocumentRead]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    docs = contracts_service.list_documents(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return [ContractDocumentRead.model_validate(doc) for doc in docs]


@router.get("/{contract_id}/documents/{doc_type}", response_model=ContractDocumentRead)
def get_contract_document_by_type_endpoint(
    contract_id: int,
    doc_type: str,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractDocumentRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    try:
        parsed_doc_type = ContractDocumentType(doc_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doc_type invalido. Usa COMPARATIVE, CONTRACT o SIGNED.",
        )
    try:
        typed_doc = contracts_service.get_document_by_type(
            session=session,
            contract_id=contract_id,
            tenant_id=tenant_id,
            user=current_user,
            doc_type=parsed_doc_type,
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="doc_type invalido.")
    return ContractDocumentRead.model_validate(typed_doc)


@router.get("/{contract_id}/documents/{doc_type}/download")
def download_contract_document_by_type_endpoint(
    contract_id: int,
    doc_type: str,
    inline: bool = Query(default=False),
    tenant_id: Optional[int] = Query(default=None),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> FileResponse:
    resolved_tenant_id = tenant_for_write(
        current_user,
        x_tenant_id if x_tenant_id is not None else tenant_id,
        session,
    )
    try:
        parsed_doc_type = ContractDocumentType(doc_type)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="doc_type invalido. Usa COMPARATIVE, CONTRACT o SIGNED.",
        )
    typed_doc = contracts_service.get_document_by_type(
        session=session,
        contract_id=contract_id,
        tenant_id=resolved_tenant_id,
        user=current_user,
        doc_type=parsed_doc_type,
    )
    path_obj = Path(typed_doc.path or "")
    if not path_obj.exists():
        candidate_root = (
            Path(settings.contracts_storage_path)
            / f"tenant_{resolved_tenant_id}"
            / f"contract_{contract_id}"
        )
        if parsed_doc_type == ContractDocumentType.SIGNED:
            candidate_folder = candidate_root / "signed"
        else:
            candidate_folder = candidate_root / "documents" / parsed_doc_type.value.lower()
        candidates = sorted(
            [p for p in candidate_folder.glob("*") if p.is_file()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if candidates:
            path_obj = candidates[0]
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Archivo de documento no encontrado en almacenamiento.",
            )
    return FileResponse(
        path=str(path_obj),
        filename=f"CT-{contract_id}-{parsed_doc_type.value}.pdf",
        media_type="application/pdf",
        content_disposition_type="inline" if inline else "attachment",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.patch("/{contract_id}", response_model=ContractRead)
def update_contract_endpoint(
    contract_id: int,
    payload: ContractUpdate,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = contracts_service.update(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        payload=payload.model_dump(exclude_unset=True),
        user=current_user,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/generate-docs", response_model=ContractRead)
def generate_docs_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = contracts_service.generate_documents(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/submit-gerencia", response_model=ContractRead)
def submit_gerencia_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = contracts_service.submit_to_management(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/approve", response_model=ContractRead)
def approve_contract_endpoint(
    contract_id: int,
    payload: ApprovalDecision,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = contracts_service.approve(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
        comment=payload.comment,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/regenerate-contract", response_model=ContractRead)
def regenerate_contract_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = contracts_service.regenerate_pdf(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/approve-all-phases", response_model=ContractRead)
def approve_all_phases_endpoint(
    contract_id: int,
    payload: ApprovalDecision,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = contracts_service.approve_all_phases(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
        comment=payload.comment,
    )
    return contracts_service.build_read(session, contract)


@router.post("/{contract_id}/reject", response_model=ContractRead)
def reject_contract_endpoint(
    contract_id: int,
    payload: RejectRequest,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = contracts_service.reject(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
        reason=payload.reason,
        back_to_status=payload.back_to_status,
    )
    return contracts_service.build_read(session, contract)


@router.get(
    "/{contract_id}/workflow-approvals",
    response_model=list[ContractWorkflowApprovalRead],
)
def get_contract_workflow_approvals_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ContractWorkflowApprovalRead]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    approvals = contracts_service.list_workflow_approvals(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return [ContractWorkflowApprovalRead.model_validate(item) for item in approvals]


@router.get(
    "/{contract_id}/comparative-approvals",
    response_model=list[ContractComparativeApprovalRead],
)
def get_contract_comparative_approvals_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ContractComparativeApprovalRead]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    approvals = contracts_service.list_comparative_approvals(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return [ContractComparativeApprovalRead.model_validate(item) for item in approvals]

