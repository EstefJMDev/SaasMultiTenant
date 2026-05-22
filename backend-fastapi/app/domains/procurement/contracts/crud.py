from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import delete, func, or_
from sqlalchemy.exc import DataError, IntegrityError, SQLAlchemyError
from sqlmodel import Session, select

from app.platform.contracts_core.models import (
    ACTIVE_APPROVAL_STATUSES,
    ApprovalStatus,
    ApprovalScope,
    ComparativeStatus,
    Contract,
    ContractApproval,
    ContractDepartment,
    ContractDocument,
    ContractEvent,
    ContractNotificationLog,
    ContractOffer,
    ContractStatus,
    ContractWorkflowApproval,
    SignatureRequest,
    Supplier,
    SupplierDataRequest,
    SupplierInvitation,
    SupplierStatus,
)
from app.platform.contracts_core.permissions import (
    _is_tenant_admin,
    can_read_comparative,
    can_create_contract,
    can_edit_contract,
    can_view_all_comparatives,
    can_view_all_contracts,
    can_view_contract,
    can_write_comparative,
    ensure_tenant_access,
)
from app.domains.procurement.contracts import validators as contract_validators
from app.models.hr import Department, EmployeeDepartment, EmployeeProfile, Position
from app.models.notification import NotificationType
from app.models.user import User
from app.platform.notifications.service import create_notification


def _get_jo_subordinado_user_ids(session: Session, *, current_user: User, tenant_id: int) -> list[int]:
    """Si current_user es Director Técnico (Position.role_code='DT'), devuelve los user_id
    de los Jefes de Obra que tienen director_tecnico_id apuntando a su EmployeeProfile.
    Devuelve [] si el usuario no es DT o no tiene JOs asignados."""
    my_profile = session.exec(
        select(EmployeeProfile).where(
            EmployeeProfile.user_id == current_user.id,
            EmployeeProfile.tenant_id == tenant_id,
        )
    ).one_or_none()
    if not my_profile or not my_profile.position_id:
        return []
    my_position = session.get(Position, my_profile.position_id)
    if not my_position or (my_position.role_code or "").upper() != "DT":
        return []
    rows = session.exec(
        select(EmployeeProfile.user_id).where(
            EmployeeProfile.tenant_id == tenant_id,
            EmployeeProfile.director_tecnico_id == my_profile.id,
            EmployeeProfile.user_id.is_not(None),
        )
    ).all()
    return [int(uid) for uid in rows if uid is not None]

logger = logging.getLogger("app.platform.contracts_core")

_ADMIN_REVIEW_DEPARTMENT_NAMES = {"administracion", "administración", "admin"}
_PRE_ADMIN_CONTRACT_STATUSES = {
    ContractStatus.PENDING_SUPPLIER,
    ContractStatus.PENDING_TEMPLATE,
    ContractStatus.PENDING_DATA_VALIDATION,
}


# Registry centralizado para eliminación manual por contract_id.
# Mantener el orden evita sorpresas con FKs entre tablas hijas.
_CONTRACT_DELETE_MODELS = (
    ContractNotificationLog,
    ContractEvent,
    ContractApproval,
    ContractWorkflowApproval,
    SupplierDataRequest,
    SignatureRequest,
    SupplierInvitation,
    ContractDocument,
    ContractOffer,
)


def _clean_text(value: object) -> Optional[str]:
    if not isinstance(value, str):
        return None
    return contract_validators.normalize_human_text(value)


def _first_non_empty(*values: object) -> Optional[str]:
    for value in values:
        cleaned = _clean_text(value)
        if cleaned:
            return cleaned
    return None


def _parse_amount(value: object) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        parsed = float(value)
        return parsed if parsed > 0 else None
    if not isinstance(value, str):
        return None
    token = value.strip()
    if not token:
        return None
    compact = token.replace(" ", "")
    if "," in compact and "." in compact:
        if compact.rfind(",") > compact.rfind("."):
            normalized = compact.replace(".", "").replace(",", ".")
        else:
            normalized = compact.replace(",", "")
    elif "," in compact:
        normalized = compact.replace(".", "").replace(",", ".")
    else:
        normalized = compact.replace(",", "")
    try:
        parsed = float(normalized)
    except ValueError:
        return None
    return parsed if parsed > 0 else None


def _merge_contract_data_from_comparative(
    comparative_data: object,
    contract_data: object,
) -> dict:
    base_contract_data = dict(contract_data or {}) if isinstance(contract_data, dict) else {}
    if not isinstance(comparative_data, dict):
        return base_contract_data

    data = dict(comparative_data)
    header = dict(data.get("header") or {}) if isinstance(data.get("header"), dict) else {}
    totals = dict(data.get("totales") or {}) if isinstance(data.get("totales"), dict) else {}

    offers_raw = data.get("offers")
    offers = [item for item in offers_raw if isinstance(item, dict)] if isinstance(offers_raw, list) else []
    selected_offer_id = data.get("selected_offer_id")
    selected_offer = None
    if selected_offer_id is not None:
        selected_offer = next(
            (
                item
                for item in offers
                if item.get("id") is not None and str(item.get("id")) == str(selected_offer_id)
            ),
            None,
        )
    if selected_offer is None and offers:
        selected_offer = offers[0]

    schedule = dict(base_contract_data.get("schedule") or {})
    project = dict(base_contract_data.get("project") or {})
    resources = dict(base_contract_data.get("resources") or {})
    economic = dict(base_contract_data.get("economic") or {})
    additional = dict(base_contract_data.get("additional") or {})
    manager = dict(base_contract_data.get("manager") or {})

    obra_num = _first_non_empty(
        resources.get("work_number"),
        header.get("obra_num"),
        data.get("obra_num"),
    )
    if obra_num:
        resources["work_number"] = obra_num

    obra_nombre = _first_non_empty(
        project.get("nombre_obra"),
        header.get("obra_nombre"),
        data.get("obra"),
    )
    if obra_nombre:
        project["nombre_obra"] = obra_nombre

    fecha_solicitud = _first_non_empty(
        schedule.get("request_date"),
        header.get("fecha"),
        data.get("fecha_solicitud"),
    )
    if fecha_solicitud:
        schedule["request_date"] = fecha_solicitud

    jefe_obra = _first_non_empty(
        manager.get("nombre_gerente"),
        additional.get("nombre_contacto"),
        data.get("jefe_obra"),
        header.get("jefe_obra"),
    )
    if jefe_obra:
        manager["nombre_gerente"] = jefe_obra
        additional["nombre_contacto"] = additional.get("nombre_contacto") or jefe_obra

    forma_pago = _first_non_empty(
        economic.get("payment_method"),
        totals.get("forma_pago"),
        selected_offer.get("pago") if isinstance(selected_offer, dict) else None,
    )
    if forma_pago:
        economic["payment_method"] = forma_pago

    if schedule:
        base_contract_data["schedule"] = schedule
    if project:
        base_contract_data["project"] = project
    if resources:
        base_contract_data["resources"] = resources
    if economic:
        base_contract_data["economic"] = economic
    if additional:
        base_contract_data["additional"] = additional
    if manager:
        base_contract_data["manager"] = manager

    return base_contract_data


