"""
Endpoints para gestión de plantillas de contrato.

POST   /contracts/templates          — subir plantilla
GET    /contracts/templates          — listar (filtro opcional por subtype)
GET    /contracts/templates/{id}     — obtener una
DELETE /contracts/templates/{id}     — desactivar
"""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, UploadFile, status
from sqlmodel import Session

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.domains.procurement.contracts.routers.router_common import tenant_for_write
from app.domains.procurement.contracts.templates_service import (
    deactivate_template,
    get_template_or_404,
    list_templates,
    upload_template,
)
from app.models.user import User
from app.platform.contracts_core.models import ContractSubtype
from app.platform.contracts_core.schemas import ContractTemplateRead

router = APIRouter(prefix="/templates", tags=["templates"])


@router.post("", response_model=ContractTemplateRead, status_code=status.HTTP_201_CREATED)
async def upload_template_endpoint(
    file: UploadFile = File(...),
    name: str = Form(...),
    subtype: ContractSubtype = Form(...),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractTemplateRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    file_data = await file.read()
    tpl = upload_template(
        session,
        tenant_id=tenant_id,
        created_by_id=current_user.id,
        name=name,
        subtype=subtype,
        file_data=file_data,
        original_filename=file.filename or "template",
    )
    return ContractTemplateRead.model_validate(tpl)


@router.get("", response_model=list[ContractTemplateRead])
def list_templates_endpoint(
    subtype: Optional[ContractSubtype] = None,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[ContractTemplateRead]:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    templates = list_templates(session, tenant_id=tenant_id, subtype=subtype)
    return [ContractTemplateRead.model_validate(t) for t in templates]


@router.get("/{template_id}", response_model=ContractTemplateRead)
def get_template_endpoint(
    template_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractTemplateRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    tpl = get_template_or_404(session, tenant_id=tenant_id, template_id=template_id)
    return ContractTemplateRead.model_validate(tpl)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_template_endpoint(
    template_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> None:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    deactivate_template(session, tenant_id=tenant_id, template_id=template_id)
