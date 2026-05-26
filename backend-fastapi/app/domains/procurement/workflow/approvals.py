from __future__ import annotations

import logging
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.platform.contracts_core.models import (
    ACTIVE_APPROVAL_STATUSES,
    ApprovalStatus,
    ApprovalScope,
    Contract,
    ContractEvent,
    ContractDocument,
    ContractDocumentType,
    ContractNotificationEvent,
    ContractNotificationLog,
    ContractStatus,
    ContractWorkflowApproval,
    ContractWorkflowStep,
    ComparativeStatus,
)
from app.platform.contracts_core.permissions import (
    _is_tenant_admin,
    can_approve_comparative,
    can_approve_contract,
    can_edit_contract,
    can_reject_contract,
    ensure_tenant_access,
)
from app.core.config import settings
from app.domains.procurement.contracts import crud as contract_crud
from app.domains.procurement.documents import service as documents_service
from app.domains.procurement.contracts import validators as contract_validators
from app.workers.tasks.contracts import send_contract_notification
from app.models.hr import Department, EmployeeProfile, Position
from app.models.user import User
from app.platform.contracts_core.models import ContractApproval

logger = logging.getLogger("app.platform.contracts_core")

DEFAULT_CONTRACT_WORKFLOW_STEPS: tuple[str, ...] = (
    "GERENCIA",
    "ADMIN",
    "COMPRAS",
    "JURIDICO",
)
_DEFAULT_DEPARTMENT_ORDER = {
    "gerencia": 0,
    "admin": 1,
    "administracion": 1,
    "compras": 2,
    "juridico": 3,
}

def _sorted_workflow_steps(steps: list[ContractWorkflowStep]) -> list[ContractWorkflowStep]:
    return sorted(steps, key=lambda item: (item.step_order, item.id or 0))


def _normalize_department_name(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name or "")
    return "".join(ch for ch in normalized if not unicodedata.combining(ch)).strip().lower()


def _comparative_approver_department_name(
    session: Session,
    *,
    user: User,
    tenant_id: int,
) -> str:
    row = session.exec(
        select(Department.name)
        .join(Position, Position.department_id == Department.id)
        .join(EmployeeProfile, EmployeeProfile.position_id == Position.id)
        .where(
            EmployeeProfile.user_id == user.id,
            EmployeeProfile.tenant_id == tenant_id,
            EmployeeProfile.is_active.is_(True),
        )
    ).first()
    if isinstance(row, str):
        return _normalize_department_name(row)
    if row and row[0]:
        return _normalize_department_name(str(row[0]))
    return ""


def _default_department_sort_key(department: Department) -> tuple[int, str, int]:
    normalized = _normalize_department_name(department.name or "")
    priority = _DEFAULT_DEPARTMENT_ORDER.get(normalized, 99)
    return (priority, normalized, department.id or 0)


def _list_active_tenant_departments(session: Session, tenant_id: int) -> list[Department]:
    return list(
        session.exec(
            select(Department).where(
                Department.tenant_id == tenant_id,
                Department.is_active.is_(True),
            )
        ).all()
    )


def _ensure_default_workflow_steps(
    session: Session,
    tenant_id: int,
    *,
    auto_commit: bool = True,
) -> list[ContractWorkflowStep]:
    existing = list(
        session.exec(
            select(ContractWorkflowStep).where(
                ContractWorkflowStep.tenant_id == tenant_id,
                ContractWorkflowStep.is_active.is_(True),
            )
        ).all()
    )
    if existing:
        return _sorted_workflow_steps(existing)

    departments = _list_active_tenant_departments(session, tenant_id)
    created: list[ContractWorkflowStep] = []
    if departments:
        for index, department in enumerate(
            sorted(departments, key=_default_department_sort_key),
            start=1,
        ):
            created.append(
                ContractWorkflowStep(
                    tenant_id=tenant_id,
                    step_order=index,
                    department_id=department.id,
                    department_name=department.name.strip(),
                    is_active=True,
                )
            )
    else:
        for index, department_name in enumerate(DEFAULT_CONTRACT_WORKFLOW_STEPS, start=1):
            created.append(
                ContractWorkflowStep(
                    tenant_id=tenant_id,
                    step_order=index,
                    department_id=None,
                    department_name=department_name,
                    is_active=True,
                )
            )
    session.add_all(created)
    if auto_commit:
        session.commit()
    else:
        session.flush()
    return _sorted_workflow_steps(created)


def get_contract_workflow_config(
    session: Session,
    *,
    tenant_id: int,
) -> list[ContractWorkflowStep]:
    return _ensure_default_workflow_steps(session, tenant_id)


