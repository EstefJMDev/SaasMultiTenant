from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session
from pathlib import Path

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.core.db import get_db
from app.core.tenancy import tenant_required_for_superadmin
from app.domains.projects.deps import tenant_for_read, tenant_for_write
from app.domains.projects.exceptions import ProjectValidationError
from app.domains.projects.schemas import ProjectDocumentRead
from app.domains.projects.service import (
    create_project_document,
    list_project_documents,
    to_project_document_read,
)
from app.models.user import User


router = APIRouter()


@router.get("/{project_id}/documents", response_model=list[ProjectDocumentRead])
def api_list_project_documents(
    project_id: int,
    doc_type: Optional[str] = None,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
) -> list[ProjectDocumentRead]:
    documents = list_project_documents(session, project_id, tenant_id, doc_type)
    return [to_project_document_read(doc) for doc in documents]


@router.post(
    "/{project_id}/documents",
    response_model=ProjectDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
def api_upload_project_document(
    project_id: int,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> ProjectDocumentRead:
    try:
        document = create_project_document(session, project_id, file, tenant_id, doc_type)
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return to_project_document_read(document)


@router.get("/{project_id}/documents/{document_id}/download")
def api_download_project_document(
    project_id: int,
    document_id: int,
    tenant_id: Optional[int] = None,
    session: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> FileResponse:
    try:
        effective_tenant_id = tenant_required_for_superadmin(current_user, tenant_id)
    except HTTPException as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    documents = list_project_documents(session, project_id, effective_tenant_id)
    document = next((item for item in documents if item.id == document_id), None)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Documento no encontrado.",
        )

    docs_root = Path(settings.project_docs_storage_path).resolve()
    file_path = (docs_root / document.file_name).resolve()
    if docs_root not in file_path.parents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ruta de documento invalida.",
        )
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo no disponible en almacenamiento.",
        )

    return FileResponse(
        path=str(file_path),
        filename=document.original_name,
        media_type=document.content_type or "application/octet-stream",
    )
