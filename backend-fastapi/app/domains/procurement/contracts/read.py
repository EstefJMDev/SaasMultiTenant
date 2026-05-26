from __future__ import annotations

from collections import defaultdict
import logging
import math
from typing import Any, Sequence

from pydantic import ValidationError
from sqlalchemy import inspect as sa_inspect
from sqlmodel import Session, select

from app.platform.contracts_core.models import (
    ApprovalScope,
    ApprovalStatus,
    ComparativeStatus,
    Contract,
    ContractApproval,
    ContractDepartment,
    ContractStatus,
    ContractType,
    ContractWorkflowApproval,
)
from app.models.user import User

from app.domains.procurement.workflow import approvals as workflow_approvals

logger = logging.getLogger("app.platform.contracts_core")


def _resolve_v2_comparativo_id_for_guard(contract: Contract) -> int | None:
    """Lee comparative_data._v2.comparativo_id con manejo robusto de tipos."""
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


def _approved_roles_from_v2(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> set[str]:
    """Lee `comparativo_aprobaciones` v2 y devuelve los roles APROBADO
    normalizados al formato legacy (OBRA/GERENCIA en uppercase).
    """
    from app.domains.procurement.comparativos_v2 import repo as v2_repo
    from app.domains.procurement.workflow.approvals import _normalize_role_for_legacy_ui

    rows = v2_repo.obtener_aprobaciones_por_comparativo(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )
    approved: set[str] = set()
    for row in rows:
        estado_value = str(getattr(row.estado, "value", row.estado) or "")
        if estado_value == "APROBADO":
            approved.add(_normalize_role_for_legacy_ui(row.rol_aprobador))
    return approved


def _comparative_status_with_guard(
    session: Session,
    contract: Contract,
    payload_status: object,
) -> object:
    """Si el status persistido es APPROVED pero las ramas del ciclo activo
    no muestran OBRA y GERENCIA ambas APPROVED, devolvemos PENDING_MGMT_APPROVAL.

    Tapa cualquier escritura previa incorrecta y evita que el listado pinte
    'Aprobado' cuando solo una de las dos partes ha aprobado.

    Para comparativos vinculados a v2 (`_v2.comparativo_id` presente), la
    fuente de verdad es `comparativo_aprobaciones` (no `contract_approval`
    legacy, que queda vacio en el flujo v2). Para contratos legacy puros
    se mantiene la lectura de `contract_approval`.
    """
    raw = getattr(payload_status, "value", payload_status)
    if str(raw or "").strip().upper() != ComparativeStatus.APPROVED.value:
        return payload_status

    required = {ContractDepartment.OBRA.value, ContractDepartment.GERENCIA.value}

    v2_comparativo_id = _resolve_v2_comparativo_id_for_guard(contract)
    if v2_comparativo_id is not None:
        try:
            approved_roles = _approved_roles_from_v2(
                session,
                tenant_id=contract.tenant_id,
                comparativo_id=v2_comparativo_id,
            )
        except Exception:
            logger.warning(
                "Read-time comparative guard v2 fallback contract_id=%s",
                getattr(contract, "id", None),
            )
            return payload_status
        if required.issubset(approved_roles):
            return payload_status
        return ComparativeStatus.PENDING_MGMT_APPROVAL

    try:
        max_cycle = session.exec(
            select(ContractApproval.cycle_number).where(
                ContractApproval.tenant_id == contract.tenant_id,
                ContractApproval.contract_id == contract.id,
                ContractApproval.scope == ApprovalScope.COMPARATIVE.value,
            ).order_by(ContractApproval.cycle_number.desc())
        ).first()
        current_cycle = int(max_cycle) if max_cycle else 1
        rows = list(
            session.exec(
                select(ContractApproval).where(
                    ContractApproval.tenant_id == contract.tenant_id,
                    ContractApproval.contract_id == contract.id,
                    ContractApproval.scope == ApprovalScope.COMPARATIVE.value,
                    ContractApproval.cycle_number == current_cycle,
                )
            ).all()
        )
    except Exception:
        logger.warning(
            "Read-time comparative guard fallback contract_id=%s",
            getattr(contract, "id", None),
        )
        return payload_status

    approved_roles: set[str] = set()
    for row in rows:
        if row.status == ApprovalStatus.APPROVED and row.approver_role:
            approved_roles.add(row.approver_role)
    if required.issubset(approved_roles):
        return payload_status
    return ComparativeStatus.PENDING_MGMT_APPROVAL


def _enum_value_or_default(value, enum_cls, default):
    raw = getattr(value, "value", value)
    if raw is None:
        return default
    text = str(raw).strip()
    if not text:
        return default
    try:
        return enum_cls(text)
    except Exception:
        try:
            return enum_cls(text.upper())
        except Exception:
            return default


def _sanitize_json_value(value):
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: _sanitize_json_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_json_value(item) for item in value]
    return value