def set_contract_workflow_config(
    session: Session,
    *,
    tenant_id: int,
    steps: list[dict[str, Any]],
) -> list[ContractWorkflowStep]:
    if not steps:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El workflow debe incluir al menos un departamento.",
        )

    seen_departments: set[int] = set()
    normalized: list[tuple[int, int, str]] = []
    for raw in steps:
        department_id = int(raw.get("department_id") or 0)
        if department_id <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="department_id debe ser un entero positivo.",
            )
        step_order = int(raw.get("step_order") or 0)
        if step_order <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="step_order debe ser un entero positivo.",
            )
        if department_id in seen_departments:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se permiten departamentos repetidos en el workflow.",
            )
        department = session.get(Department, department_id)
        if not department or department.tenant_id != tenant_id or not department.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Departamento invalido para tenant: {department_id}",
            )
        seen_departments.add(department_id)
        normalized.append((step_order, department_id, department.name.strip()))

    normalized.sort(key=lambda item: item[0])
    for expected, (step_order, _department_id, _department_name) in enumerate(normalized, start=1):
        if step_order != expected:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="step_order debe ser correlativo comenzando en 1.",
            )

    # Evita reconfigurar el workflow mientras existan aprobaciones pendientes
    # de contratos en curso; de lo contrario quedan desalineadas con la nueva config.
    pending_contract_ids = list(
        session.exec(
            select(ContractWorkflowApproval.contract_id).where(
                ContractWorkflowApproval.tenant_id == tenant_id,
                ContractWorkflowApproval.status == ApprovalStatus.PENDING,
            )
        ).all()
    )
    pending_contract_ids = [
        int(item[0] if isinstance(item, tuple) else item)
        for item in pending_contract_ids
        if (item[0] if isinstance(item, tuple) else item) is not None
    ]
    if pending_contract_ids:
        active_pending = session.exec(
            select(Contract.id).where(
                Contract.tenant_id == tenant_id,
                Contract.id.in_(pending_contract_ids),
                Contract.status.in_(
                    [*ACTIVE_APPROVAL_STATUSES, ContractStatus.IN_SIGNATURE]
                ),
            )
        ).first()
        if active_pending is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "No se puede cambiar el workflow con contratos en aprobacion activa. "
                    "Finaliza o rechaza esos contratos antes de reconfigurar."
                ),
            )

    current = list(
        session.exec(
            select(ContractWorkflowStep).where(ContractWorkflowStep.tenant_id == tenant_id)
        ).all()
    )
    for row in current:
        session.delete(row)
    session.flush()

    created = [
        ContractWorkflowStep(
            tenant_id=tenant_id,
            step_order=step_order,
            department_id=department_id,
            department_name=department_name,
            is_active=True,
        )
        for step_order, department_id, department_name in normalized
    ]
    session.add_all(created)
    session.commit()
    return _sorted_workflow_steps(created)


def _get_contract_approvals(
    session: Session,
    contract: Contract,
    *,
    scope: ApprovalScope = ApprovalScope.CONTRACT,
) -> list[ContractWorkflowApproval]:
    if scope != ApprovalScope.CONTRACT:
        raise ValueError(f"Unsupported approval scope for workflow approvals: {scope}")
    return list(
        session.exec(
            select(ContractWorkflowApproval).where(
                ContractWorkflowApproval.tenant_id == contract.tenant_id,
                ContractWorkflowApproval.contract_id == contract.id,
            )
        ).all()
    )


def _sorted_contract_approvals(
    approvals: list[ContractWorkflowApproval],
) -> list[ContractWorkflowApproval]:
    return sorted(
        approvals,
        key=lambda item: (
            item.step_order if item.step_order is not None else 10_000,
            item.id or 0,
        ),
    )


def _initialize_contract_approvals_from_workflow(
    session: Session,
    contract: Contract,
    *,
    scope: ApprovalScope = ApprovalScope.CONTRACT,
    auto_commit: bool = True,
) -> list[ContractWorkflowApproval]:
    if scope != ApprovalScope.CONTRACT:
        raise ValueError(f"Unsupported approval scope for workflow approvals: {scope}")
    existing = _get_contract_approvals(session, contract, scope=scope)
    if existing:
        return _sorted_contract_approvals(existing)

    workflow_steps = _ensure_default_workflow_steps(
        session,
        contract.tenant_id,
        auto_commit=auto_commit,
    )
    created = [
        ContractWorkflowApproval(
            tenant_id=contract.tenant_id,
            contract_id=contract.id,
            step_order=step.step_order,
            department_id=step.department_id,
            department_name=step.department_name,
            status=ApprovalStatus.PENDING,
        )
        for step in workflow_steps
    ]
    session.add_all(created)
    if auto_commit:
        session.commit()
    else:
        session.flush()
    return _sorted_contract_approvals(created)


