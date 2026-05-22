from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.core.db import get_db
from app.domains.projects.deps import tenant_for_read, tenant_for_write
from app.domains.projects.exceptions import ProjectNotFoundError, ProjectValidationError
from app.domains.projects.schemas import ProjectCreate, ProjectRead, ProjectUpdate
from app.domains.projects.service import (
    create_project,
    delete_project,
    get_project,
    list_projects,
    update_project,
)


router = APIRouter()


@router.get("", response_model=list[ProjectRead])
def api_list_projects(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
) -> list[ProjectRead]:
    return list_projects(session, tenant_id, limit=limit, offset=offset)


@router.get("/{project_id}", response_model=ProjectRead)
def api_get_project(
    project_id: int,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_read),
) -> ProjectRead:
    try:
        return get_project(session, project_id, tenant_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
def api_create_project(
    payload: ProjectCreate,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> ProjectRead:
    try:
        return create_project(session, payload, tenant_id)
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/{project_id}", response_model=ProjectRead)
def api_update_project(
    project_id: int,
    payload: ProjectUpdate,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> ProjectRead:
    try:
        return update_project(session, project_id, payload, tenant_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_project(
    project_id: int,
    session: Session = Depends(get_db),
    tenant_id: Optional[int] = Depends(tenant_for_write),
) -> None:
    try:
        delete_project(session, project_id, tenant_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