def _safe_attr(contract: Contract, field: str, default: Any = None) -> Any:
    raw_dict = getattr(contract, "__dict__", None)
    if isinstance(raw_dict, dict) and field in raw_dict:
        value = raw_dict.get(field)
        if value is not None:
            return value
    if field == "id":
        try:
            identity = sa_inspect(contract).identity
            if identity and len(identity) > 0 and identity[0] is not None:
                return int(identity[0])
        except Exception:
            pass
    try:
        return getattr(contract, field)
    except Exception:
        return default


def _safe_contract_read(contract: Contract):
    from app.platform.contracts_core.schemas import ContractRead

    try:
        return ContractRead.model_validate(contract)
    except Exception:
        logger.warning(
            "Contract read fallback for contract_id=%s due to serialization mismatch",
            _safe_attr(contract, "id"),
        )
        payload = {
            "id": _safe_attr(contract, "id"),
            "tenant_id": _safe_attr(contract, "tenant_id"),
            "created_by_id": _safe_attr(contract, "created_by_id"),
            "project_id": _safe_attr(contract, "project_id"),
            "type": _enum_value_or_default(
                _safe_attr(contract, "type"),
                ContractType,
                ContractType.SUBCONTRATACION,
            ),
            "status": _enum_value_or_default(
                _safe_attr(contract, "status"),
                ContractStatus,
                ContractStatus.DRAFT,
            ),
            "comparative_status": _enum_value_or_default(
                _safe_attr(contract, "comparative_status"),
                ComparativeStatus,
                ComparativeStatus.DRAFT,
            ),
            "title": _safe_attr(contract, "title"),
            "description": _safe_attr(contract, "description"),
            "selected_offer_id": _safe_attr(contract, "selected_offer_id"),
            "template_id": _safe_attr(contract, "template_id"),
            "assigned_admin_user_id": _safe_attr(contract, "assigned_admin_user_id"),
            "supplier_name": _safe_attr(contract, "supplier_name"),
            "supplier_tax_id": _safe_attr(contract, "supplier_tax_id"),
            "supplier_email": _safe_attr(contract, "supplier_email"),
            "supplier_phone": _safe_attr(contract, "supplier_phone"),
            "supplier_address": _safe_attr(contract, "supplier_address"),
            "supplier_city": _safe_attr(contract, "supplier_city"),
            "supplier_postal_code": _safe_attr(contract, "supplier_postal_code"),
            "supplier_country": _safe_attr(contract, "supplier_country"),
            "supplier_contact_name": _safe_attr(contract, "supplier_contact_name"),
            "supplier_bank_iban": _safe_attr(contract, "supplier_bank_iban"),
            "supplier_bank_bic": _safe_attr(contract, "supplier_bank_bic"),
            "supplier_legal_rep_name": _safe_attr(contract, "supplier_legal_rep_name"),
            "supplier_legal_rep_dni": _safe_attr(contract, "supplier_legal_rep_dni"),
            "total_amount": _safe_attr(contract, "total_amount"),
            "insurance_amount": _safe_attr(contract, "insurance_amount"),
            "currency": _safe_attr(contract, "currency"),
            "milestones_text": _safe_attr(contract, "milestones_text"),
            "freight_responsible": _safe_attr(contract, "freight_responsible"),
            "unloading_responsible": _safe_attr(contract, "unloading_responsible"),
            "project_number": _safe_attr(contract, "project_number"),
            "promoter": _safe_attr(contract, "promoter"),
            "work_start_date": _safe_attr(contract, "work_start_date"),
            "work_end_date": _safe_attr(contract, "work_end_date"),
            "duration_text": _safe_attr(contract, "duration_text"),
            "payment_method": _safe_attr(contract, "payment_method"),
            "payment_days": _safe_attr(contract, "payment_days"),
            "payment_method_other_text": _safe_attr(contract, "payment_method_other_text"),
            "comparative_data": _sanitize_json_value(
                _safe_attr(contract, "comparative_data")
            ),
            "contract_data": _sanitize_json_value(_safe_attr(contract, "contract_data")),
            "ocr_data": _sanitize_json_value(_safe_attr(contract, "ocr_data")),
            "created_at": _safe_attr(contract, "created_at"),
            "updated_at": _safe_attr(contract, "updated_at"),
            "submitted_at": _safe_attr(contract, "submitted_at"),
            "approved_at": _safe_attr(contract, "approved_at"),
            "signed_at": _safe_attr(contract, "signed_at"),
            "rejected_reason": _safe_attr(contract, "rejected_reason"),
            "rejected_by_id": _safe_attr(contract, "rejected_by_id"),
            "rejected_at": _safe_attr(contract, "rejected_at"),
            "rejected_to_status": _enum_value_or_default(
                _safe_attr(contract, "rejected_to_status"),
                ContractStatus,
                None,
            ),
        }
        return ContractRead.model_validate(payload)