def _first_pending_approval(
    approvals: list[ContractWorkflowApproval],
) -> Optional[ContractWorkflowApproval]:
    for approval in _sorted_contract_approvals(approvals):
        if approval.status == ApprovalStatus.PENDING:
            return approval
    return None


def _sync_contract_pending_status_from_approvals(
    session: Session,
    *,
    contract: Contract,
    approvals: list[ContractWorkflowApproval],
    auto_commit: bool = True,
) -> Contract:
    pending = _first_pending_approval(approvals)
    if pending is None:
        contract.status = ContractStatus.IN_SIGNATURE
        contract.approved_at = datetime.now(timezone.utc)
    else:
        contract.status = ContractStatus.PENDING_DEPARTAMENTOS
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    if auto_commit:
        session.commit()
        session.refresh(contract)
    else:
        session.flush()
    return contract


def _find_user_pending_approval(
    *,
    approvals: list[ContractWorkflowApproval],
    user_department_ids: set[int],
    allow_super_admin_any: bool,
) -> Optional[ContractWorkflowApproval]:
    pending = [approval for approval in _sorted_contract_approvals(approvals) if approval.status == ApprovalStatus.PENDING]
    if not pending:
        return None
    if allow_super_admin_any:
        return pending[0]
    for approval in pending:
        if approval.department_id and approval.department_id in user_department_ids:
            return approval
    return None


def _current_pending_department_for_contract(
    session: Session,
    contract: Contract,
) -> tuple[Optional[str], Optional[int], Optional[int]]:
    approvals = _get_contract_approvals(session, contract, scope=ApprovalScope.CONTRACT)
    pending = _first_pending_approval(approvals)
    if not pending:
        return None, None, None
    return pending.department_name, pending.department_id, pending.step_order


def _resolve_user_departments(
    session: Session, user_ids: list[int], tenant_id: int
) -> dict[int, str]:
    if not user_ids:
        return {}
    rows = session.exec(
        select(
            EmployeeProfile.user_id,
            Department.name,
        )
        .join(Position, Position.id == EmployeeProfile.position_id)
        .join(Department, Department.id == Position.department_id)
        .where(
            EmployeeProfile.user_id.in_(user_ids),
            EmployeeProfile.tenant_id == tenant_id,
        )
    ).all()
    return {
        int(row[0]): str(row[1])
        for row in rows
        if row and row[0] is not None and row[1] is not None
    }


_V2_ESTADO_TO_LEGACY_STATUS = {
    "PENDIENTE": ApprovalStatus.PENDING,
    "APROBADO": ApprovalStatus.APPROVED,
    "RECHAZADO": ApprovalStatus.REJECTED,
    "OMITIDO": ApprovalStatus.REJECTED,
    "CADUCADO": ApprovalStatus.REJECTED,
}

# El frontend (ContractsModule.tsx ~ L11727) clasifica las aprobaciones por
# `department === "OBRA"` / `"GERENCIA"` (uppercase, sin acentos). v2
# almacena el `rol_aprobador` en forma libre ("Obra", "Gerencia", "Director
# Tecnico", etc.). Normalizamos antes de devolverlo al frontend para
# preservar la clasificacion legacy del timeline.
def _normalize_role_for_legacy_ui(rol: Optional[str]) -> str:
    if not rol:
        return ""
    raw = rol.strip()
    # Quita acentos rapido sin importar unicodedata aqui.
    cleaned = (
        raw.lower()
        .replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ñ", "n")
    )
    if cleaned == "obra" or cleaned == "director tecnico" or cleaned == "director_tecnico":
        return "OBRA"
    if cleaned == "gerencia":
        return "GERENCIA"
    return raw.upper()


