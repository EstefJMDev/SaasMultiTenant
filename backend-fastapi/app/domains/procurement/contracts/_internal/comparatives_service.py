from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import text
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import Session

from app.core.errors import DomainError
from app.models.user import User
from app.platform.contracts_core.comparativos_enums import EstadoComparativo
from app.platform.contracts_core.comparativos_schemas import ComparativoCreate, ComparativoUpdate
from app.platform.contracts_core.models import (
    ApprovalScope,
    ApprovalStatus,
    ComparativeStatus,
    Contract,
    ContractDepartment,
)
from app.platform.contracts_core.permissions import (
    can_approve_comparative,
    can_approve_contract,
    can_edit_comparative,
    can_reject_comparative,
    can_reject_contract,
    can_write_comparative,
    ensure_tenant_access,
)
from app.domains.procurement.api import (
    add_offer as _add_offer,
    approve_comparative as _approve_comparative,
    get_comparative_offers as _get_comparative_offers,
    rebuild_comparative as _rebuild_comparative,
    reject_comparative as _reject_comparative,
    return_comparative as _return_comparative,
    save_comparative_draft as _save_comparative_draft,
    select_offer as _select_offer,
    send_supplier_form_after_approval as _send_supplier_form_after_approval,
    submit_comparative as _submit_comparative,
    sync_comparative_offer_ids as _sync_comparative_offer_ids,
    validate_rea_for_contract as _validate_rea_for_contract,
)
from app.domains.procurement.comparatives import service as legacy_comparatives_service
from app.domains.procurement.comparativos_v2.service import (
    ComparativoDetalleRead,
    ComparativosV2Service,
)
from app.domains.procurement.contracts import crud as contract_crud
from app.domains.procurement.suppliers import normalize_tax_id

# Adaptador temporal Contract legacy -> comparativos_v2. No cambiar routers ni frontend.
logger = logging.getLogger("app.platform.contracts_core")

_MGMT_PENDING_STATUS_VALUES = {
    ComparativeStatus.PENDING_MGMT_APPROVAL.value,
    ComparativeStatus.PENDING_REVIEW.value,
}
_EDITABLE_COMPARATIVE_STATUS_VALUES = {
    ComparativeStatus.DRAFT.value,
    ComparativeStatus.NEEDS_CHANGES.value,
    ComparativeStatus.REJECTED.value,
}
_V2_LINK_ROOT_KEY = "_v2"
_V2_LINK_ID_KEY = "comparativo_id"


__all__ = [
    "get_comparative_offers",
    "save_draft",
    "sync_offer_ids",
    "add_offer",
    "select_offer",
    "submit",
    "validate_rea",
    "send_supplier_form_after_approval",
    "rebuild",
    "approve",
    "reject",
    "return_comparative",
]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _status_value(value: Any) -> str:
    raw = getattr(value, "value", value)
    return str(raw or "").strip().upper()


def _clean_optional_text(value: object) -> Optional[str]:
    if not isinstance(value, str):
        return None
    token = value.strip()
    return token or None


def _first_non_empty_text(*values: object) -> Optional[str]:
    for value in values:
        cleaned = _clean_optional_text(value)
        if cleaned:
            return cleaned
    return None


def _int_from_row_value(raw: object) -> Optional[int]:
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw
    if hasattr(raw, "_mapping"):
        mapped = raw._mapping.get("id")
        if mapped is not None:
            try:
                return int(mapped)
            except (TypeError, ValueError):
                return None
    if hasattr(raw, "id"):
        try:
            return int(raw.id)
        except (TypeError, ValueError):
            return None
    if isinstance(raw, (tuple, list)) and raw:
        try:
            return int(raw[0])
        except (TypeError, ValueError):
            return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _domain_error_to_http_exception(exc: DomainError) -> HTTPException:
    return HTTPException(
        status_code=getattr(exc, "status_code", status.HTTP_400_BAD_REQUEST),
        detail=getattr(exc, "message", str(exc)),
    )