def _derive_snapshot_from_comparative(comparative_data: object) -> dict:
    if not isinstance(comparative_data, dict):
        return {}

    data = dict(comparative_data)
    header = dict(data.get("header") or {}) if isinstance(data.get("header"), dict) else {}
    totals = dict(data.get("totales") or {}) if isinstance(data.get("totales"), dict) else {}
    offers_raw = data.get("offers")
    offers = [item for item in offers_raw if isinstance(item, dict)] if isinstance(offers_raw, list) else []
    selected_offer_id = data.get("selected_offer_id")
    selected_offer = None
    if selected_offer_id is not None:
        selected_offer = next(
            (
                item
                for item in offers
                if item.get("id") is not None and str(item.get("id")) == str(selected_offer_id)
            ),
            None,
        )
    if selected_offer is None and offers:
        selected_offer = offers[0]

    supplier_email = _first_non_empty(
        selected_offer.get("supplier_email") if isinstance(selected_offer, dict) else None,
        data.get("email_contacto"),
    )
    supplier_phone = _first_non_empty(
        selected_offer.get("supplier_phone") if isinstance(selected_offer, dict) else None,
        data.get("telefono_contacto"),
    )
    # No usar jefe_obra como fallback: el contacto del proveedor es manual,
    # nunca debe heredar el nombre del jefe de obra (que suele ser el usuario interno).
    supplier_contact_name = data.get("nombre_contacto")
    total_amount = _parse_amount(
        selected_offer.get("total_amount") if isinstance(selected_offer, dict) else None,
    ) or _parse_amount(totals.get("total_ofertado_proveedor"))

    return {
        "supplier_email": supplier_email,
        "supplier_phone": supplier_phone,
        "supplier_contact_name": supplier_contact_name,
        "total_amount": total_amount,
    }


def _merge_preserving_existing(existing: object, incoming: object) -> object:
    """Merge para PATCH: conserva solo claves ausentes; respeta borrado explicito."""
    if isinstance(existing, dict) and isinstance(incoming, dict):
        merged: dict = dict(existing)
        for key, value in incoming.items():
            prev = merged.get(key)
            merged[key] = _merge_preserving_existing(prev, value)
        return merged
    return incoming


def _normalize_contract_payload_aliases(payload_to_apply: dict) -> dict:
    """Sincroniza alias comunes para evitar perdida de datos entre pantallas."""
    normalized = dict(payload_to_apply)
    contract_data = normalized.get("contract_data")
    if not isinstance(contract_data, dict):
        return normalized

    data = dict(contract_data)
    schedule = dict(data.get("schedule") or {})
    project = dict(data.get("project") or {})
    resources = dict(data.get("resources") or {})
    additional = dict(data.get("additional") or {})

    changed = False

    incoming_phone = normalized.get("supplier_phone")
    if isinstance(incoming_phone, str) and incoming_phone.strip():
        phone = incoming_phone.strip()
        if not str(additional.get("telefono_contacto") or "").strip():
            additional["telefono_contacto"] = phone
            changed = True
    elif isinstance(additional.get("telefono_contacto"), str) and additional.get("telefono_contacto", "").strip():
        if normalized.get("supplier_phone") in (None, ""):
            normalized["supplier_phone"] = str(additional["telefono_contacto"]).strip()

    start_date = schedule.get("start_date") or project.get("fecha_inicio")
    end_date = schedule.get("end_date") or project.get("fecha_fin")
    if start_date and not schedule.get("start_date"):
        schedule["start_date"] = start_date
        changed = True
    if start_date and not project.get("fecha_inicio"):
        project["fecha_inicio"] = start_date
        changed = True
    if end_date and not schedule.get("end_date"):
        schedule["end_date"] = end_date
        changed = True
    if end_date and not project.get("fecha_fin"):
        project["fecha_fin"] = end_date
        changed = True

    workers = resources.get("workers_count")
    if workers in (None, ""):
        workers = resources.get("workers_on_site")
    if workers not in (None, ""):
        if resources.get("workers_count") in (None, ""):
            resources["workers_count"] = workers
            changed = True
        if resources.get("workers_on_site") in (None, ""):
            resources["workers_on_site"] = workers
            changed = True

    if changed:
        data["schedule"] = schedule
        data["project"] = project
        data["resources"] = resources
        data["additional"] = additional
        normalized["contract_data"] = data

    return normalized


def _get_contract_or_404(session: Session, contract_id: int, tenant_id: int) -> Contract:
    statement = select(Contract).where(
        Contract.id == contract_id,
        Contract.tenant_id == tenant_id,
        Contract.deleted_at.is_(None),  # Only active contracts
    )
    contract = session.exec(statement).one_or_none()
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contrato no encontrado.",
        )
    return contract


def _get_offer_or_404(session: Session, offer_id: int, tenant_id: int) -> ContractOffer:
    statement = select(ContractOffer).where(
        ContractOffer.id == offer_id,
        ContractOffer.tenant_id == tenant_id,
    )
    offer = session.exec(statement).one_or_none()
    if not offer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Oferta no encontrada.",
        )
    return offer