def _resolve_v2_comparativo_id(contract: Contract) -> Optional[int]:
    """Devuelve comparativo_id v2 leyendo contract.comparative_data['_v2'].

    None si el contrato es legacy puro (sin entrada _v2).
    """
    data = contract.comparative_data
    if not isinstance(data, dict):
        return None
    v2_meta = data.get("_v2")
    if not isinstance(v2_meta, dict):
        return None
    raw = v2_meta.get("comparativo_id")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def _get_comparative_approvals_from_v2(
    session: Session,
    *,
    contract: Contract,
    comparativo_id: int,
    tenant_id: int,
) -> list[dict[str, Any]]:
    """Construye la lista de aprobaciones del comparativo leyendo de v2.

    Devuelve el mismo shape que la version legacy para no romper el
    frontend. Mientras v2 no implemente ciclos, todas las filas usan
    cycle_number=1.
    """
    from app.domains.procurement.comparativos_v2 import repo as v2_repo

    rows = v2_repo.obtener_aprobaciones_por_comparativo(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )
    user_ids = sorted(
        {int(row.usuario_aprobador_id) for row in rows if row.usuario_aprobador_id is not None}
    )
    names: dict[int, str] = {}
    if user_ids:
        name_rows = session.exec(
            select(User.id, User.full_name).where(User.id.in_(user_ids))
        ).all()
        names = {int(row[0]): row[1] for row in name_rows}
    departments = _resolve_user_departments(session, user_ids, tenant_id)

    payload: list[dict[str, Any]] = []
    for row in rows:
        # estado puede llegar como Enum (EstadoAprobacionComparativo) o como
        # string crudo desde BD. Normalizamos siempre a string para que el
        # mapeo y la comparacion sean robustos.
        estado_value = str(getattr(row.estado, "value", row.estado) or "")
        legacy_status = _V2_ESTADO_TO_LEGACY_STATUS.get(
            estado_value, ApprovalStatus.PENDING
        )
        decided_by_id = (
            row.usuario_aprobador_id
            if estado_value != "PENDIENTE" and row.fecha_resolucion is not None
            else None
        )
        payload.append(
            {
                "id": row.id,
                "tenant_id": row.tenant_id,
                "contract_id": contract.id,
                "department": _normalize_role_for_legacy_ui(row.rol_aprobador),
                "status": legacy_status,
                "cycle_number": 1,
                "created_at": row.fecha_creacion,
                "decided_by_id": decided_by_id,
                "decided_by_name": names.get(decided_by_id)
                if decided_by_id is not None
                else None,
                "decided_by_department": departments.get(decided_by_id)
                if decided_by_id is not None
                else None,
                "decided_at": row.fecha_resolucion,
                "comment": row.comentario,
            }
        )
    return payload


def get_contract_comparative_approvals(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[dict[str, Any]]:
    ensure_tenant_access(user, tenant_id)
    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    can_view_all = contract_crud.can_view_all_comparatives(
        session, user
    ) or contract_crud.can_view_all_contracts(session, user)
    if not can_view_all and contract.created_by_id != user.id:
        subordinado_user_ids = contract_crud._get_jo_subordinado_user_ids(
            session, current_user=user, tenant_id=tenant_id
        )
        if contract.created_by_id in subordinado_user_ids:
            pass
        else:
            approver_dept = _comparative_approver_department_name(
                session, user=user, tenant_id=tenant_id
            )
            is_gerencia_approver = (
                can_approve_comparative(session, user) and approver_dept == "gerencia"
            )
            if not is_gerencia_approver:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos"
                )

    # Camino H: si el contrato esta sincronizado con v2, leer las
    # aprobaciones de `comparativo_aprobaciones` en lugar de la tabla
    # legacy `contract_approval`. El shape devuelto es el mismo para no
    # romper el frontend. Fallback a legacy si no hay _v2.
    v2_comparativo_id = _resolve_v2_comparativo_id(contract)
    if v2_comparativo_id is not None:
        return _get_comparative_approvals_from_v2(
            session,
            contract=contract,
            comparativo_id=v2_comparativo_id,
            tenant_id=contract.tenant_id,
        )

    rows = list(
        session.exec(
            select(ContractApproval).where(
                ContractApproval.tenant_id == contract.tenant_id,
                ContractApproval.contract_id == contract.id,
                ContractApproval.scope == ApprovalScope.COMPARATIVE.value,
            ).order_by(
                ContractApproval.cycle_number.asc(),
                ContractApproval.decided_at.asc().nulls_last(),
                ContractApproval.id.asc(),
            )
        ).all()
    )
    user_ids = sorted(
        {int(row.decided_by_id) for row in rows if row.decided_by_id is not None}
    )
    names: dict[int, str] = {}
    if user_ids:
        name_rows = session.exec(
            select(User.id, User.full_name).where(User.id.in_(user_ids))
        ).all()
        names = {int(row[0]): row[1] for row in name_rows}
    departments = _resolve_user_departments(session, user_ids, tenant_id)
    payload: list[dict[str, Any]] = []
    for row in rows:
        decided_by_id = row.decided_by_id
        payload.append(
            {
                "id": row.id,
                "tenant_id": row.tenant_id,
                "contract_id": row.contract_id,
                "department": row.approver_role.value
                if hasattr(row.approver_role, "value")
                else str(row.approver_role),
                "status": row.status,
                "cycle_number": int(row.cycle_number) if row.cycle_number else 1,
                "created_at": row.created_at,
                "decided_by_id": decided_by_id,
                "decided_by_name": names.get(decided_by_id)
                if decided_by_id is not None
                else None,
                "decided_by_department": departments.get(decided_by_id)
                if decided_by_id is not None
                else None,
                "decided_at": row.decided_at,
                "comment": row.comment,
            }
        )
    return payload