def build_contract_read(
    session: Session,
    contract: Contract,
):
    from app.platform.contracts_core.schemas import ContractRead

    pending_department = None
    pending_department_id = None
    pending_step_order = None
    try:
        pending_department, pending_department_id, pending_step_order = (
            workflow_approvals._current_pending_department_for_contract(session, contract)
        )
    except Exception:
        logger.warning(
            "Pending department lookup fallback for contract_id=%s",
            getattr(contract, "id", None),
        )
    payload = _safe_contract_read(contract).model_dump()
    payload["comparative_data"] = _sanitize_json_value(payload.get("comparative_data"))
    payload["contract_data"] = _sanitize_json_value(payload.get("contract_data"))
    payload["ocr_data"] = _sanitize_json_value(payload.get("ocr_data"))
    assigned_admin_user_id = payload.get("assigned_admin_user_id")
    if assigned_admin_user_id:
        assigned_user = session.get(User, assigned_admin_user_id)
        if assigned_user:
            payload["assigned_admin_user_name"] = (
                getattr(assigned_user, "full_name", None)
                or getattr(assigned_user, "email", None)
                or f"Usuario #{assigned_user.id}"
            )
    payload["current_pending_department"] = pending_department
    payload["current_pending_department_id"] = pending_department_id
    payload["current_pending_step_order"] = pending_step_order
    payload["comparative_status"] = _comparative_status_with_guard(
        session, contract, payload.get("comparative_status")
    )
    return ContractRead.model_validate(payload)


def build_contract_reads(
    session: Session,
    contracts: Sequence[Contract],
):
    from app.platform.contracts_core.schemas import ContractRead

    if not contracts:
        return []

    contract_ids = [item.id for item in contracts if item.id is not None]
    if not contract_ids:
        return [_safe_contract_read(item) for item in contracts]

    pending_rows: list[ContractWorkflowApproval] = []
    assigned_admin_ids = {
        int(item.assigned_admin_user_id)
        for item in contracts
        if getattr(item, "assigned_admin_user_id", None)
    }
    assigned_admin_names: dict[int, str] = {}
    try:
        pending_rows = list(
            session.exec(
                select(ContractWorkflowApproval).where(
                    ContractWorkflowApproval.contract_id.in_(contract_ids),
                    ContractWorkflowApproval.status == ApprovalStatus.PENDING,
                )
            ).all()
        )
    except Exception:
        logger.warning("Pending approvals lookup fallback for contracts list")
    if assigned_admin_ids:
        try:
            users = session.exec(select(User).where(User.id.in_(assigned_admin_ids))).all()
            assigned_admin_names = {
                int(user.id): (
                    getattr(user, "full_name", None)
                    or getattr(user, "email", None)
                    or f"Usuario #{user.id}"
                )
                for user in users
                if user.id is not None
            }
        except Exception:
            logger.warning("Assigned admin lookup fallback for contracts list")

    grouped: dict[int, list[ContractWorkflowApproval]] = defaultdict(list)
    for row in pending_rows:
        if row.contract_id is None:
            continue
        grouped[int(row.contract_id)].append(row)

    payloads = []
    for contract in contracts:
        pending_department = None
        pending_department_id = None
        pending_step_order = None

        if contract.id is not None:
            pending = sorted(
                grouped.get(int(contract.id), []),
                key=lambda item: (
                    item.step_order if item.step_order is not None else 10_000,
                    item.id or 0,
                ),
            )
            if pending:
                first = pending[0]
                pending_department = first.department_name
                pending_department_id = first.department_id
                pending_step_order = first.step_order

        payload = _safe_contract_read(contract).model_dump()
        payload["comparative_data"] = _sanitize_json_value(payload.get("comparative_data"))
        payload["contract_data"] = _sanitize_json_value(payload.get("contract_data"))
        payload["ocr_data"] = _sanitize_json_value(payload.get("ocr_data"))
        assigned_admin_user_id = payload.get("assigned_admin_user_id")
        if assigned_admin_user_id:
            payload["assigned_admin_user_name"] = assigned_admin_names.get(
                int(assigned_admin_user_id)
            )
        payload["current_pending_department"] = pending_department
        payload["current_pending_department_id"] = pending_department_id
        payload["current_pending_step_order"] = pending_step_order
        payload["comparative_status"] = _comparative_status_with_guard(
            session, contract, payload.get("comparative_status")
        )
        payloads.append(ContractRead.model_validate(payload))

    return payloads