def ensure_supplier_snapshot(session: Session, *, contract: Contract) -> None:
    from app.domains.procurement.suppliers import (
        get_provider_by_tax_id_and_type,
        get_supplier_by_tax_id,
        sync_contract_from_provider,
    )

    changed = False
    selected_offer: Optional[ContractOffer] = None

    # Fuente canónica de datos legales del proveedor: tabla `proveedores`
    # (universal, consolidada del ERP). Si el contrato no tiene aún rellenas las
    # columnas dedicadas `supplier_legal_rep_name`/`_dni`, las hereda de aquí
    # ANTES de mirar `Supplier` (que puede estar obsoleto). Esto también
    # neutraliza el caso en que el JSONB `manager.nombre_gerente` venga con
    # basura del wizard (ej: textos de prueba) y la plantilla acabe usándolo
    # como fallback.
    if contract.supplier_tax_id and (
        not contract.supplier_legal_rep_name or not contract.supplier_legal_rep_dni
    ):
        provider = get_provider_by_tax_id_and_type(
            session,
            tax_id=contract.supplier_tax_id,
            contract_type=contract.type,
        )
        if provider:
            sync_contract_from_provider(contract, provider)
            changed = True

    if contract.selected_offer_id:
        selected_offer = _get_offer_or_404(session, contract.selected_offer_id, contract.tenant_id)
        if selected_offer.contract_id == contract.id:
            if selected_offer.supplier_name and not contract.supplier_name:
                contract.supplier_name = selected_offer.supplier_name
                changed = True
            if selected_offer.supplier_tax_id and not contract.supplier_tax_id:
                contract.supplier_tax_id = selected_offer.supplier_tax_id
                changed = True
            if selected_offer.supplier_email and not contract.supplier_email:
                contract.supplier_email = selected_offer.supplier_email
                changed = True
            if selected_offer.supplier_phone and not contract.supplier_phone:
                contract.supplier_phone = selected_offer.supplier_phone
                changed = True
            # Total/currency se actualizan desde la oferta seleccionada.
            if selected_offer.total_amount is not None and contract.total_amount != selected_offer.total_amount:
                contract.total_amount = selected_offer.total_amount
                changed = True
            if selected_offer.currency and contract.currency != selected_offer.currency:
                contract.currency = selected_offer.currency
                changed = True

    supplier = None
    if contract.supplier_id:
        supplier = session.get(Supplier, contract.supplier_id)
    if not supplier and contract.supplier_tax_id:
        supplier = get_supplier_by_tax_id(
            session,
            tenant_id=contract.tenant_id,
            tax_id=contract.supplier_tax_id,
        )
    if supplier:
        before = (
            contract.supplier_name,
            contract.supplier_email,
            contract.supplier_phone,
            contract.supplier_address,
            contract.supplier_city,
            contract.supplier_postal_code,
            contract.supplier_country,
            contract.supplier_contact_name,
            contract.supplier_bank_iban,
            contract.supplier_bank_bic,
        )
        contract.supplier_name = contract.supplier_name or supplier.name
        contract.supplier_email = contract.supplier_email or supplier.email
        contract.supplier_phone = contract.supplier_phone or supplier.phone
        contract.supplier_address = contract.supplier_address or supplier.address
        contract.supplier_city = contract.supplier_city or supplier.city
        contract.supplier_postal_code = contract.supplier_postal_code or supplier.postal_code
        contract.supplier_country = contract.supplier_country or supplier.country
        contract.supplier_contact_name = contract.supplier_contact_name or supplier.contact_name
        contract.supplier_bank_iban = contract.supplier_bank_iban or supplier.bank_iban
        contract.supplier_bank_bic = contract.supplier_bank_bic or supplier.bank_bic
        after = (
            contract.supplier_name,
            contract.supplier_email,
            contract.supplier_phone,
            contract.supplier_address,
            contract.supplier_city,
            contract.supplier_postal_code,
            contract.supplier_country,
            contract.supplier_contact_name,
            contract.supplier_bank_iban,
            contract.supplier_bank_bic,
        )
        if before != after:
            changed = True

        # Vuelca representante legal + datos de escritura del Supplier a
        # contract_data.manager para que la plantilla rellene [NOMBRE_GERENTE],
        # [NIF_GERENTE], [TIPO_ESCRITURA], [NOMBRE_NOTARIO], [NUMERO_PROTOCOLO].
        # No sobreescribe si el contrato ya trae estos datos (form manual).
        def _clean(value: object) -> str:
            return str(value).strip() if isinstance(value, str) and value.strip() else ""

        # `proveedores` (universal) manda sobre Supplier legacy: si hay fila
        # canónica para este CIF usamos sus datos del gerente/escritura, porque
        # `Supplier` puede haberse contaminado con datos de otro proveedor
        # (ej: el mismo `legal_rep_dni` apareció en supplier de otro CIF).
        provider_canon = None
        if contract.supplier_tax_id:
            try:
                provider_canon = get_provider_by_tax_id_and_type(
                    session,
                    tax_id=contract.supplier_tax_id,
                    contract_type=contract.type,
                )
            except Exception:
                logger.warning(
                    "Lookup canónico `proveedores` falló al snapshot contract_id=%s tax_id=%s",
                    contract.id,
                    contract.supplier_tax_id,
                    exc_info=True,
                )

        if provider_canon:
            manager_fields = {
                "legal_rep_name": _clean(provider_canon.get("nombre_gerente")) or _clean(supplier.legal_rep_name),
                "legal_rep_dni": _clean(provider_canon.get("nif_gerente") or provider_canon.get("dni_gerente")) or _clean(supplier.legal_rep_dni),
                "deed_type": _clean(provider_canon.get("tipo_escritura")) or _clean(supplier.deed_type),
                "notary_name": _clean(provider_canon.get("nombre_notario")) or _clean(supplier.notary_name),
                "notary_protocol": _clean(provider_canon.get("numero_protocolo") or provider_canon.get("num_protocolo")) or _clean(supplier.notary_protocol),
            }
            # Detecta drift: Supplier discrepa de `proveedores`. Log para auditoría.
            canon_dni = _clean(provider_canon.get("nif_gerente") or provider_canon.get("dni_gerente"))
            supplier_dni = _clean(supplier.legal_rep_dni)
            if canon_dni and supplier_dni and canon_dni != supplier_dni:
                logger.warning(
                    "Drift legal_rep contract_id=%s tax_id=%s supplier.legal_rep_dni=%s vs proveedores.nif_gerente=%s — usando proveedores",
                    contract.id,
                    contract.supplier_tax_id,
                    supplier_dni,
                    canon_dni,
                )
        else:
            manager_fields = {
                "legal_rep_name": _clean(supplier.legal_rep_name),
                "legal_rep_dni": _clean(supplier.legal_rep_dni),
                "deed_type": _clean(supplier.deed_type),
                "notary_name": _clean(supplier.notary_name),
                "notary_protocol": _clean(supplier.notary_protocol),
            }
        if any(manager_fields.values()):
            current_data = dict(contract.contract_data or {})
            manager_block = dict(current_data.get("manager") or {})
            legal_block = dict(current_data.get("legal") or {})
            mgr_changed = False
            for key, value in manager_fields.items():
                if value and _clean(manager_block.get(key)) != value:
                    manager_block[key] = value
                    mgr_changed = True
            if manager_fields.get("deed_type") and _clean(legal_block.get("tipo_escritura")) != manager_fields["deed_type"]:
                legal_block["tipo_escritura"] = manager_fields["deed_type"]
                mgr_changed = True
            if contract.deed_date:
                deed_date_iso = str(contract.deed_date)
                if _clean(legal_block.get("fecha_escritura")) != deed_date_iso:
                    legal_block["fecha_escritura"] = deed_date_iso
                    mgr_changed = True
            if manager_fields.get("notary_name") and _clean(legal_block.get("nombre_notario")) != manager_fields["notary_name"]:
                legal_block["nombre_notario"] = manager_fields["notary_name"]
                mgr_changed = True
            if manager_fields.get("notary_protocol") and _clean(legal_block.get("num_protocolo")) != manager_fields["notary_protocol"]:
                legal_block["num_protocolo"] = manager_fields["notary_protocol"]
                mgr_changed = True
            if mgr_changed:
                current_data["manager"] = manager_block
                current_data["legal"] = legal_block
                contract.contract_data = current_data
                changed = True

    if changed:
        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)