def get_contract_workflow_approvals(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[dict[str, Any]]:
    contract = contract_crud.get_contract(
        session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )
    # Read-only endpoint: no inicializa ni crea filas en BD.
    approvals = _get_contract_approvals(
        session,
        contract,
        scope=ApprovalScope.CONTRACT,
    )
    user_ids = sorted(
        {
            int(approval.decided_by_id)
            for approval in approvals
            if approval.decided_by_id is not None
        }
    )
    user_names: dict[int, str] = {}
    if user_ids:
        rows = session.exec(
            select(User.id, User.full_name).where(User.id.in_(user_ids))
        ).all()
        user_names = {int(row[0]): row[1] for row in rows}
    user_departments = _resolve_user_departments(session, user_ids, tenant_id)

    payload: list[dict[str, Any]] = []
    for approval in _sorted_contract_approvals(approvals):
        decided_by_id = approval.decided_by_id
        payload.append(
            {
                "id": approval.id,
                "tenant_id": approval.tenant_id,
                "contract_id": approval.contract_id,
                "step_order": approval.step_order,
                "department_id": approval.department_id,
                "department_name": approval.department_name,
                "status": approval.status,
                "decided_by_id": decided_by_id,
                "decided_by_name": user_names.get(decided_by_id)
                if decided_by_id is not None
                else None,
                "decided_by_department": user_departments.get(decided_by_id)
                if decided_by_id is not None
                else None,
                "decided_at": approval.decided_at,
                "comment": approval.comment,
            }
        )
    return payload


def _ensure_comparative_document(
    session: Session,
    *,
    contract: Contract,
    context: dict,
    user_id: int,
) -> None:
    """Genera el documento de contrato."""
    documents_service.generate_contract_document(
        session,
        contract=contract,
        context=context,
        created_by_id=user_id,
        auto_commit=False,
    )


def _reset_contract_approvals(
    session: Session,
    *,
    contract: Contract,
) -> list[ContractWorkflowApproval]:
    """Elimina aprobaciones antiguas y re-crea pasos en PENDING desde el workflow activo.

    Usado cuando un contrato se re-envía tras rechazo/cambios para evitar
    historial con pasos ya aprobados.
    """
    existing_approvals = _get_contract_approvals(
        session,
        contract,
        scope=ApprovalScope.CONTRACT,
    )
    if existing_approvals:
        for approval in existing_approvals:
            session.delete(approval)
        session.flush()

    approvals = _initialize_contract_approvals_from_workflow(
        session,
        contract,
        scope=ApprovalScope.CONTRACT,
        auto_commit=False,
    )
    if not approvals:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El tenant no tiene pasos de workflow configurados para contratos.",
    )
    return approvals


def _sync_and_autoselect_offer_if_possible(
    session: Session,
    *,
    contract: Contract,
    fallback_user_id: Optional[int],
) -> None:
    from app.domains.procurement.comparatives import sync as comparatives_sync

    if contract.selected_offer_id:
        return

    changed = comparatives_sync.ensure_comparative_offer_ids(
        session,
        contract=contract,
        fallback_user_id=fallback_user_id or contract.created_by_id,
    )
    if changed:
        session.commit()
        session.refresh(contract)

    offers_data = (contract.comparative_data or {}).get("offers")
    if not isinstance(offers_data, list):
        return

    offer_ids: list[int] = []
    for item in offers_data:
        if not isinstance(item, dict):
            continue
        try:
            parsed = int(item.get("id"))
            if parsed > 0:
                offer_ids.append(parsed)
        except (TypeError, ValueError):
            continue

    unique_offer_ids = sorted(set(offer_ids))
    if len(unique_offer_ids) == 1:
        contract.selected_offer_id = unique_offer_ids[0]
        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)
        session.commit()
        session.refresh(contract)