def _log_adapter_path(
    operation: str,
    *,
    contract_id: int,
    tenant_id: int,
    path: str,
    comparativo_id: Optional[int] = None,
    note: Optional[str] = None,
) -> None:
    logger.info(
        (
            "comparatives_adapter op=%s path=%s contract_id=%s "
            "tenant_id=%s comparativo_id=%s note=%s"
        ),
        operation,
        path,
        contract_id,
        tenant_id,
        comparativo_id,
        note or "",
    )


def _get_contract_or_404(session: Session, contract_id: int, tenant_id: int) -> Contract:
    return contract_crud._get_contract_or_404(session, contract_id, tenant_id)


def _merge_comparative_data_preserving_v2_link(
    existing: object,
    incoming: object,
) -> dict[str, Any]:
    merged = dict(incoming) if isinstance(incoming, dict) else {}
    existing_data = existing if isinstance(existing, dict) else {}

    existing_v2 = existing_data.get(_V2_LINK_ROOT_KEY)
    incoming_v2 = merged.get(_V2_LINK_ROOT_KEY)
    if not isinstance(existing_v2, dict):
        return merged

    if isinstance(incoming_v2, dict):
        v2_merged = dict(existing_v2)
        v2_merged.update(incoming_v2)
    else:
        v2_merged = dict(existing_v2)

    existing_v2_id = _int_from_row_value(existing_v2.get(_V2_LINK_ID_KEY))
    merged_v2_id = _int_from_row_value(v2_merged.get(_V2_LINK_ID_KEY))
    if merged_v2_id is None and existing_v2_id is not None:
        v2_merged[_V2_LINK_ID_KEY] = int(existing_v2_id)

    merged[_V2_LINK_ROOT_KEY] = v2_merged
    return merged


def _get_v2_comparativo_id_from_contract(contract: Contract) -> Optional[int]:
    data = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    v2_data = data.get(_V2_LINK_ROOT_KEY)
    if not isinstance(v2_data, dict):
        return None
    raw = v2_data.get(_V2_LINK_ID_KEY)
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _set_v2_comparativo_id_on_contract(
    session: Session,
    contract: Contract,
    comparativo_id: int,
) -> None:
    data = dict(contract.comparative_data or {})
    v2_data = dict(data.get(_V2_LINK_ROOT_KEY) or {})
    v2_data[_V2_LINK_ID_KEY] = int(comparativo_id)
    data[_V2_LINK_ROOT_KEY] = v2_data
    contract.comparative_data = data
    contract.updated_at = _utcnow()
    flag_modified(contract, "comparative_data")
    session.add(contract)


def _map_v2_estado_to_legacy_comparative_status(
    estado: EstadoComparativo | str | None,
) -> ComparativeStatus:
    raw = _status_value(estado)
    mapping = {
        EstadoComparativo.BORRADOR.value: ComparativeStatus.DRAFT,
        EstadoComparativo.PENDIENTE_APROBACION.value: ComparativeStatus.PENDING_MGMT_APPROVAL,
        EstadoComparativo.APROBADO.value: ComparativeStatus.APPROVED,
        EstadoComparativo.RECHAZADO.value: ComparativeStatus.REJECTED,
        EstadoComparativo.NECESITA_CAMBIOS.value: ComparativeStatus.NEEDS_CHANGES,
    }
    mapped = mapping.get(raw)
    if mapped is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Estado comparativo v2 no soportado para adapter legacy: {raw or '<vacio>'}.",
        )
    return mapped