def _get_user_department_ids_for_tenant(
    session: Session,
    *,
    user: User,
    tenant_id: int,
) -> set[int]:
    if not user.id:
        return set()
    profile = session.exec(
        select(EmployeeProfile).where(
            EmployeeProfile.user_id == user.id,
            EmployeeProfile.tenant_id == tenant_id,
            EmployeeProfile.is_active.is_(True),
        )
    ).one_or_none()
    if not profile:
        return set()
    rows = session.exec(
        select(EmployeeDepartment.department_id).where(
            EmployeeDepartment.employee_id == profile.id
        )
    ).all()
    values: set[int] = set()
    for row in rows:
        if isinstance(row, tuple):
            value = row[0]
        else:
            value = row
        if value:
            values.add(int(value))
    return values


def _user_in_named_departments(
    session: Session,
    *,
    user: User,
    tenant_id: int,
    accepted_names: set[str],
) -> bool:
    department_ids = _get_user_department_ids_for_tenant(
        session,
        user=user,
        tenant_id=tenant_id,
    )
    if not department_ids:
        return False
    rows = session.exec(select(Department).where(Department.id.in_(department_ids))).all()
    return any(
        ((department.name or "").strip().lower() in accepted_names)
        for department in rows
        if department is not None
    )


def _user_can_access_admin_draft_contract(
    session: Session,
    *,
    user: User,
    tenant_id: int,
) -> bool:
    return (
        user.is_super_admin
        or _is_tenant_admin(session, user)
        or _user_in_named_departments(
            session,
            user=user,
            tenant_id=tenant_id,
            accepted_names=_ADMIN_REVIEW_DEPARTMENT_NAMES,
        )
    )


def _is_hidden_contract_pre_admin_status(contract: Contract) -> bool:
    if contract.status in _PRE_ADMIN_CONTRACT_STATUSES:
        return True
    return (
        contract.status == ContractStatus.DRAFT
        and contract.comparative_status == ComparativeStatus.APPROVED
    )


def _list_admin_assignment_candidates(
    session: Session,
    *,
    tenant_id: int,
) -> list[tuple[int, str]]:
    rows = session.exec(
        select(User, EmployeeProfile, Department)
        .join(EmployeeProfile, EmployeeProfile.user_id == User.id)
        .join(EmployeeDepartment, EmployeeDepartment.employee_id == EmployeeProfile.id)
        .join(Department, Department.id == EmployeeDepartment.department_id)
        .where(
            User.tenant_id == tenant_id,
            User.is_active.is_(True),
            EmployeeProfile.tenant_id == tenant_id,
            EmployeeProfile.is_active.is_(True),
            User.id.is_not(None),
        )
    ).all()

    target_names = {"administracion", "administración", "admin"}
    candidates: dict[int, str] = {}
    for user, _employee, department in rows:
        if department is None:
            continue
        dept_name = (department.name or "").strip().lower()
        if dept_name not in target_names:
            continue
        if not (
            getattr(department, "can_edit_contract", False)
            or getattr(department, "can_approve_contract", False)
        ):
            continue
        display_name = (
            getattr(user, "full_name", None)
            or getattr(user, "email", None)
            or f"Usuario #{user.id}"
        )
        candidates[int(user.id)] = display_name
    return sorted(candidates.items(), key=lambda item: item[0])


def _notify_admin_assignment(
    session: Session,
    *,
    contract: Contract,
    assigned_user_id: int,
) -> None:
    title = f"Contrato CT-{contract.id} asignado para revisión"
    body_lines = [
        "Tienes un contrato asignado en fase de revisión administrativa.",
        f"ID contrato: CT-{contract.id}",
        f"Estado actual: {getattr(contract.status, 'value', contract.status)}",
    ]
    supplier_name = (contract.supplier_name or "").strip()
    if supplier_name:
        body_lines.append(f"Proveedor: {supplier_name}")
    create_notification(
        session,
        tenant_id=contract.tenant_id,
        user_id=assigned_user_id,
        type=NotificationType.GENERIC,
        title=title,
        body="\n".join(body_lines),
        reference=f"contract_id={contract.id}&view=contrato-form",
        meta={
            "entity": "contract",
            "contract_id": contract.id,
            "view": "contrato-form",
            "mode": "editar",
            "event": "contract.admin_assignment",
        },
    )