def submit_gerencia(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:

    ensure_tenant_access(user, tenant_id)
    if not can_edit_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    _sync_and_autoselect_offer_if_possible(
        session,
        contract=contract,
        fallback_user_id=user.id,
    )
    contract_validators._ensure_status_or_400(
        contract.status,
        [
            ContractStatus.DRAFT,
            ContractStatus.PENDING_JEFE_OBRA,
        ],
    )
    if not contract.selected_offer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selecciona la oferta ganadora antes de enviar a Gerencia.",
        )
    missing_jefe_obra_intake = contract_validators.validate_jefe_obra_intake(contract)
    if missing_jefe_obra_intake:
        missing_labels = contract_validators.format_jefe_obra_intake_missing_fields(
            missing_jefe_obra_intake
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Faltan datos obligatorios del Jefe de Obra para iniciar el contrato: "
                f"{missing_labels}."
            ),
        )

    contract_crud.ensure_supplier_snapshot(session, contract=contract)
    context = contract_validators.extract_context(contract)
    required_fields = contract_validators.build_required_fields(contract.type)
    missing_fields = contract_validators.validate_required(context, required_fields)

    if missing_fields:
        documents_service.start_supplier_invitation(
            session,
            contract=contract,
            missing_fields=missing_fields,
        )
        session.refresh(contract)
        return contract

    # Solo exigimos comparativo aprobado cuando se va a pasar al flujo
    # de aprobaciones contractuales; el precheck previo debe poder ejecutarse.
    if contract.comparative_status != ComparativeStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Primero debes aprobar el comparativo antes de enviar el contrato a aprobacion.",
        )

    try:
        _ensure_comparative_document(
            session,
            contract=contract,
            context=context,
            user_id=user.id,
        )

        # Si el contrato se reenvia tras rechazo/cambios, re-creamos pasos en PENDING.
        _reset_contract_approvals(session, contract=contract)

        contract.status = ContractStatus.PENDING_DEPARTAMENTOS
        contract.submitted_at = datetime.now(timezone.utc)
        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)

        existing_delivery_log = session.exec(
            select(ContractNotificationLog).where(
                ContractNotificationLog.tenant_id == contract.tenant_id,
                ContractNotificationLog.contract_id == contract.id,
                ContractNotificationLog.event_type == ContractNotificationEvent.SENT_TO_GERENCIA,
                ContractNotificationLog.recipient_email.is_(None),
            )
        ).one_or_none()
        if not existing_delivery_log:
            session.add(
                ContractNotificationLog(
                    tenant_id=contract.tenant_id,
                    contract_id=contract.id,
                    event_type=ContractNotificationEvent.SENT_TO_GERENCIA,
                    recipient_email=None,
                )
            )

        session.commit()
        session.refresh(contract)
    except Exception:
        session.rollback()
        raise

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.submitted_gerencia",
        payload={"required_fields": required_fields, "missing_fields": []},
    )

    send_contract_notification.delay(
        event=ContractNotificationEvent.SENT_TO_GERENCIA,
        contract_id=contract.id,
    )
    return contract


def approve_all_phases_superadmin(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: Optional[str] = None,
) -> Contract:

    ensure_tenant_access(user, tenant_id)
    if not user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo superadmin puede ejecutar aprobacion completa.",
        )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    _sync_and_autoselect_offer_if_possible(
        session,
        contract=contract,
        fallback_user_id=user.id,
    )
    if contract.status == ContractStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contrato rechazado. Debes moverlo a flujo activo antes de aprobar todo.",
        )
    if contract.status == ContractStatus.SIGNED:
        return contract
    if str(contract.status) == "PENDING_SUPPLIER":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Faltan datos de proveedor. Completa onboarding antes de continuar.",
        )
    if not contract.selected_offer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selecciona la oferta ganadora antes de aprobar todo.",
        )

    contract_crud.ensure_supplier_snapshot(session, contract=contract)
    context = contract_validators.extract_context(contract)
    required_fields = contract_validators.build_required_fields(contract.type)
    missing_fields = contract_validators.validate_required(context, required_fields)
    if missing_fields:
        missing_fields_text = ", ".join(missing_fields)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Faltan campos obligatorios del proveedor para aprobar completamente el contrato: "
                f"{missing_fields_text}."
            ),
        )

    previous_status = str(contract.status)
    now = datetime.now(timezone.utc)
    notification_created = False
    force_comment = (comment or "").strip() or "Aprobacion forzada por superadmin"

    try:
        documents_service.generate_contract_document(
            session,
            contract=contract,
            context=context,
            created_by_id=user.id,
            auto_commit=False,
        )

        approvals = _initialize_contract_approvals_from_workflow(
            session,
            contract,
            scope=ApprovalScope.CONTRACT,
            auto_commit=False,
        )
        if not approvals:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El tenant no tiene pasos de workflow configurados para contratos.",
            )

        for approval in approvals:
            approval.status = ApprovalStatus.APPROVED
            approval.decided_by_id = user.id
            approval.decided_at = now
            approval.comment = force_comment
            session.add(approval)

        contract.comparative_status = ComparativeStatus.APPROVED
        contract.status = ContractStatus.IN_SIGNATURE
        contract.submitted_at = contract.submitted_at or now
        contract.approved_at = now
        contract.updated_at = now
        session.add(contract)

        session.add(
            ContractEvent(
                tenant_id=tenant_id,
                contract_id=contract.id,
                user_id=user.id,
                event_type="contract.superadmin_force_approved",
                payload={
                    "forced": True,
                    "previous_status": previous_status,
                    "required_fields": required_fields,
                },
            )
        )

        existing_delivery_log = session.exec(
            select(ContractNotificationLog).where(
                ContractNotificationLog.tenant_id == contract.tenant_id,
                ContractNotificationLog.contract_id == contract.id,
                ContractNotificationLog.event_type == ContractNotificationEvent.ALL_APPROVED,
                ContractNotificationLog.recipient_email.is_(None),
            )
        ).one_or_none()
        if not existing_delivery_log:
            session.add(
                ContractNotificationLog(
                    tenant_id=contract.tenant_id,
                    contract_id=contract.id,
                    event_type=ContractNotificationEvent.ALL_APPROVED,
                    recipient_email=None,
                )
            )
            notification_created = True

        session.commit()
        session.refresh(contract)
    except Exception:
        session.rollback()
        raise

    if notification_created:
        send_contract_notification.delay(
            event=ContractNotificationEvent.ALL_APPROVED,
            contract_id=contract.id,
        )

    # Firma digital gestionada por FASE 8 (Viafirma) — ya no se dispara automáticamente aquí.
    return contract