def _sync_contract_from_v2_detail(
    session: Session,
    contract: Contract,
    detalle: ComparativoDetalleRead,
) -> None:
    mapped_status = _map_v2_estado_to_legacy_comparative_status(detalle.comparativo.estado)
    now = _utcnow()

    contract.comparative_status = mapped_status
    contract.updated_at = now

    if mapped_status == ComparativeStatus.PENDING_MGMT_APPROVAL:
        contract.submitted_at = contract.submitted_at or now
    if mapped_status == ComparativeStatus.APPROVED:
        contract.approved_at = detalle.comparativo.fecha_aprobacion or now
    elif mapped_status in {
        ComparativeStatus.DRAFT,
        ComparativeStatus.NEEDS_CHANGES,
        ComparativeStatus.REJECTED,
    }:
        contract.approved_at = None

    data = dict(contract.comparative_data or {})
    v2_data = dict(data.get(_V2_LINK_ROOT_KEY) or {})
    v2_data[_V2_LINK_ID_KEY] = int(detalle.comparativo.id)
    v2_data["estado"] = _status_value(detalle.comparativo.estado)
    v2_data["synced_at"] = now.isoformat()
    if detalle.comparativo.proveedor_id is not None:
        v2_data["proveedor_id"] = int(detalle.comparativo.proveedor_id)
    data[_V2_LINK_ROOT_KEY] = v2_data

    if detalle.comparativo.motivo_rechazo:
        data["rejected_reason"] = detalle.comparativo.motivo_rechazo
    if detalle.comparativo.fecha_rechazo:
        data["rejected_at"] = detalle.comparativo.fecha_rechazo.isoformat()

    contract.comparative_data = data
    flag_modified(contract, "comparative_data")
    session.add(contract)


def _resolve_v2_proveedor_id_from_contract(
    session: Session,
    contract: Contract,
) -> Optional[int]:
    data = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    v2_data = data.get(_V2_LINK_ROOT_KEY)
    if isinstance(v2_data, dict) and v2_data.get("proveedor_id") is not None:
        try:
            return int(v2_data["proveedor_id"])
        except (TypeError, ValueError):
            pass

    lookup_tax_id = normalize_tax_id(contract.supplier_tax_id)
    if not lookup_tax_id:
        return None

    stmt = text(
        """
        SELECT id
        FROM proveedores
        WHERE regexp_replace(UPPER(COALESCE(cif, '')), '[^A-Z0-9]', '', 'g') = :lookup_id
        LIMIT 1
        """
    )
    row = session.exec(stmt, params={"lookup_id": lookup_tax_id}).first()
    return _int_from_row_value(row)


def _extract_contract_work_snapshot(contract: Contract) -> tuple[Optional[int], Optional[str], Optional[str]]:
    comparative_data = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    header = comparative_data.get("header")
    header_data = header if isinstance(header, dict) else {}

    obra_numero = _first_non_empty_text(
        comparative_data.get("obra_numero"),
        comparative_data.get("obra_num"),
        header_data.get("obra_num"),
        contract.project_number,
    )
    obra_nombre = _first_non_empty_text(
        comparative_data.get("obra_nombre"),
        comparative_data.get("obra"),
        header_data.get("obra_nombre"),
    )
    return contract.project_id, obra_numero, obra_nombre


def _build_v2_create_payload_from_contract(
    session: Session,
    *,
    contract: Contract,
    user: User,
) -> Optional[ComparativoCreate]:
    proveedor_id = _resolve_v2_proveedor_id_from_contract(session, contract)
    obra_id, obra_numero, obra_nombre = _extract_contract_work_snapshot(contract)
    titulo = _clean_optional_text(contract.title)
    tipo_contrato = _clean_optional_text(getattr(contract.type, "value", contract.type))
    usuario_creador_id = user.id or contract.created_by_id

    if not (
        proveedor_id
        and titulo
        and obra_id is not None
        and obra_numero
        and obra_nombre
        and tipo_contrato
        and usuario_creador_id
    ):
        return None

    return ComparativoCreate(
        tenant_id=contract.tenant_id,
        obra_id=obra_id,
        numero_obra=obra_numero,
        nombre_obra=obra_nombre,
        titulo=titulo,
        estado=EstadoComparativo.BORRADOR,
        tipo_contrato=tipo_contrato,
        proveedor_id=int(proveedor_id),
        usuario_creador_id=int(usuario_creador_id),
        usuario_actualizacion_id=user.id,
        nombre_contacto=_clean_optional_text(contract.supplier_contact_name),
        telefono_contacto=_clean_optional_text(contract.supplier_phone),
        email_contacto=_clean_optional_text(contract.supplier_email),
        duracion=_first_non_empty_text(contract.duration_text, contract.execution_duration),
        forma_pago=_clean_optional_text(contract.payment_method),
        terminos_pago=(str(contract.payment_days) if contract.payment_days is not None else None),
        numero_trabajadores_obra=contract.min_workers,
        descripcion_garantias=_clean_optional_text(contract.warranty_text),
    )


