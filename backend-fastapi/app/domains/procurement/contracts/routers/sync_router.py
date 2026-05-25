from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session

from app.api.deps import get_current_active_user, require_permissions
from app.core.permissions import CONTRACTS_APPROVE, CONTRACTS_READ
from app.platform.contracts_core.models import ContractType, SupplierStatus
from app.domains.procurement.contracts.routers.router_common import tenant_for_write
from app.platform.contracts_core.schemas import (
    ContractWorkflowConfigRead,
    ContractWorkflowConfigUpdate,
    SupplierLookupResponse,
    SupplierOnboardingLinkGenerate,
    SupplierOnboardingLinkRead,
    SupplierRead,
)
from app.domains.procurement.contracts.service import sync_service
from app.db.session import get_session
from app.models.user import User


router = APIRouter()


@router.get("/suppliers/lookup", response_model=SupplierLookupResponse)
def lookup_supplier_endpoint(
    tax_id: str,
    contract_type: Optional[ContractType] = None,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> SupplierLookupResponse:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    supplier = sync_service.lookup_supplier(
        session=session,
        tenant_id=tenant_id,
        tax_id=tax_id,
        contract_type=contract_type,
    )
    if not supplier:
        return SupplierLookupResponse(found=False, supplier=None)
    # Excluir proveedores en estado PENDING (creados como placeholder
    # durante onboarding, pero aún sin datos completos).
    supplier_status = getattr(supplier, "status", None)
    if supplier_status is not None and supplier_status != SupplierStatus.ACTIVE:
        return SupplierLookupResponse(found=False, supplier=None)
    return SupplierLookupResponse(found=True, supplier=SupplierRead.model_validate(supplier))


@router.get("/workflow", response_model=ContractWorkflowConfigRead)
def get_contract_workflow_endpoint(
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions([CONTRACTS_READ])),
) -> ContractWorkflowConfigRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    steps = sync_service.get_workflow_config(
        session=session,
        tenant_id=tenant_id,
    )
    return ContractWorkflowConfigRead(steps=steps)


@router.put("/workflow", response_model=ContractWorkflowConfigRead)
def set_contract_workflow_endpoint(
    payload: ContractWorkflowConfigUpdate,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_permissions([CONTRACTS_APPROVE])),
) -> ContractWorkflowConfigRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    if not (current_user.is_super_admin or current_user.tenant_id == tenant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sin permisos para configurar workflow de este tenant.",
        )
    steps = sync_service.set_workflow_config(
        session=session,
        tenant_id=tenant_id,
        steps=[item.model_dump() for item in payload.steps],
    )
    return ContractWorkflowConfigRead(steps=steps)


@router.post("/{contract_id}/supplier-onboarding-link", response_model=SupplierOnboardingLinkRead)
def regenerate_supplier_onboarding_link_endpoint(
    contract_id: int,
    payload: SupplierOnboardingLinkGenerate,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> SupplierOnboardingLinkRead:
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    service_payload = sync_service.generate_supplier_onboarding_link(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
        supplier_tax_id=payload.supplier_tax_id,
        supplier_email=payload.supplier_email,
    )
    return SupplierOnboardingLinkRead.model_validate(service_payload)