def ensure_contract_admin_assignment(
    session: Session,
    *,
    contract: Contract,
) -> bool:
    """Asigna un administrativo de forma equitativa para la cola inicial.

    Distribución: menor número de contratos activos asignados en fase
    administrativa (`DRAFT` / `PENDING_TEMPLATE` / `PENDING_DATA_VALIDATION`).
    """
    candidates = _list_admin_assignment_candidates(session, tenant_id=contract.tenant_id)
    if not candidates:
        return False

    candidate_ids = [candidate_id for candidate_id, _ in candidates]
    active_statuses = [
        ContractStatus.DRAFT,
        ContractStatus.PENDING_TEMPLATE,
        ContractStatus.PENDING_DATA_VALIDATION,
    ]
    count_rows = session.exec(
        select(
            Contract.assigned_admin_user_id,
            func.count(Contract.id),
        )
        .where(
            Contract.tenant_id == contract.tenant_id,
            Contract.deleted_at.is_(None),
            Contract.assigned_admin_user_id.in_(candidate_ids),
            Contract.status.in_(active_statuses),
        )
        .group_by(Contract.assigned_admin_user_id)
    ).all()
    load_by_user = {
        int(user_id): int(total or 0)
        for user_id, total in count_rows
        if user_id is not None
    }

    current_assignee = getattr(contract, "assigned_admin_user_id", None)
    if current_assignee in candidate_ids:
        return False

    selected_user_id, _selected_name = min(
        candidates,
        key=lambda item: (load_by_user.get(item[0], 0), item[0]),
    )
    contract.assigned_admin_user_id = selected_user_id
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    session.flush()
    _notify_admin_assignment(
        session,
        contract=contract,
        assigned_user_id=selected_user_id,
    )
    return True


def list_contracts(
    session: Session,
    *,
    tenant_id: int,
    current_user: User,
    status_filter: Optional[ContractStatus] = None,
    pending_only: bool = False,
    assigned_to_me: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[Contract]:
    ensure_tenant_access(current_user, tenant_id)
    if not (
        can_view_contract(session, current_user)
        or can_read_comparative(session, current_user)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    statement = select(Contract).where(
        Contract.tenant_id == tenant_id,
        Contract.deleted_at.is_(None),
    )

    # Visibilidad listado (comparativos + contratos comparten Contract):
    #   - super_admin / Position.can_view_all_comparatives (Gerencia/DT) → ven todos
    #   - Dept con can_view_contract (Admin/Jurídico) → ven todos
    #   - Resto (JO) solo lo suyo. DT también ve los de sus JO subordinados.
    if not (
        can_view_all_comparatives(session, current_user)
        or can_view_all_contracts(session, current_user)
    ):
        subordinado_user_ids = _get_jo_subordinado_user_ids(
            session, current_user=current_user, tenant_id=tenant_id
        )
        if subordinado_user_ids:
            allowed_creator_ids = [current_user.id, *subordinado_user_ids]
            statement = statement.where(Contract.created_by_id.in_(allowed_creator_ids))
        else:
            statement = statement.where(Contract.created_by_id == current_user.id)

    if status_filter is not None:
        statement = statement.where(Contract.status == status_filter)

    if assigned_to_me:
        statement = statement.where(Contract.assigned_admin_user_id == current_user.id)

    if pending_only:
        admin_bypass = current_user.is_super_admin or _is_tenant_admin(
            session, current_user
        )
        if admin_bypass:
            # super_admin y tenant_admin ven todos los contratos activos del tenant,
            # sin filtrar por owner ni por dept. Misma vista para ambos.
            statement = statement.where(
                Contract.status.in_(
                    [*ACTIVE_APPROVAL_STATUSES, ContractStatus.IN_SIGNATURE]
                )
            )
        elif can_edit_contract(session, current_user):
            statement = statement.where(
                or_(
                    (
                        (Contract.created_by_id == current_user.id)
                        & Contract.status.in_(
                            [
                                ContractStatus.DRAFT,
                                ContractStatus.PENDING_JEFE_OBRA,
                            ]
                        )
                    ),
                    (
                        (Contract.created_by_id != current_user.id)
                        & Contract.status.in_(
                            [*ACTIVE_APPROVAL_STATUSES, ContractStatus.IN_SIGNATURE]
                        )
                    ),
                )
            )
        else:
            department_ids = _get_user_department_ids_for_tenant(
                session,
                user=current_user,
                tenant_id=tenant_id,
            )
            if department_ids:
                subq = (
                    select(ContractWorkflowApproval.contract_id)
                    .where(
                        ContractWorkflowApproval.tenant_id == tenant_id,
                        ContractWorkflowApproval.department_id.in_(tuple(department_ids)),
                        ContractWorkflowApproval.status == ApprovalStatus.PENDING,
                    )
                )
                statement = statement.where(Contract.id.in_(subq))
                statement = statement.where(
                    Contract.status.in_(ACTIVE_APPROVAL_STATUSES)
                )
            else:
                statement = statement.where(False)

    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))

    statement = statement.order_by(Contract.created_at.desc(), Contract.id.desc())
    statement = statement.offset(offset).limit(limit)
    contracts = list(session.exec(statement).all())
    return contracts