def _build_v2_update_payload_from_contract(
    session: Session,
    *,
    contract: Contract,
    user: User,
) -> ComparativoUpdate:
    proveedor_id = _resolve_v2_proveedor_id_from_contract(session, contract)
    obra_id, obra_numero, obra_nombre = _extract_contract_work_snapshot(contract)
    tipo_contrato = _clean_optional_text(getattr(contract.type, "value", contract.type))

    return ComparativoUpdate(
        obra_id=obra_id,
        numero_obra=obra_numero,
        nombre_obra=obra_nombre,
        titulo=_clean_optional_text(contract.title),
        tipo_contrato=tipo_contrato,
        proveedor_id=proveedor_id,
        usuario_actualizacion_id=user.id,
        nombre_contacto=_clean_optional_text(contract.supplier_contact_name),
        telefono_contacto=_clean_optional_text(contract.supplier_phone),
        email_contacto=_clean_optional_text(contract.supplier_email),
        duracion=_first_non_empty_text(contract.duration_text, contract.execution_duration),
        forma_pago=_clean_optional_text(contract.payment_method),
        terminos_pago=(str(contract.payment_days) if contract.payment_days is not None else None),
        numero_trabajadores_obra=contract.min_workers,
        descripcion_garantias=_clean_optional_text(contract.warranty_text),
    )


def _open_new_legacy_comparative_cycle(session: Session, contract: Contract) -> None:
    try:
        legacy_comparatives_service._open_new_comparative_cycle(session, contract)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "No se pudo abrir ciclo legacy de comparative approvals contract_id=%s: %s",
            contract.id,
            exc,
        )


def _sync_legacy_comparative_approval_state(
    session: Session,
    *,
    contract: Contract,
    user: User,
    approval_status: ApprovalStatus,
    comment: Optional[str],
    ensure_both_approved: bool = False,
) -> None:
    branch = legacy_comparatives_service._resolve_comparative_branch(session, user)
    contract_crud._upsert_approval(
        session,
        contract=contract,
        department=branch,
        status=approval_status,
        decided_by_id=user.id,
        comment=comment,
        scope=ApprovalScope.COMPARATIVE,
    )
    if not ensure_both_approved:
        return
    for department in (ContractDepartment.OBRA, ContractDepartment.GERENCIA):
        contract_crud._upsert_approval(
            session,
            contract=contract,
            department=department,
            status=ApprovalStatus.APPROVED,
            decided_by_id=user.id,
            comment=comment,
            scope=ApprovalScope.COMPARATIVE,
        )