def auto_approve_stale_workflow_approvals(
    session: Session,
    *,
    grace_days: int = 2,
    batch_size: int = 500,
    tenant_id: Optional[int] = None,
) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=grace_days)

    scanned = 0
    auto_approved = 0
    moved_to_signature = 0

    batch_size = max(1, int(batch_size))
    last_contract_id = 0

    while True:
        stmt = select(Contract).where(
            Contract.status.in_(ACTIVE_APPROVAL_STATUSES),
            Contract.id > last_contract_id,
        )
        if tenant_id is not None:
            stmt = stmt.where(Contract.tenant_id == tenant_id)
        stmt = stmt.order_by(Contract.id.asc()).limit(batch_size)
        contracts_batch = list(session.exec(stmt).all())
        if not contracts_batch:
            break

        for contract in contracts_batch:
            scanned += 1
            approvals = _initialize_contract_approvals_from_workflow(
                session,
                contract,
                scope=ApprovalScope.CONTRACT,
            )
            pending = [a for a in approvals if a.status == ApprovalStatus.PENDING]
            rejected = [a for a in approvals if a.status == ApprovalStatus.REJECTED]

            if not pending or rejected:
                continue
            # El timeout debe contar desde que el contrato entra en aprobacion.
            # Para evitar autoaprobar contratos migrados/legacy, exigimos submitted_at.
            submitted_ref = contract.submitted_at
            if submitted_ref is None or submitted_ref > cutoff:
                continue

            for approval in pending:
                approval.status = ApprovalStatus.APPROVED
                approval.decided_by_id = None
                approval.decided_at = now
                approval.comment = "Autoaprobado por timeout de 48h"
                session.add(approval)
                auto_approved += 1
                contract_crud._log_event(
                    session,
                    tenant_id=contract.tenant_id,
                    contract_id=contract.id,
                    user_id=None,
                    event_type="contract.department_auto_approved",
                    payload={
                        "department": approval.department_name,
                        "department_id": approval.department_id,
                        "grace_days": grace_days,
                    },
                )
                send_contract_notification.delay(
                    event=ContractNotificationEvent.DEPT_APPROVED,
                    contract_id=contract.id,
                    department_label=approval.department_name,
                )

            session.commit()
            refreshed = _get_contract_approvals(session, contract, scope=ApprovalScope.CONTRACT)
            previous_status = contract.status
            contract = _sync_contract_pending_status_from_approvals(
                session,
                contract=contract,
                approvals=refreshed,
            )
            if contract.status == ContractStatus.IN_SIGNATURE and previous_status != ContractStatus.IN_SIGNATURE:
                moved_to_signature += 1
                # Firma digital gestionada por FASE 8 (Viafirma) — no se dispara automáticamente.

        next_last_id = contracts_batch[-1].id or last_contract_id
        if next_last_id <= last_contract_id:
            break
        last_contract_id = next_last_id

    return {
        "contracts_scanned": scanned,
        "approvals_auto_approved": auto_approved,
        "contracts_moved_to_signature": moved_to_signature,
    }