def get_contract(session: Session, *, contract_id: int, tenant_id: int, user: User) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not (
        can_view_contract(session, user)
        or can_read_comparative(session, user)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    contract = _get_contract_or_404(session, contract_id, tenant_id)
    if (
        _is_hidden_contract_pre_admin_status(contract)
        and not _user_can_access_admin_draft_contract(
            session,
            user=user,
            tenant_id=tenant_id,
        )
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    if (
        not (
            can_view_all_comparatives(session, user)
            or can_view_all_contracts(session, user)
        )
        and contract.created_by_id != user.id
    ):
        subordinado_user_ids = _get_jo_subordinado_user_ids(
            session, current_user=user, tenant_id=tenant_id
        )
        if contract.created_by_id not in subordinado_user_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    return contract


def delete_contract(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> None:
    ensure_tenant_access(user, tenant_id)
    if not can_edit_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    if contract.status not in {ContractStatus.DRAFT, ContractStatus.REJECTED}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden eliminar contratos en borrador o rechazados.",
        )

    offers = list(
        session.exec(
            select(ContractOffer).where(ContractOffer.contract_id == contract.id)
        ).all()
    )
    docs = list(
        session.exec(
            select(ContractDocument).where(ContractDocument.contract_id == contract.id)
        ).all()
    )
    signatures = list(
        session.exec(
            select(SignatureRequest).where(SignatureRequest.contract_id == contract.id)
        ).all()
    )

    for offer in offers:
        try:
            if offer.file_path:
                path = Path(offer.file_path)
                if path.exists():
                    path.unlink()
        except Exception:
            logger.exception("No se pudo borrar archivo de oferta=%s", offer.id)
    for doc in docs:
        try:
            if doc.path:
                path = Path(doc.path)
                if path.exists():
                    path.unlink()
        except Exception:
            logger.exception("No se pudo borrar documento de contrato=%s doc=%s", contract.id, doc.id)
    for signature in signatures:
        try:
            if signature.signed_file_path:
                path = Path(signature.signed_file_path)
                if path.exists():
                    path.unlink()
        except Exception:
            logger.exception("No se pudo borrar firma de contrato=%s signature=%s", contract.id, signature.id)

    try:
        # Soft delete instead of hard delete
        contract.deleted_at = datetime.now(timezone.utc)
        session.add(contract)
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error soft eliminando contrato=%s", contract.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno eliminando el contrato.",
        ) from None


def _delete_contract_related_rows(session: Session, *, contract_id: int) -> None:
    for model in _CONTRACT_DELETE_MODELS:
        session.exec(delete(model).where(model.contract_id == contract_id))


def _derive_project_id_from_comparative(comparative_data: object) -> Optional[int]:
    """nº de obra del comparativo → posible erp_project.id (sin validar BBDD)."""
    if not isinstance(comparative_data, dict):
        return None
    header = comparative_data.get("header") if isinstance(comparative_data.get("header"), dict) else {}
    raw = (
        comparative_data.get("obra_numero")
        or (header.get("obra_num") if isinstance(header, dict) else None)
    )
    if raw is None:
        return None
    raw_str = str(raw).strip()
    if not raw_str.isdigit():
        return None
    try:
        return int(raw_str)
    except (TypeError, ValueError):
        return None


def _derive_project_number_from_comparative(comparative_data: object) -> Optional[str]:
    if not isinstance(comparative_data, dict):
        return None
    header = comparative_data.get("header") if isinstance(comparative_data.get("header"), dict) else {}
    raw = (
        comparative_data.get("obra_numero")
        or comparative_data.get("obra_num")
        or (header.get("obra_numero") if isinstance(header, dict) else None)
        or (header.get("obra_num") if isinstance(header, dict) else None)
    )
    if raw is None:
        return None
    normalized = "".join(ch for ch in str(raw).strip() if ch.isdigit())[:4]
    return normalized or None


def _sync_worksite_snapshot_into_contract(
    session: Session,
    *,
    tenant_id: int,
    contract: Contract,
) -> None:
    from app.domains.work.catalog_api import get_worksite_by_code_for_tenant

    project_number = (
        "".join(ch for ch in str(contract.project_number or "").strip() if ch.isdigit())[:4]
        or None
    )
    if project_number:
        contract.project_number = project_number
    if not project_number:
        return
    worksite = get_worksite_by_code_for_tenant(
        session,
        tenant_id=tenant_id,
        code=project_number,
    )
    if not worksite:
        return
    contract.promoter = worksite.client_name
    if isinstance(contract.contract_data, dict):
        project = dict(contract.contract_data.get("project") or {})
        project["promotora"] = worksite.client_name
        project["promotor"] = worksite.client_name
        project["nombre_obra"] = project.get("nombre_obra") or worksite.name
        contract.contract_data = {
            **contract.contract_data,
            "project": project,
        }


def _resolve_valid_project_id(
    session: Session, *, tenant_id: int, candidate: Optional[int]
) -> Optional[int]:
    """Devuelve el id si existe en erp_project para el tenant; si no, None.

    Evita FK violations cuando el obra_numero del comparativo no coincide con
    ningún erp_project.id real (caso habitual: obra externa, datos manuales,
    importación de Excel con número de obra libre).
    """
    if candidate is None:
        return None
    from app.models.erp import Project  # import perezoso para evitar ciclos

    project = session.get(Project, candidate)
    if project is None:
        return None
    if project.tenant_id is not None and project.tenant_id != tenant_id:
        return None
    return candidate


def _clean_optional_title(value: object) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def create_contract(
    session: Session,
    *,
    tenant_id: int,
    created_by: User,
    payload: dict,
) -> Contract:
    ensure_tenant_access(created_by, tenant_id)
    # Crear un Contract (registro) es la acción de "subir comparativo" en el
    # wizard: el contrato nace en DRAFT con comparative_data. La cap correcta
    # aquí es la de comparativos (Position.can_create_comparative), NO la de
    # contratos — ese permiso aplica más tarde al editar / regenerar el doc.
    from app.platform.contracts_core.permissions import can_create_comparative

    if not (
        created_by.is_super_admin
        or _is_tenant_admin(session, created_by)
        or can_create_comparative(session, created_by)
        or can_create_contract(session, created_by)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    comparative_data = payload.get("comparative_data")
    contract_data = _merge_contract_data_from_comparative(
        comparative_data,
        payload.get("contract_data"),
    )
    comparative_snapshot = _derive_snapshot_from_comparative(comparative_data)

    # description/project_id NO se aceptan del payload: se derivan del
    # comparativo + datos del proveedor (regla "3 fuentes autorizadas").
    # title SÍ se acepta del payload: lo escribe el usuario manualmente en el
    # wizard y persiste como título fijo del comparativo (sin auto-derivar).
    supplier_name = payload.get("supplier_name")
    derived_project_id = _resolve_valid_project_id(
        session,
        tenant_id=tenant_id,
        candidate=_derive_project_id_from_comparative(comparative_data),
    )
    manual_title = _clean_optional_title(payload.get("title"))
    project_number = _derive_project_number_from_comparative(comparative_data)

    contract = Contract(
        tenant_id=tenant_id,
        created_by_id=created_by.id,
        type=payload["type"],
        title=manual_title,
        description=None,
        project_id=derived_project_id,
        project_number=project_number,
        comparative_data=comparative_data,
        contract_data=contract_data,
        supplier_name=supplier_name,
        supplier_email=payload.get("supplier_email") or comparative_snapshot.get("supplier_email"),
        supplier_phone=payload.get("supplier_phone") or comparative_snapshot.get("supplier_phone"),
        supplier_contact_name=payload.get("supplier_contact_name")
        or comparative_snapshot.get("supplier_contact_name"),
        total_amount=payload.get("total_amount") or comparative_snapshot.get("total_amount"),
        status=ContractStatus.DRAFT,
    )
    _sync_worksite_snapshot_into_contract(
        session,
        tenant_id=tenant_id,
        contract=contract,
    )
    session.add(contract)
    session.commit()
    session.refresh(contract)

    _log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=created_by.id,
        event_type="contract.created",
    )

    return contract


def update_contract(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    payload: dict,
    user: User,
) -> Contract:
    from app.domains.procurement.suppliers import (
        get_provider_by_tax_id_and_type,
        get_supplier_by_tax_id,
        sync_contract_from_provider,
        sync_contract_from_supplier,
        sync_supplier_from_contract,
        validate_supplier_email_if_present,
    )

    ensure_tenant_access(user, tenant_id)
    # Permiso doble:
    #   - Estados de comparativo (DRAFT, PENDING_JEFE_OBRA) → can_write_comparative
    #     (Position.can_create_comparative o can_edit_comparative). Esto permite
    #     a un Jefe de Obra editar su propio comparativo sin ser editor de contratos.
    #   - Estados post-comparativo (PENDING_TEMPLATE+, PENDING_REVIEW) → can_edit_contract
    #     (Dept Admin/Jurídico). Se valida tras leer contract.status más abajo.
    if not (
        user.is_super_admin
        or _is_tenant_admin(session, user)
        or can_edit_contract(session, user)
        or can_write_comparative(session, user)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    try:
        contract = _get_contract_or_404(session, contract_id, tenant_id)
        # REJECTED es terminal solo cuando NO hay slots de revisión (rechazo
        # fuera de flujo). Si fue rechazado dentro del ciclo, vuelve a
        # PENDING_DATA_VALIDATION (rechazo no terminal) — gestionado por
        # review_service.
        if contract.status == ContractStatus.REJECTED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El contrato está rechazado y no se puede editar.",
            )
        admin_bypass = user.is_super_admin or _is_tenant_admin(session, user)
        if (
            not admin_bypass
            and contract.status
            not in {
                ContractStatus.DRAFT,
                ContractStatus.PENDING_JEFE_OBRA,
                ContractStatus.PENDING_TEMPLATE,
                ContractStatus.PENDING_DATA_VALIDATION,
                ContractStatus.PENDING_REVIEW,
            }
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Solo se puede editar en DRAFT, PENDING_JEFE_OBRA, "
                    "PENDING_TEMPLATE, PENDING_DATA_VALIDATION o PENDING_REVIEW. "
                    f"Estado actual: {contract.status}."
                ),
            )
        if (
            not admin_bypass
            and contract.status == ContractStatus.DRAFT
            and contract.comparative_status == ComparativeStatus.APPROVED
            and not _user_can_access_admin_draft_contract(
                session,
                user=user,
                tenant_id=tenant_id,
            )
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
        if (
            not admin_bypass
            and contract.status == ContractStatus.DRAFT
            and contract.comparative_status != ComparativeStatus.APPROVED
            and not can_write_comparative(session, user)
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

        # Gates por estado en el nuevo flujo:
        #   - PENDING_DATA_VALIDATION (fase borrador) → solo Department Administración.
        #   - PENDING_REVIEW → solo Department Jurídico (la edición dispara el
        #     "auto-rechazo + vuelta a Admin"; ver post-procesado más abajo).
        if not admin_bypass:
            from app.domains.procurement.contracts.review_service import (
                _user_in_admin_department,
                _user_in_juridico_department,
            )
            if contract.status in {
                ContractStatus.PENDING_SUPPLIER,
                ContractStatus.PENDING_TEMPLATE,
            }:
                if not _user_can_access_admin_draft_contract(
                    session,
                    user=user,
                    tenant_id=tenant_id,
                ):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="En esta fase previa solo Administración puede editar el contrato.",
                    )
            elif contract.status == ContractStatus.PENDING_DATA_VALIDATION:
                if not _user_in_admin_department(session, user):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=(
                            "En fase borrador solo Administración puede "
                            "editar el contrato."
                        ),
                    )
            elif contract.status == ContractStatus.PENDING_REVIEW:
                if not _user_in_juridico_department(session, user):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=(
                            "Durante la revisión solo Jurídico puede editar "
                            "el contrato (la edición lo devuelve a Administración)."
                        ),
                    )

        # Snapshot del estado pre-edición para la excepción
        # "Jurídico modifica en PENDING_REVIEW" (auto-rechazo + vuelta a Admin).
        status_before_edit = contract.status

        payload_to_apply = dict(payload)
        # description/project_id no se aceptan desde el front: se derivan del
        # comparativo (regla "3 fuentes autorizadas"). title sí persiste como
        # lo haya escrito el usuario manualmente.
        for blocked in ("description", "project_id"):
            payload_to_apply.pop(blocked, None)
        if "title" in payload_to_apply:
            payload_to_apply["title"] = _clean_optional_title(payload_to_apply.get("title"))
        if "contract_data" in payload_to_apply:
            incoming_contract_data = payload_to_apply.get("contract_data")
            if incoming_contract_data is None:
                payload_to_apply["contract_data"] = contract.contract_data
            elif isinstance(incoming_contract_data, dict):
                payload_to_apply["contract_data"] = _merge_preserving_existing(
                    dict(contract.contract_data or {}),
                    incoming_contract_data,
                )
        payload_to_apply = _normalize_contract_payload_aliases(payload_to_apply)

        for field, value in payload_to_apply.items():
            if field == "supplier_tax_id":
                value = contract_validators.normalize_tax_id(value)
            if field == "supplier_email":
                value = contract_validators.normalize_email(value)
            if field in {
                "supplier_name",
                "supplier_address",
                "supplier_city",
                "supplier_country",
                "supplier_contact_name",
            }:
                value = contract_validators.normalize_human_text(value)
            if field == "supplier_phone" and isinstance(value, str) and value.strip() == "":
                value = contract.supplier_phone
            if field == "total_amount" and value is None:
                value = contract.total_amount
            setattr(contract, field, value)

        # Re-derivar project_id desde el comparativo. description siempre NULL.
        # title NO se re-deriva: persiste el valor que el usuario escribió.
        # Validamos que el id derivado exista en erp_project para evitar
        # FK violations cuando el obra_numero del comparativo no coincide.
        derived_project_id = _resolve_valid_project_id(
            session,
            tenant_id=tenant_id,
            candidate=_derive_project_id_from_comparative(contract.comparative_data),
        )
        if derived_project_id is not None:
            contract.project_id = derived_project_id
        derived_project_number = _derive_project_number_from_comparative(
            contract.comparative_data
        )
        if derived_project_number:
            contract.project_number = derived_project_number
        _sync_worksite_snapshot_into_contract(
            session,
            tenant_id=tenant_id,
            contract=contract,
        )
        contract.description = None

        if contract.total_amount is not None:
            try:
                total_amount_float = float(contract.total_amount)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="El importe total no es válido.",
                )
            if abs(total_amount_float) >= 1_000_000_000_000:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="El importe total es demasiado grande para el formato permitido.",
                )

        supplier = None
        supplier_created = False
        if "supplier_tax_id" in payload_to_apply or contract.supplier_tax_id:
            provider = get_provider_by_tax_id_and_type(
                session,
                tax_id=contract.supplier_tax_id,
                contract_type=contract.type,
            )
            if provider:
                sync_contract_from_provider(contract, provider)

            supplier = get_supplier_by_tax_id(
                session,
                tenant_id=tenant_id,
                tax_id=contract.supplier_tax_id,
            )
            if supplier:
                contract.supplier_id = supplier.id
                sync_contract_from_supplier(contract, supplier)
            elif contract.supplier_tax_id:
                candidate_supplier = Supplier(
                    tenant_id=tenant_id,
                    created_by_id=user.id,
                    tax_id=contract.supplier_tax_id,
                    name=contract.supplier_name,
                    email=contract.supplier_email,
                    phone=contract.supplier_phone,
                    address=contract.supplier_address,
                    city=contract.supplier_city,
                    postal_code=contract.supplier_postal_code,
                    country=contract.supplier_country,
                    contact_name=contract.supplier_contact_name,
                    bank_iban=contract.supplier_bank_iban,
                    bank_bic=contract.supplier_bank_bic,
                    status=SupplierStatus.PENDING,
                    updated_at=datetime.now(timezone.utc),
                )
                try:
                    with session.begin_nested():
                        session.add(candidate_supplier)
                        session.flush()
                except IntegrityError:
                    supplier = get_supplier_by_tax_id(
                        session,
                        tenant_id=tenant_id,
                        tax_id=contract.supplier_tax_id,
                    )
                    if supplier is None:
                        raise
                    contract.supplier_id = supplier.id
                    sync_contract_from_supplier(contract, supplier)
                else:
                    supplier = candidate_supplier
                    contract.supplier_id = supplier.id
                    supplier_created = True
            if supplier:
                sync_supplier_from_contract(supplier, contract)
                session.add(supplier)

        validate_supplier_email_if_present(contract.supplier_email)

        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)
        session.commit()
        session.refresh(contract)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo guardar por conflicto de datos (CIF/correo duplicado o formato invalido).",
        ) from exc
    except DataError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El importe total o algún campo numérico no tiene un formato válido.",
        ) from exc
    except HTTPException:
        session.rollback()
        raise
    except SQLAlchemyError as exc:
        session.rollback()
        logger.exception(
            "Error SQL en update_contract contract_id=%s tenant_id=%s: %s",
            contract_id,
            tenant_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno guardando el contrato.",
        ) from exc

    if supplier_created:
        _log_event(
            session,
            tenant_id=tenant_id,
            contract_id=contract.id,
            user_id=user.id,
            event_type="contract.supplier_created",
        )

    # Excepción: Jurídico modifica el contrato durante PENDING_REVIEW.
    # Los cambios ya quedaron persistidos arriba. Ahora cerramos el ciclo
    # marcando el slot JURIDICO como REJECTED con motivo auto-generado y
    # devolvemos el contrato a fase borrador (PENDING_DATA_VALIDATION) para
    # que Administración revise los cambios y vuelva a aprobar.
    if status_before_edit == ContractStatus.PENDING_REVIEW:
        from app.domains.procurement.contracts.review_service import (
            _user_in_juridico_department,
            reject_due_to_juridico_edit,
        )
        # admin_bypass (super_admin / tenant_admin) NO dispara la excepción:
        # son admins globales editando, no Jurídico.
        if not (user.is_super_admin or _is_tenant_admin(session, user)) and \
                _user_in_juridico_department(session, user):
            reject_due_to_juridico_edit(
                session,
                contract=contract,
                user=user,
            )
            session.refresh(contract)
    return contract


