"""
FASE 7 — Revisión multi-rol con lógica AND (4 aprobadores).

Cuatro slots deben aprobar de forma independiente y simultánea:
  - ADMIN              (cualquier user de Department "Administración" con can_approve_contract)
  - JURIDICO           (cualquier user de Department "Jurídico" con can_approve_contract)
  - JEFE_OBRA          (el creador del contrato, debe ser Position role_code='JO')
  - DIRECTOR_TECNICO   (el DT asignado al JO creador via EmployeeProfile.director_tecnico_id)

Reglas:
  - El contrato no avanza hasta que los 4 estén en APPROVED.
  - Cualquier rol puede rechazar → contrato.status = REJECTED (terminal,
    bloquea edit/regenerate).
  - Si los 4 aprueban → contrato.status = FULLY_APPROVED.

Guard al entrar en PENDING_REVIEW: el creador debe ser JO con
director_tecnico_id != NULL. Sin DT asignado no puede haber contrato.

Usa tabla `contract_approval` (modelo ContractApproval), columna
approver_role con valores del enum ContractApproverRole.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.platform.contracts_core.models import (
    ApprovalScope,
    ApprovalStatus,
    Contract,
    ContractApproval,
    ContractApproverRole,
    ContractStatus,
    ContractWorkflowApproval,
)
from app.platform.contracts_core.permissions import (
    _get_employee,
    _is_tenant_admin,
    _user_department_ids,
    can_approve_contract,
    can_reject_contract,
    ensure_tenant_access,
)
from app.domains.procurement.contracts import crud as contract_crud
from app.models.hr import Department, EmployeeDepartment, EmployeeProfile, Position
from app.models.notification import NotificationType
from app.models.user import User
from app.platform.notifications.service import create_notification

logger = logging.getLogger("app.procurement.review_service")


# Slot order (display + iteration determinism)
REVIEW_ROLES: list[tuple[ContractApproverRole, int, str]] = [
    (ContractApproverRole.ADMIN, 1, "administracion"),
    (ContractApproverRole.JURIDICO, 2, "juridico"),
    (ContractApproverRole.JEFE_OBRA, 3, "jefe_obra"),
    (ContractApproverRole.DIRECTOR_TECNICO, 4, "director_tecnico"),
]

ROLE_DISPLAY_NAMES: dict[ContractApproverRole, str] = {
    ContractApproverRole.ADMIN: "Administración",
    ContractApproverRole.JURIDICO: "Jurídico",
    ContractApproverRole.JEFE_OBRA: "Jefe de Obra",
    ContractApproverRole.DIRECTOR_TECNICO: "Director Técnico",
}

CONTRACT_REVIEW_ROLES: set[str] = {
    ContractApproverRole.ADMIN.value,
    ContractApproverRole.JURIDICO.value,
    ContractApproverRole.JEFE_OBRA.value,
    ContractApproverRole.DIRECTOR_TECNICO.value,
}


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _current_cycle(session: Session, contract: Contract) -> int:
    max_cycle = session.exec(
        select(ContractApproval.cycle_number).where(
            ContractApproval.tenant_id == contract.tenant_id,
            ContractApproval.contract_id == contract.id,
            ContractApproval.scope == ApprovalScope.CONTRACT.value,
        ).order_by(ContractApproval.cycle_number.desc())
    ).first()
    return int(max_cycle) if max_cycle else 1


def _get_review_approvals(
    session: Session,
    contract: Contract,
    *,
    cycle_number: Optional[int] = None,
) -> list[ContractApproval]:
    cycle = cycle_number if cycle_number is not None else _current_cycle(session, contract)
    rows = list(
        session.exec(
            select(ContractApproval)
            .where(
                ContractApproval.tenant_id == contract.tenant_id,
                ContractApproval.contract_id == contract.id,
                ContractApproval.scope == ApprovalScope.CONTRACT.value,
                ContractApproval.cycle_number == cycle,
            )
            .order_by(ContractApproval.step_order)
        ).all()
    )
    # Filtramos solo los 4 roles del flujo nuevo (por si hay filas legacy mezcladas).
    return [r for r in rows if r.approver_role in CONTRACT_REVIEW_ROLES]


def _resolve_creator_employee(
    session: Session, contract: Contract
) -> Optional[EmployeeProfile]:
    """EmployeeProfile del creador del contrato (Jefe de Obra que subió el comparativo)."""
    if not contract.created_by_id:
        return None
    return session.exec(
        select(EmployeeProfile).where(
            EmployeeProfile.user_id == contract.created_by_id,
            EmployeeProfile.tenant_id == contract.tenant_id,
            EmployeeProfile.is_active.is_(True),
        )
    ).one_or_none()


def _ensure_creator_has_dt(session: Session, contract: Contract) -> EmployeeProfile:
    """Valida que el creador es JO con director_tecnico_id asignado.
    Lanza HTTPException 400 si falta DT. Devuelve el EmployeeProfile del creador.
    """
    creator = _resolve_creator_employee(session, contract)
    if not creator:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se encontró el empleado creador del contrato.",
        )
    if not creator.director_tecnico_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "El Jefe de Obra creador no tiene Director Técnico asignado. "
                "Asigna un DT en RRHH antes de generar el contrato."
            ),
        )
    return creator


def _user_in_admin_department(session: Session, user: User) -> bool:
    """True si el usuario pertenece a un Department de Administración con
    can_approve_contract=True. Usado para gatear la fase borrador y el paso
    PENDING_DATA_VALIDATION → PENDING_REVIEW. super_admin y tenant_admin
    también pasan (bypass habitual de admins globales).
    """
    if user.is_super_admin:
        return True
    if _is_tenant_admin(session, user):
        return True
    employee = _get_employee(session, user)
    if not employee:
        return False
    dept_ids = _user_department_ids(session, employee)
    if not dept_ids:
        return False
    rows = session.exec(
        select(Department).where(Department.id.in_(dept_ids))
    ).all()
    target_names = {"administracion", "administración", "admin"}
    for dept in rows:
        if not dept:
            continue
        if not getattr(dept, "can_approve_contract", False):
            continue
        if (dept.name or "").strip().lower() in target_names:
            return True
    return False


def _user_in_juridico_department(session: Session, user: User) -> bool:
    """True si el usuario pertenece a un Department Jurídico/Legal con
    can_edit_contract=True. Usado para la excepción "Jurídico modifica el
    contrato en PENDING_REVIEW".
    """
    if user.is_super_admin:
        return True
    if _is_tenant_admin(session, user):
        return True
    employee = _get_employee(session, user)
    if not employee:
        return False
    dept_ids = _user_department_ids(session, employee)
    if not dept_ids:
        return False
    rows = session.exec(
        select(Department).where(Department.id.in_(dept_ids))
    ).all()
    target_names = {"juridico", "jurídico", "legal"}
    for dept in rows:
        if not dept:
            continue
        if not getattr(dept, "can_edit_contract", False):
            continue
        if (dept.name or "").strip().lower() in target_names:
            return True
    return False


def _user_matches_role(
    session: Session, user: User, role: ContractApproverRole, contract: Contract
) -> bool:
    """¿Este usuario puede actuar sobre este slot del contrato concreto?

    - ADMIN     → tiene Department "Administración" con can_approve_contract
    - JURIDICO  → tiene Department "Jurídico"/"Juridico"/"Legal" con can_approve_contract
    - JEFE_OBRA → es el creador del contrato y su Position.role_code='JO'
    - DIRECTOR_TECNICO → su EmployeeProfile.id == creator.director_tecnico_id
                         y su Position.role_code='DT'
    """
    if user.is_super_admin:
        return True

    employee = _get_employee(session, user)
    if not employee:
        return False

    if role in (ContractApproverRole.ADMIN, ContractApproverRole.JURIDICO):
        # Match por nombre de Department + cap aprobar contrato
        dept_ids = _user_department_ids(session, employee)
        if not dept_ids:
            return False
        rows = session.exec(
            select(Department).where(Department.id.in_(dept_ids))
        ).all()
        target_names = (
            {"administracion", "administración", "admin"}
            if role == ContractApproverRole.ADMIN
            else {"juridico", "jurídico", "legal"}
        )
        for dept in rows:
            if not dept:
                continue
            if not getattr(dept, "can_approve_contract", False):
                continue
            if (dept.name or "").strip().lower() in target_names:
                return True
        return False

    # JO / DT: depende del contrato concreto
    creator = _resolve_creator_employee(session, contract)
    if not creator:
        return False

    pos = session.get(Position, employee.position_id) if employee.position_id else None
    role_code = (getattr(pos, "role_code", None) or "").upper()

    if role == ContractApproverRole.JEFE_OBRA:
        return (
            role_code == "JO"
            and creator.id == employee.id
        )

    if role == ContractApproverRole.DIRECTOR_TECNICO:
        return (
            role_code == "DT"
            and creator.director_tecnico_id == employee.id
        )

    return False


def _notify_review_assignment(
    session: Session,
    *,
    contract: Contract,
    user_id: int,
    role_label: str,
) -> None:
    create_notification(
        session,
        tenant_id=contract.tenant_id,
        user_id=user_id,
        type=NotificationType.GENERIC,
        title=f"Contrato CT-{contract.id} pendiente de revisión",
        body=(
            f"Tienes una revisión pendiente como {role_label}.\n"
            f"ID contrato: CT-{contract.id}\n"
            f"Estado actual: {getattr(contract.status, 'value', contract.status)}"
        ),
        reference=f"contract_id={contract.id}&view=contrato-form",
        meta={
            "entity": "contract",
            "contract_id": contract.id,
            "view": "contrato-form",
            "mode": "ver",
            "event": "contract.review_assignment",
            "role": role_label,
        },
    )


def _notify_pending_review_users(session: Session, *, contract: Contract) -> None:
    creator = _resolve_creator_employee(session, contract)
    notified_user_ids: set[int] = set()

    if creator and creator.user_id:
        _notify_review_assignment(
            session,
            contract=contract,
            user_id=int(creator.user_id),
            role_label="Jefe de Obra",
        )
        notified_user_ids.add(int(creator.user_id))

    if creator and creator.director_tecnico_id:
        dt_profile = session.get(EmployeeProfile, creator.director_tecnico_id)
        if dt_profile and dt_profile.user_id and int(dt_profile.user_id) not in notified_user_ids:
            _notify_review_assignment(
                session,
                contract=contract,
                user_id=int(dt_profile.user_id),
                role_label="Director Técnico",
            )
            notified_user_ids.add(int(dt_profile.user_id))

    juridico_department_ids = {
        dept.id
        for dept in session.exec(select(Department).where(Department.tenant_id == contract.tenant_id)).all()
        if dept.id is not None and (dept.name or "").strip().lower() in {"juridico", "jurídico", "legal"}
    }
    if juridico_department_ids:
        juridico_rows = session.exec(
            select(User.id)
            .join(EmployeeProfile, EmployeeProfile.user_id == User.id)
            .join(EmployeeDepartment, EmployeeDepartment.employee_id == EmployeeProfile.id)
            .where(
                User.tenant_id == contract.tenant_id,
                User.is_active.is_(True),
                EmployeeProfile.tenant_id == contract.tenant_id,
                EmployeeProfile.is_active.is_(True),
                EmployeeDepartment.department_id.in_(tuple(juridico_department_ids)),
            )
        ).all()
        for user_id in juridico_rows:
            if not user_id or int(user_id) in notified_user_ids:
                continue
            _notify_review_assignment(
                session,
                contract=contract,
                user_id=int(user_id),
                role_label="Jurídico",
            )
            notified_user_ids.add(int(user_id))


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────


def initialize_review_approvals(
    session: Session,
    *,
    contract: Contract,
    auto_commit: bool = True,
    pre_approved_by_admin: Optional[User] = None,
    cycle_number: Optional[int] = None,
) -> list[ContractApproval]:
    """Crea los 4 slots de aprobación para el contrato.

    Llamado cuando contract.status → PENDING_REVIEW. Valida guard DT.

    Si `pre_approved_by_admin` se pasa, el slot ADMIN se crea ya APPROVED
    (el flujo nuevo: Admin aprueba primero en fase borrador y al promover el
    contrato a revisión su slot queda cerrado, abriendo los 3 restantes).

    Si `cycle_number` se pasa, se usa explícitamente (para abrir un ciclo
    nuevo tras un rechazo). Si no, se calcula el actual.
    """
    # Guard: creador JO con DT asignado.
    _ensure_creator_has_dt(session, contract)

    cycle = cycle_number if cycle_number is not None else _current_cycle(session, contract)
    existing = _get_review_approvals(session, contract, cycle_number=cycle)
    for row in existing:
        session.delete(row)
    session.flush()

    now = datetime.now(timezone.utc)
    created: list[ContractApproval] = []
    for role, order, _ in REVIEW_ROLES:
        is_admin_slot = role == ContractApproverRole.ADMIN
        pre_approved = is_admin_slot and pre_approved_by_admin is not None
        row = ContractApproval(
            tenant_id=contract.tenant_id,
            contract_id=contract.id,
            scope=ApprovalScope.CONTRACT.value,
            approver_role=role.value,
            step_order=order,
            status=ApprovalStatus.APPROVED if pre_approved else ApprovalStatus.PENDING,
            cycle_number=cycle,
            decided_by_id=pre_approved_by_admin.id if pre_approved else None,
            decided_at=now if pre_approved else None,
            comment="Aprobación de Administración (fase borrador)" if pre_approved else None,
        )
        created.append(row)
    session.add_all(created)
    if auto_commit:
        session.commit()
    else:
        session.flush()
    return created


def admin_approve_draft(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    """Administración aprueba el contrato en fase borrador.

    Transición: PENDING_DATA_VALIDATION → PENDING_REVIEW.
    Slot ADMIN se crea ya APPROVED; JURIDICO/JEFE_OBRA/DIRECTOR_TECNICO quedan
    PENDING. Si es un re-envío tras rechazo, abre un cycle_number nuevo.
    """
    ensure_tenant_access(user, tenant_id)
    if not _user_in_admin_department(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Administración puede aprobar contratos en fase borrador.",
        )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.status != ContractStatus.PENDING_DATA_VALIDATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "El contrato debe estar en estado PENDING_DATA_VALIDATION "
                f"(actual: {contract.status.value})."
            ),
        )

    # Guard: documento generado.
    from app.platform.contracts_core.models import ContractDocument, ContractDocumentType
    doc_exists = session.exec(
        select(ContractDocument.id).where(
            ContractDocument.tenant_id == contract.tenant_id,
            ContractDocument.contract_id == contract.id,
            ContractDocument.doc_type == ContractDocumentType.CONTRACT,
        )
    ).first()
    if not doc_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay PDF de contrato generado. Genera el documento antes de aprobar.",
        )

    # Determina el ciclo: si ya hay slots para el ciclo actual (re-envío tras
    # rechazo), abrimos ciclo+1 para que el histórico se conserve.
    current_cycle = _current_cycle(session, contract)
    existing = _get_review_approvals(session, contract, cycle_number=current_cycle)
    cycle_to_open = current_cycle + 1 if existing else current_cycle

    initialize_review_approvals(
        session,
        contract=contract,
        auto_commit=False,
        pre_approved_by_admin=user,
        cycle_number=cycle_to_open,
    )

    now = datetime.now(timezone.utc)
    contract.status = ContractStatus.PENDING_REVIEW
    contract.updated_at = now
    if not contract.submitted_at:
        contract.submitted_at = now
    session.add(contract)
    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.admin_approved_draft",
        payload={"cycle_number": cycle_to_open},
    )
    _notify_pending_review_users(session, contract=contract)
    session.commit()
    session.refresh(contract)
    return contract


def submit_role_decision(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    approved: bool,
    comment: Optional[str],
) -> Contract:
    """Un usuario decide sobre el slot que le corresponda.

    approved=True → APPROVED. Si los 4 quedan APPROVED → FULLY_APPROVED.
    approved=False → REJECTED. Contrato → status REJECTED (terminal).
                     Requiere comment.
    """
    ensure_tenant_access(user, tenant_id)

    if not approved and not (comment and comment.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comentario es obligatorio al rechazar el contrato.",
        )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.status != ContractStatus.PENDING_REVIEW:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El contrato no está en revisión (estado actual: {contract.status.value}).",
        )

    approvals = _get_review_approvals(session, contract)
    if not approvals:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hay aprobaciones inicializadas. Re-genera el contrato.",
        )

    admin_bypass = user.is_super_admin or _is_tenant_admin(session, user)

    # Cap check
    if approved and not (admin_bypass or can_approve_contract(session, user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    if not approved and not (admin_bypass or can_reject_contract(session, user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    # Resolver target slot.
    #
    # Importante: aunque el usuario sea super_admin / tenant_admin, si su
    # identidad concreta (Position) lo identifica como JO/DT/Admin/Jurídico de
    # este contrato, debe aprobar SOLO su slot. El bypass de aprobación en
    # bloque queda reservado a admins SIN slot propio (p.ej. un tenant_admin
    # global que no es JO/DT/Admin/Juridico de este contrato concreto).
    target: Optional[ContractApproval] = None
    try:
        for slot in approvals:
            if slot.status != ApprovalStatus.PENDING:
                continue
            role_enum = ContractApproverRole(slot.approver_role)
            if _user_matches_role(session, user, role_enum, contract):
                target = slot
                break
    except ValueError:
        target = None

    if target is None and admin_bypass:
        # admin sin slot propio: aprueba todos los pendientes en un solo clic;
        # al rechazar, actúa sobre el primer slot pendiente.
        if approved:
            now = datetime.now(timezone.utc)
            for slot in approvals:
                if slot.status != ApprovalStatus.APPROVED:
                    slot.status = ApprovalStatus.APPROVED
                    slot.decided_by_id = user.id
                    slot.decided_at = now
                    slot.comment = (comment or "").strip() or slot.comment
                    session.add(slot)
            contract.status = ContractStatus.FULLY_APPROVED
            contract.approved_at = now
            contract.updated_at = now
            session.add(contract)
            contract_crud._log_event(
                session,
                tenant_id=tenant_id,
                contract_id=contract.id,
                user_id=user.id,
                event_type="contract.fully_approved",
                payload={
                    "forced_by_superadmin": user.is_super_admin,
                    "forced_by_tenant_admin": (not user.is_super_admin)
                    and _is_tenant_admin(session, user),
                },
            )
            session.commit()
            session.refresh(contract)
            return contract
        target = next((s for s in approvals if s.status == ApprovalStatus.PENDING), None)

    if not target:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes un rol de aprobación pendiente sobre este contrato.",
        )

    # Gate secuencial: hasta que el slot ADMIN del ciclo activo esté APPROVED,
    # los demás roles (JURIDICO/JEFE_OBRA/DIRECTOR_TECNICO) no pueden decidir.
    # En el flujo nuevo Admin pre-aprueba al promover el borrador
    # (admin_approve_draft), así que ADMIN siempre llega APPROVED a este punto.
    # Este gate cubre el caso de contratos legacy que entraron a PENDING_REVIEW
    # sin pasar por admin_approve_draft.
    if target.approver_role != ContractApproverRole.ADMIN.value:
        admin_slot = next(
            (
                s
                for s in approvals
                if s.approver_role == ContractApproverRole.ADMIN.value
            ),
            None,
        )
        if admin_slot is None or admin_slot.status != ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Administración debe aprobar el contrato antes de que "
                    "Jurídico, Jefe de Obra o Director Técnico puedan decidir."
                ),
            )

    now = datetime.now(timezone.utc)

    if not approved:
        target.status = ApprovalStatus.REJECTED
        target.decided_by_id = user.id
        target.decided_at = now
        target.comment = (comment or "").strip() or None
        session.add(target)
        # Rechazo NO terminal: el contrato vuelve a fase borrador
        # (PENDING_DATA_VALIDATION) y queda editable por Administración.
        # Los slots de revisión del ciclo actual quedan cerrados (este
        # rechazado + los pendientes se "congelan"); cuando Admin pulse
        # /admin-approve-draft se abrirá un cycle_number+1 nuevo.
        # Anotamos rejected_* en el contrato para trazabilidad del último
        # rechazo, pero el estado terminal REJECTED ya NO se usa para el
        # ciclo normal.
        contract.status = ContractStatus.PENDING_DATA_VALIDATION
        contract.rejected_by_id = user.id
        contract.rejected_at = now
        contract.rejected_reason = (comment or "").strip() or None
        contract.updated_at = now
        session.add(contract)
        contract_crud._log_event(
            session,
            tenant_id=tenant_id,
            contract_id=contract.id,
            user_id=user.id,
            event_type="contract.review_rejected",
            payload={
                "role": target.approver_role,
                "reason": comment,
                "cycle_number": target.cycle_number,
                "returns_to": ContractStatus.PENDING_DATA_VALIDATION.value,
            },
        )
        session.commit()
        session.refresh(contract)
        return contract

    # approved = True
    target.status = ApprovalStatus.APPROVED
    target.decided_by_id = user.id
    target.decided_at = now
    target.comment = (comment or "").strip() or None
    session.add(target)
    session.flush()

    updated = _get_review_approvals(session, contract)
    all_approved = all(a.status == ApprovalStatus.APPROVED for a in updated) and len(updated) == 4

    if all_approved:
        contract.status = ContractStatus.FULLY_APPROVED
        contract.approved_at = now
        contract.updated_at = now
        session.add(contract)
        contract_crud._log_event(
            session,
            tenant_id=tenant_id,
            contract_id=contract.id,
            user_id=user.id,
            event_type="contract.fully_approved",
        )
    else:
        contract.updated_at = now
        session.add(contract)
        contract_crud._log_event(
            session,
            tenant_id=tenant_id,
            contract_id=contract.id,
            user_id=user.id,
            event_type="contract.review_partial_approval",
            payload={"role": target.approver_role},
        )

    session.commit()
    session.refresh(contract)
    return contract


def reject_due_to_juridico_edit(
    session: Session,
    *,
    contract: Contract,
    user: User,
) -> Contract:
    """Jurídico modificó el contrato en PENDING_REVIEW.

    Cierra el ciclo actual marcando el slot JURIDICO como REJECTED con
    comentario auto-generado y devuelve el contrato a PENDING_DATA_VALIDATION
    para que Administración revise los cambios y vuelva a aprobar (lo que
    abrirá un cycle_number nuevo).

    No requiere comentario del usuario: el motivo es estructural.
    """
    approvals = _get_review_approvals(session, contract)
    juridico_slot = next(
        (a for a in approvals if a.approver_role == ContractApproverRole.JURIDICO.value),
        None,
    )
    now = datetime.now(timezone.utc)
    auto_comment = (
        "Jurídico modificó el contrato durante la revisión: vuelve a "
        "Administración con los cambios aplicados."
    )

    if juridico_slot is not None:
        juridico_slot.status = ApprovalStatus.REJECTED
        juridico_slot.decided_by_id = user.id
        juridico_slot.decided_at = now
        juridico_slot.comment = auto_comment
        session.add(juridico_slot)

    contract.status = ContractStatus.PENDING_DATA_VALIDATION
    contract.rejected_by_id = user.id
    contract.rejected_at = now
    contract.rejected_reason = auto_comment
    contract.updated_at = now
    session.add(contract)

    contract_crud._log_event(
        session,
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.juridico_modified",
        payload={
            "cycle_number": juridico_slot.cycle_number if juridico_slot else None,
            "returns_to": ContractStatus.PENDING_DATA_VALIDATION.value,
        },
    )

    session.commit()
    session.refresh(contract)
    return contract


def get_all_review_approvals(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[ContractApproval]:
    """Todos los slots de revisión del contrato, todos los ciclos.

    Para construir el historial completo en el frontend. Ordenados por
    cycle_number, step_order.
    """
    ensure_tenant_access(user, tenant_id)
    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    rows = list(
        session.exec(
            select(ContractApproval)
            .where(
                ContractApproval.tenant_id == contract.tenant_id,
                ContractApproval.contract_id == contract.id,
                ContractApproval.scope == ApprovalScope.CONTRACT.value,
            )
            .order_by(ContractApproval.cycle_number, ContractApproval.step_order)
        ).all()
    )
    return [r for r in rows if r.approver_role in CONTRACT_REVIEW_ROLES]


def get_review_approvals(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[ContractWorkflowApproval]:
    """Compat: devuelve los 4 slots como objetos con la forma que espera la UI.

    El endpoint /review-approvals los serializa con campos department_name /
    step_order / status / decided_by_id / decided_at / comment. Mantenemos esa
    forma para no romper el frontend.
    """
    ensure_tenant_access(user, tenant_id)
    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    rows = _get_review_approvals(session, contract)
    # Devolvemos los objetos ContractApproval. El router serializa por atributos
    # — añadimos un alias en la respuesta del router (workflow_router.py).
    return rows  # type: ignore[return-value]
