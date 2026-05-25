"""
Endpoints del flujo de contrato post-comparativo (FASE 3–8).

POST /{id}/activate           — FASE 3: Admin activa contrato desde comparativo aprobado
POST /{id}/select-template    — FASE 4: Seleccionar plantilla → valida campos
GET  /{id}/validate-fields    — FASE 5: Obtener campos faltantes
POST /{id}/generate-document  — FASE 6: Generar doc o enviar solicitud al proveedor
POST /{id}/review-decision    — FASE 7: Rol envía decisión (aprueba / necesita cambios)
GET  /{id}/review-approvals   — FASE 7: Estado de aprobaciones por rol
POST /{id}/send-for-signature — FASE 8: Enviar a Viafirma para firma digital
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session, select

from app.api.deps import get_current_active_user
from app.db.session import get_session
from app.domains.procurement.contracts import read as contracts_read
from app.domains.procurement.contracts.routers.router_common import tenant_for_write
from app.domains.procurement.contracts.workflow_service import (
    activate_contract,
    get_contract_validation,
    select_template,
)
from app.models.user import User
from app.platform.contracts_core.models import ContractStatus
from app.platform.contracts_core.schemas import (
    ContractActivateRequest,
    ContractFieldValidationResult,
    ContractRead,
    ContractRoleApprovalDecision,
    ContractSelectTemplateRequest,
    ContractSelectTemplateResponse,
    SupplierDataRequestRead,
)

router = APIRouter()
logger = logging.getLogger("app.platform.contracts_core")


@router.post("/{contract_id}/activate", response_model=ContractRead, status_code=status.HTTP_200_OK)
def activate_contract_endpoint(
    contract_id: int,
    payload: ContractActivateRequest,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    """
    FASE 3 — Administración activa el contrato desde comparativo aprobado.
    Opcionalmente confirma/cambia el subtipo (subcontratacion/servicio/suministro).
    Transición: comparative_status=APPROVED → contract.status=PENDING_TEMPLATE
    """
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    try:
        contract = activate_contract(
            session,
            contract_id=contract_id,
            tenant_id=tenant_id,
            user=current_user,
            subtype=payload.subtype,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "activate_contract failed contract_id=%s tenant_id=%s user_id=%s: %s",
            contract_id,
            tenant_id,
            getattr(current_user, "id", None),
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo activar el contrato. Revisa estado y datos del comparativo.",
        ) from exc
    return contracts_read.build_contract_read(session, contract)


@router.post("/{contract_id}/select-template", response_model=ContractSelectTemplateResponse)
def select_template_endpoint(
    contract_id: int,
    payload: ContractSelectTemplateRequest,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractSelectTemplateResponse:
    """
    FASE 4 — Seleccionar plantilla para el contrato.
    Transición: PENDING_TEMPLATE → PENDING_DATA_VALIDATION
    Devuelve el contrato actualizado + lista de campos faltantes.
    """
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract, validation = select_template(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        template_id=payload.template_id,
        user=current_user,
    )
    contract_read = contracts_read.build_contract_read(session, contract)
    return ContractSelectTemplateResponse(
        contract=contract_read,
        validation=ContractFieldValidationResult(
            missing=validation.missing,
            is_complete=validation.is_complete,
        ),
    )


@router.get("/{contract_id}/validate-fields", response_model=ContractFieldValidationResult)
def validate_fields_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractFieldValidationResult:
    """
    FASE 5 — Obtener lista exacta de campos [VARIABLE] que faltan en BD.
    """
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    validation = get_contract_validation(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return ContractFieldValidationResult(
        missing=validation.missing,
        is_complete=validation.is_complete,
    )


class GenerateDocumentResponse(ContractRead):
    """
    FASE 6 response: incluye validation si datos incompletos → 6B activado.
    """
    supplier_request_token: Optional[str] = None
    supplier_request_expires_at: Optional[str] = None
    validation: Optional[ContractFieldValidationResult] = None


@router.post("/{contract_id}/generate-document", response_model=GenerateDocumentResponse)
def generate_document_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> GenerateDocumentResponse:
    """
    FASE 6 — Generar documento del contrato.
    - Si datos completos (6A): sustituye [VAR], genera PDF. El contrato se
      queda en PENDING_DATA_VALIDATION (fase borrador Admin). Para promoverlo
      a PENDING_REVIEW, Admin debe pulsar /admin-approve-draft.
    - Si datos incompletos (6B): crea token proveedor, envía email, devuelve campos faltantes.
    """
    from app.domains.procurement.contracts.document_generator import generate_contract_from_template
    from app.domains.procurement.contracts.supplier_request_service import create_supplier_data_request
    from app.domains.procurement.contracts.workflow_service import (
        _user_is_admin,
        validate_contract_fields,
    )
    from app.platform.contracts_core.permissions import ensure_tenant_access

    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    ensure_tenant_access(current_user, tenant_id)
    if not _user_is_admin(session, current_user):
        from fastapi import HTTPException
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos.")

    from app.domains.procurement.contracts import crud as contract_crud
    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)

    if contract.status != ContractStatus.PENDING_DATA_VALIDATION:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Estado inválido para generación: {contract.status.value}",
        )

    validation = validate_contract_fields(session, contract=contract)

    if validation.is_complete:
        # FASE 6A: generate now
        generate_contract_from_template(
            session, contract=contract, created_by_id=current_user.id
        )
        session.refresh(contract)
        contract_read = contracts_read.build_contract_read(session, contract)
        result = contract_read.model_dump()
        result["validation"] = {"missing": [], "is_complete": True}
        return GenerateDocumentResponse.model_validate(result)
    else:
        # FASE 6B: request supplier data
        req = create_supplier_data_request(
            session, contract=contract, missing_fields=validation.missing
        )
        contract_read = contracts_read.build_contract_read(session, contract)
        result = contract_read.model_dump()
        result["supplier_request_token"] = req.token
        result["supplier_request_expires_at"] = req.expires_at.isoformat()
        result["validation"] = {
            "missing": validation.missing,
            "is_complete": False,
        }
        return GenerateDocumentResponse.model_validate(result)


# ── FASE 6.5 — Admin aprueba borrador y abre revisión ─────────────────────────

@router.post(
    "/{contract_id}/admin-approve-draft",
    response_model=ContractRead,
    status_code=status.HTTP_200_OK,
)
def admin_approve_draft_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    """Administración aprueba el contrato en fase borrador.

    Transición: PENDING_DATA_VALIDATION → PENDING_REVIEW.
    Slot ADMIN se crea ya APPROVED y se abren los slots JURIDICO/JEFE_OBRA/
    DIRECTOR_TECNICO en PENDING. Si es re-envío tras rechazo, abre un ciclo
    nuevo (cycle_number+1) preservando el histórico.
    """
    from app.domains.procurement.contracts.review_service import admin_approve_draft

    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = admin_approve_draft(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return contracts_read.build_contract_read(session, contract)


# ── FASE 7 — Multi-role review ─────────────────────────────────────────────────

@router.post("/{contract_id}/review-decision", response_model=ContractRead, status_code=status.HTTP_200_OK)
def review_decision_endpoint(
    contract_id: int,
    payload: ContractRoleApprovalDecision,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    """
    FASE 7 — Rol envía su decisión de revisión.
    approved=True → marca su slot como APPROVED; si todos aprueban → FULLY_APPROVED.
    approved=False → requiere comentario obligatorio; contrato vuelve a PENDING_REVIEW y se resetean las demás aprobaciones.
    """
    from app.domains.procurement.contracts.review_service import submit_role_decision
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = submit_role_decision(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
        approved=payload.approved,
        comment=payload.comment,
    )
    return contracts_read.build_contract_read(session, contract)


@router.get("/{contract_id}/review-approvals")
def review_approvals_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    all_cycles: bool = True,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> list[dict]:
    """
    FASE 7 — Aprobaciones de revisión por rol.

    Por defecto devuelve TODOS los ciclos (para construir el historial en el
    frontend). Pasa `?all_cycles=false` para limitar al ciclo actual.
    """
    from app.domains.procurement.contracts.review_service import (
        get_review_approvals,
        get_all_review_approvals,
        ROLE_DISPLAY_NAMES,
    )
    from app.platform.contracts_core.models import ContractApproverRole
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    if all_cycles:
        approvals = get_all_review_approvals(
            session,
            contract_id=contract_id,
            tenant_id=tenant_id,
            user=current_user,
        )
    else:
        approvals = get_review_approvals(
            session,
            contract_id=contract_id,
            tenant_id=tenant_id,
            user=current_user,
        )

    def _label(role_value: str) -> str:
        try:
            return ROLE_DISPLAY_NAMES[ContractApproverRole(role_value)]
        except Exception:
            return role_value

    # Resolver nombres de los decided_by (User.full_name fallback email/username)
    decider_ids = {a.decided_by_id for a in approvals if a.decided_by_id}
    decider_names: dict[int, str] = {}
    if decider_ids:
        users = session.exec(select(User).where(User.id.in_(decider_ids))).all()
        for u in users:
            decider_names[u.id] = (
                getattr(u, "full_name", None)
                or getattr(u, "email", None)
                or getattr(u, "username", None)
                or f"Usuario #{u.id}"
            )

    return [
        {
            "id": a.id,
            "approver_role": a.approver_role,
            # alias para compat con el front actual
            "department_name": _label(a.approver_role),
            "step_order": a.step_order,
            "status": a.status.value if a.status else None,
            "cycle_number": a.cycle_number,
            "decided_by_id": a.decided_by_id,
            "decided_by_name": decider_names.get(a.decided_by_id) if a.decided_by_id else None,
            "decided_at": a.decided_at.isoformat() if a.decided_at else None,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "comment": a.comment,
        }
        for a in approvals
    ]


# ── FASE 8 — Viafirma digital signature ───────────────────────────────────────

@router.post("/{contract_id}/send-for-signature", response_model=ContractRead, status_code=status.HTTP_200_OK)
def send_for_signature_endpoint(
    contract_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> ContractRead:
    """
    FASE 8 — Envía el contrato a Viafirma para firma digital.
    Requiere estado FULLY_APPROVED y rol Administración.
    Transición: FULLY_APPROVED → SENT_FOR_SIGNATURE.
    """
    from app.domains.procurement.contracts.viafirma_adapter import send_contract_for_signature
    tenant_id = tenant_for_write(current_user, x_tenant_id, session)
    contract = send_contract_for_signature(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=current_user,
    )
    return contracts_read.build_contract_read(session, contract)