def get_comparative_offers(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[dict]:
    return _get_comparative_offers(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def save_draft(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    payload: dict[str, Any],
    user: User,
):
    ensure_tenant_access(user, tenant_id)
    if not can_write_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract_before = _get_contract_or_404(session, contract_id, tenant_id)
    previous_comparative_data = (
        dict(contract_before.comparative_data)
        if isinstance(contract_before.comparative_data, dict)
        else {}
    )
    previous_v2_id = _get_v2_comparativo_id_from_contract(contract_before)

    contract = _save_comparative_draft(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        payload=payload,
        user=user,
    )
    _log_adapter_path(
        "save_draft",
        contract_id=contract.id,
        tenant_id=tenant_id,
        path="legacy",
        comparativo_id=previous_v2_id,
        note="legacy_draft_persisted",
    )

    merged_comparative_data = _merge_comparative_data_preserving_v2_link(
        previous_comparative_data,
        contract.comparative_data,
    )
    if merged_comparative_data != (contract.comparative_data or {}):
        contract.comparative_data = merged_comparative_data
        contract.updated_at = _utcnow()
        flag_modified(contract, "comparative_data")
        session.add(contract)
        session.commit()
        session.refresh(contract)
        _log_adapter_path(
            "save_draft",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="legacy",
            comparativo_id=_get_v2_comparativo_id_from_contract(contract),
            note="restored_or_preserved_v2_link_after_legacy_save",
        )

    v2_comparativo_id = _get_v2_comparativo_id_from_contract(contract)
    if v2_comparativo_id is None:
        _log_adapter_path(
            "save_draft",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="legacy",
            note="no_v2_link_skip_v2_sync",
        )
        return contract

    # Best effort: mantenemos persistencia legacy como fuente primaria en draft.
    _log_adapter_path(
        "save_draft",
        contract_id=contract.id,
        tenant_id=tenant_id,
        path="v2",
        comparativo_id=v2_comparativo_id,
        note="sync_v2_after_legacy_save",
    )
    v2_service = ComparativosV2Service(session)
    try:
        detalle = v2_service.editar_comparativo(
            tenant_id=tenant_id,
            comparativo_id=v2_comparativo_id,
            payload=_build_v2_update_payload_from_contract(
                session,
                contract=contract,
                user=user,
            ),
            usuario_id=user.id,
            comentario_historial="Sincronizacion de borrador desde contrato legacy.",
        )
        _sync_contract_from_v2_detail(session, contract, detalle)
        session.commit()
        session.refresh(contract)
    except DomainError as exc:
        session.rollback()
        logger.warning(
            "No se pudo sincronizar draft a comparativos_v2 contract_id=%s comparativo_id=%s: %s",
            contract.id,
            v2_comparativo_id,
            exc.message,
        )
    except Exception as exc:  # noqa: BLE001
        session.rollback()
        logger.warning(
            "Error inesperado sincronizando draft a comparativos_v2 contract_id=%s comparativo_id=%s: %s",
            contract.id,
            v2_comparativo_id,
            exc,
        )
    return contract


def sync_offer_ids(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[dict]:
    return _sync_comparative_offer_ids(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def add_offer(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    payload: dict[str, Any],
    upload: UploadFile,
    user: User,
):
    return _add_offer(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        payload=payload,
        upload=upload,
        user=user,
    )


def select_offer(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    offer_id: int,
    user: User,
):
    return _select_offer(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        offer_id=offer_id,
        user=user,
    )


def submit(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
):
    ensure_tenant_access(user, tenant_id)
    if not can_edit_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    if _status_value(contract.comparative_status) not in _EDITABLE_COMPARATIVE_STATUS_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Solo se puede enviar a aprobacion desde borrador, "
                "'necesita cambios' o rechazado."
            ),
        )

    v2_service = ComparativosV2Service(session)
    v2_comparativo_id = _get_v2_comparativo_id_from_contract(contract)

    if v2_comparativo_id is None:
        payload = _build_v2_create_payload_from_contract(
            session,
            contract=contract,
            user=user,
        )
        if payload is None:
            # No migramos contratos legacy automaticamente en esta fase.
            _log_adapter_path(
                "submit",
                contract_id=contract.id,
                tenant_id=tenant_id,
                path="legacy_fallback",
                note="missing_data_for_v2_create",
            )
            return _submit_comparative(
                session=session,
                contract_id=contract_id,
                tenant_id=tenant_id,
                user=user,
            )

        try:
            detalle_creado = v2_service.crear_comparativo(
                tenant_id=tenant_id,
                payload=payload,
                usuario_id=user.id,
                comentario_historial=(
                    "Comparativo creado desde endpoint legacy /contracts/submit-comparative."
                ),
            )
        except DomainError as exc:
            raise _domain_error_to_http_exception(exc) from exc

        _set_v2_comparativo_id_on_contract(session, contract, detalle_creado.comparativo.id)
        session.commit()
        session.refresh(contract)
        v2_comparativo_id = detalle_creado.comparativo.id
        _log_adapter_path(
            "submit",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="v2",
            comparativo_id=v2_comparativo_id,
            note="created_v2_link_from_submit",
        )
    else:
        _log_adapter_path(
            "submit",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="v2",
            comparativo_id=v2_comparativo_id,
            note="using_existing_v2_link",
        )

    try:
        detalle = v2_service.enviar_a_aprobacion(
            tenant_id=tenant_id,
            comparativo_id=v2_comparativo_id,
            usuario_id=user.id,
        )
    except DomainError as exc:
        raise _domain_error_to_http_exception(exc) from exc

    _sync_contract_from_v2_detail(session, contract, detalle)
    _open_new_legacy_comparative_cycle(session, contract)
    session.commit()
    session.refresh(contract)
    return contract


def validate_rea(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> dict:
    return _validate_rea_for_contract(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def send_supplier_form_after_approval(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
):
    return _send_supplier_form_after_approval(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def rebuild(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
):
    return _rebuild_comparative(
        session=session,
        contract_id=contract_id,
        tenant_id=tenant_id,
        user=user,
    )


def approve(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: str | None,
):
    ensure_tenant_access(user, tenant_id)
    if not (can_approve_comparative(session, user) or can_approve_contract(session, user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    if not can_approve_comparative(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Gerencia y Director Tecnico pueden aprobar el comparativo.",
        )

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    if _status_value(contract.comparative_status) not in _MGMT_PENDING_STATUS_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comparativo no esta pendiente de aprobacion de gerencia.",
        )

    legacy_comparatives_service._ensure_user_can_manage_comparative(
        session,
        contract=contract,
        tenant_id=tenant_id,
        user=user,
    )

    v2_comparativo_id = _get_v2_comparativo_id_from_contract(contract)
    if v2_comparativo_id is None:
        # Fallback legacy controlado para contratos no migrados.
        _log_adapter_path(
            "approve",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="legacy_fallback",
            note="missing_v2_link",
        )
        return _approve_comparative(
            session=session,
            contract_id=contract_id,
            tenant_id=tenant_id,
            user=user,
            comment=comment,
        )

    v2_service = ComparativosV2Service(session)
    _log_adapter_path(
        "approve",
        contract_id=contract.id,
        tenant_id=tenant_id,
        path="v2",
        comparativo_id=v2_comparativo_id,
        note="approve_via_v2",
    )
    try:
        detalle = v2_service.aprobar_comparativo(
            tenant_id=tenant_id,
            comparativo_id=v2_comparativo_id,
            usuario_id=user.id,
            comentario=comment,
        )
    except DomainError as exc:
        raise _domain_error_to_http_exception(exc) from exc

    _sync_contract_from_v2_detail(session, contract, detalle)
    _sync_legacy_comparative_approval_state(
        session,
        contract=contract,
        user=user,
        approval_status=ApprovalStatus.APPROVED,
        comment=comment,
        ensure_both_approved=(
            _map_v2_estado_to_legacy_comparative_status(detalle.comparativo.estado)
            == ComparativeStatus.APPROVED
        ),
    )
    session.commit()
    session.refresh(contract)
    return contract


def reject(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    reason: str,
):
    ensure_tenant_access(user, tenant_id)
    if not can_reject_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    if not reason or not reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El motivo de rechazo es obligatorio.",
        )

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    if _status_value(contract.comparative_status) not in _MGMT_PENDING_STATUS_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comparativo no esta pendiente de aprobacion de gerencia.",
        )
    if not can_reject_comparative(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para rechazar el comparativo.",
        )

    legacy_comparatives_service._ensure_user_can_manage_comparative(
        session,
        contract=contract,
        tenant_id=tenant_id,
        user=user,
    )

    v2_comparativo_id = _get_v2_comparativo_id_from_contract(contract)
    if v2_comparativo_id is None:
        # Fallback legacy controlado para contratos no migrados.
        _log_adapter_path(
            "reject",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="legacy_fallback",
            note="missing_v2_link",
        )
        return _reject_comparative(
            session=session,
            contract_id=contract_id,
            tenant_id=tenant_id,
            user=user,
            reason=reason,
        )

    v2_service = ComparativosV2Service(session)
    reason_clean = reason.strip()
    _log_adapter_path(
        "reject",
        contract_id=contract.id,
        tenant_id=tenant_id,
        path="v2",
        comparativo_id=v2_comparativo_id,
        note="reject_via_v2",
    )
    try:
        detalle = v2_service.rechazar_comparativo(
            tenant_id=tenant_id,
            comparativo_id=v2_comparativo_id,
            usuario_id=user.id,
            motivo=reason_clean,
            comentario=reason_clean,
        )
    except DomainError as exc:
        raise _domain_error_to_http_exception(exc) from exc

    _sync_contract_from_v2_detail(session, contract, detalle)
    _sync_legacy_comparative_approval_state(
        session,
        contract=contract,
        user=user,
        approval_status=ApprovalStatus.REJECTED,
        comment=reason_clean,
    )
    session.commit()
    session.refresh(contract)
    return contract


def return_comparative(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: str,
):
    ensure_tenant_access(user, tenant_id)
    if not (can_approve_comparative(session, user) or can_approve_contract(session, user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    if not comment or not comment.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comentario es obligatorio al devolver el comparativo.",
        )
    if not can_approve_comparative(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Gerencia y Director Tecnico pueden devolver el comparativo.",
        )

    contract = _get_contract_or_404(session, contract_id, tenant_id)
    if _status_value(contract.comparative_status) not in _MGMT_PENDING_STATUS_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede devolver un comparativo pendiente de aprobacion de gerencia.",
        )

    legacy_comparatives_service._ensure_user_can_manage_comparative(
        session,
        contract=contract,
        tenant_id=tenant_id,
        user=user,
    )

    v2_comparativo_id = _get_v2_comparativo_id_from_contract(contract)
    if v2_comparativo_id is None:
        # Fallback legacy controlado para contratos no migrados.
        _log_adapter_path(
            "return_comparative",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="legacy_fallback",
            note="missing_v2_link",
        )
        return _return_comparative(
            session=session,
            contract_id=contract_id,
            tenant_id=tenant_id,
            user=user,
            comment=comment,
        )

    v2_service = ComparativosV2Service(session)
    comment_clean = comment.strip()
    _log_adapter_path(
        "return_comparative",
        contract_id=contract.id,
        tenant_id=tenant_id,
        path="v2",
        comparativo_id=v2_comparativo_id,
        note="return_to_changes_via_v2",
    )
    try:
        detalle = v2_service.devolver_a_cambios(
            tenant_id=tenant_id,
            comparativo_id=v2_comparativo_id,
            usuario_id=user.id,
            comentario=comment_clean,
        )
    except DomainError as exc:
        raise _domain_error_to_http_exception(exc) from exc

    _sync_contract_from_v2_detail(session, contract, detalle)
    _sync_legacy_comparative_approval_state(
        session,
        contract=contract,
        user=user,
        approval_status=ApprovalStatus.REJECTED,
        comment=f"[Devolucion] {comment_clean}",
    )
    session.commit()
    session.refresh(contract)
    return contract