def approve_contract(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: Optional[str],
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_approve_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    contract_validators._ensure_status_or_400(
        contract.status,
        list(ACTIVE_APPROVAL_STATUSES),
    )
    approvals = _initialize_contract_approvals_from_workflow(
        session, contract, scope=ApprovalScope.CONTRACT
    )
    user_department_ids = contract_crud._get_user_department_ids_for_tenant(
        session,
        user=user,
        tenant_id=tenant_id,
    )
    admin_bypass = user.is_super_admin or _is_tenant_admin(session, user)
    target_approval = _find_user_pending_approval(
        approvals=approvals,
        user_department_ids=user_department_ids,
        allow_super_admin_any=admin_bypass,
    )
    if target_approval is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes ningun paso pendiente asignado en este contrato.",
        )

    try:
        target_approval.status = ApprovalStatus.APPROVED
        target_approval.decided_by_id = user.id
        target_approval.decided_at = datetime.now(timezone.utc)
        target_approval.comment = comment
        session.add(target_approval)

        approvals = _get_contract_approvals(session, contract, scope=ApprovalScope.CONTRACT)
        contract = _sync_contract_pending_status_from_approvals(
            session,
            contract=contract,
            approvals=approvals,
            auto_commit=False,
        )
        session.commit()
        session.refresh(contract)
    except Exception as exc:
        session.rollback()
        logger.exception(
            "Error aprobando contrato contract_id=%s tenant_id=%s user_id=%s: %s",
            contract_id,
            tenant_id,
            user.id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo aprobar el contrato.",
        ) from exc

    if (target_approval.department_name or "").strip().upper() == "GERENCIA":
        contract_crud._log_event(
            session,
            tenant_id=tenant_id,
            contract_id=contract.id,
            user_id=user.id,
            event_type="contract.gerencia_approved",
        )
        send_contract_notification.delay(
            event=ContractNotificationEvent.GERENCIA_APPROVED,
            contract_id=contract.id,
            department_label="Gerencia",
        )
    else:
        contract_crud._log_event(
            session,
            tenant_id=tenant_id,
            contract_id=contract.id,
            user_id=user.id,
            event_type="contract.department_approved",
            payload={
                "department": target_approval.department_name,
                "department_id": target_approval.department_id,
            },
        )
        send_contract_notification.delay(
            event=ContractNotificationEvent.DEPT_APPROVED,
            contract_id=contract.id,
            department_label=target_approval.department_name,
        )

    # Firma digital gestionada por FASE 8 (Viafirma) — no se dispara automáticamente.

    return contract


def reject_contract(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    reason: str,
    back_to_status: Optional[ContractStatus],
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_reject_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    user_department_ids = contract_crud._get_user_department_ids_for_tenant(
        session,
        user=user,
        tenant_id=tenant_id,
    )
    admin_bypass = user.is_super_admin or _is_tenant_admin(session, user)
    if not user_department_ids and not admin_bypass:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    approvals = _get_contract_approvals(session, contract, scope=ApprovalScope.CONTRACT)
    target_approval = _find_user_pending_approval(
        approvals=approvals,
        user_department_ids=user_department_ids,
        allow_super_admin_any=admin_bypass,
    )

    # En IN_SIGNATURE permitimos rechazo sin crear aprobaciones ficticias.
    can_reject_in_signature = contract.status == ContractStatus.IN_SIGNATURE and (
        bool(user_department_ids) or admin_bypass
    )
    if target_approval is None and not can_reject_in_signature:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes ningun paso pendiente asignado para rechazar este contrato.",
        )
    if target_approval is not None:
        target_approval.status = ApprovalStatus.REJECTED
        target_approval.decided_by_id = user.id
        target_approval.decided_at = datetime.now(timezone.utc)
        target_approval.comment = reason
        session.add(target_approval)
        session.commit()

    if back_to_status is None:
        if contract.status in {
            *ACTIVE_APPROVAL_STATUSES,
            ContractStatus.IN_SIGNATURE,
        }:
            back_to_status = ContractStatus.PENDING_JEFE_OBRA
        else:
            back_to_status = ContractStatus.DRAFT

    if back_to_status in {ContractStatus.PENDING_JEFE_OBRA, ContractStatus.DRAFT}:
        # Reinicia el ciclo de aprobacion para evitar mostrar pasos aprobados
        # de una ronda anterior cuando se solicitan cambios.
        existing_approvals = _get_contract_approvals(
            session,
            contract,
            scope=ApprovalScope.CONTRACT,
        )
        for approval in existing_approvals:
            session.delete(approval)
        session.flush()

    contract.status = back_to_status
    contract.rejected_reason = reason
    contract.rejected_by_id = user.id
    contract.rejected_at = datetime.now(timezone.utc)
    contract.rejected_to_status = back_to_status
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.rejected",
        payload={"reason": reason, "back_to": back_to_status},
    )

    send_contract_notification.delay(
        event=ContractNotificationEvent.DEPT_REJECTED,
        contract_id=contract.id,
    )

    return contract