def _upsert_approval(
    session: Session,
    *,
    contract: Contract,
    approver_role: "str | ContractDepartment | None" = None,
    department: "ContractDepartment | None" = None,  # legacy kwarg
    status: ApprovalStatus,
    decided_by_id: Optional[int],
    comment: Optional[str],
    step_order: Optional[int] = None,
    scope: ApprovalScope = ApprovalScope.CONTRACT,
    cycle_number: Optional[int] = None,
) -> ContractApproval:
    # Acepta department= (legacy ContractDepartment) o approver_role= (str/enum).
    role_value: str
    if approver_role is not None:
        role_value = approver_role.value if hasattr(approver_role, "value") else str(approver_role)
    elif department is not None:
        role_value = department.value if hasattr(department, "value") else str(department)
    else:
        raise ValueError("_upsert_approval requires approver_role or department")

    # Cuando no se especifica ciclo, operamos sobre el ciclo activo (el mayor).
    if cycle_number is None:
        max_cycle = session.exec(
            select(ContractApproval.cycle_number).where(
                ContractApproval.tenant_id == contract.tenant_id,
                ContractApproval.contract_id == contract.id,
                ContractApproval.scope == scope,
            ).order_by(ContractApproval.cycle_number.desc())
        ).first()
        cycle_number = int(max_cycle) if max_cycle else 1

    approval = session.exec(
        select(ContractApproval).where(
            ContractApproval.tenant_id == contract.tenant_id,
            ContractApproval.contract_id == contract.id,
            ContractApproval.approver_role == role_value,
            ContractApproval.scope == scope,
            ContractApproval.cycle_number == cycle_number,
        )
    ).one_or_none()

    if approval is None:
        approval = ContractApproval(
            tenant_id=contract.tenant_id,
            contract_id=contract.id,
            scope=scope,
            approver_role=role_value,
            step_order=step_order,
            cycle_number=cycle_number,
        )
    elif step_order is not None:
        approval.step_order = step_order

    approval.status = status
    approval.decided_by_id = decided_by_id
    approval.decided_at = datetime.now(timezone.utc)
    approval.comment = comment
    session.add(approval)
    session.commit()
    session.refresh(approval)
    return approval


def _log_event(
    session: Session,
    *,
    tenant_id: int,
    contract_id: int,
    user_id: Optional[int],
    event_type: str,
    payload: Optional[dict] = None,
) -> None:
    try:
        event = ContractEvent(
            tenant_id=tenant_id,
            contract_id=contract_id,
            user_id=user_id,
            event_type=event_type,
            payload=payload,
        )
        session.add(event)
        session.commit()
    except Exception as exc:
        session.rollback()
        logger.warning(
            "No se pudo registrar contract_event tenant_id=%s contract_id=%s event=%s: %s",
            tenant_id,
            contract_id,
            event_type,
            exc,
        )
