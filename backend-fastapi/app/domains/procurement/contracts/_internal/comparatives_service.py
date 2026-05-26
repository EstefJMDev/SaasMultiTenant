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
    ComparativeStatus,
    Contract,
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
from app.domains.procurement.comparativos_v2 import repo as comparativos_v2_repo
from app.domains.procurement.comparativos_v2.service import (
    ComparativoDetalleRead,
    ComparativosV2Service,
)
from app.domains.procurement.contracts import crud as contract_crud
from app.domains.procurement.suppliers import normalize_tax_id
from app.platform.contracts_core.comparativos_schemas import (
    ComparativoHitoCreate,
    ComparativoOfertaAdjudicadaCreate,
    ComparativoOfertaAdjudicadaPartidaCreate,
    ComparativoOfertaDescartadaCreate,
    ComparativoOfertaDescartadaPartidaCreate,
)

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
    "ensure_v2_draft_link",
    "save_draft",
    "sync_v2_children_from_contract",
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
    if lookup_tax_id:
        stmt = text(
            """
            SELECT id
            FROM proveedores
            WHERE regexp_replace(UPPER(COALESCE(cif, '')), '[^A-Z0-9]', '', 'g') = :lookup_id
            LIMIT 1
            """
        )
        row = session.exec(stmt, params={"lookup_id": lookup_tax_id}).first()
        proveedor_id = _int_from_row_value(row)
        if proveedor_id is not None:
            return proveedor_id

    comparative_data = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    offers = comparative_data.get("offers")
    selected_offer_id = comparative_data.get("selected_offer_id")
    candidates: list[str] = []

    contract_supplier_name = _clean_optional_text(contract.supplier_name)
    if contract_supplier_name:
        candidates.append(contract_supplier_name)

    if isinstance(offers, list):
        selected_offer: Optional[dict[str, Any]] = None
        if selected_offer_id is not None:
            for offer in offers:
                if not isinstance(offer, dict):
                    continue
                offer_id = offer.get("id")
                if offer_id is not None and str(offer_id) == str(selected_offer_id):
                    selected_offer = offer
                    break
        if selected_offer is None:
            selected_offer = next((offer for offer in offers if isinstance(offer, dict)), None)
        if selected_offer is not None:
            for key in ("supplier_name", "offer_name", "empresa", "proveedor"):
                value = _clean_optional_text(selected_offer.get(key))
                if value and value not in candidates:
                    candidates.append(value)

    providers = comparative_data.get("providers")
    if isinstance(providers, list):
        for provider in providers:
            if not isinstance(provider, dict):
                continue
            value = _clean_optional_text(provider.get("name"))
            if value and value not in candidates:
                candidates.append(value)

    if not candidates:
        return None

    stmt_by_name = text(
        """
        SELECT id
        FROM proveedores
        WHERE regexp_replace(UPPER(COALESCE(razon_social, '')), '[^A-Z0-9]', '', 'g')
              = regexp_replace(UPPER(:lookup_name), '[^A-Z0-9]', '', 'g')
           OR regexp_replace(UPPER(COALESCE(empresa, '')), '[^A-Z0-9]', '', 'g')
              = regexp_replace(UPPER(:lookup_name), '[^A-Z0-9]', '', 'g')
        LIMIT 1
        """
    )
    for candidate in candidates:
        row = session.exec(stmt_by_name, params={"lookup_name": candidate}).first()
        proveedor_id = _int_from_row_value(row)
        if proveedor_id is not None:
            return proveedor_id
    return None


def _extract_contract_work_snapshot(contract: Contract) -> tuple[Optional[str], Optional[str]]:
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
    return obra_numero, obra_nombre


def _build_v2_create_payload_from_contract(
    session: Session,
    *,
    contract: Contract,
    user: User,
) -> Optional[ComparativoCreate]:
    proveedor_id = _resolve_v2_proveedor_id_from_contract(session, contract)
    obra_numero, obra_nombre = _extract_contract_work_snapshot(contract)
    titulo = _clean_optional_text(contract.title)
    tipo_contrato = _clean_optional_text(getattr(contract.type, "value", contract.type))
    usuario_creador_id = user.id or contract.created_by_id
    comparative_data = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    totales = comparative_data.get("totales") if isinstance(comparative_data.get("totales"), dict) else {}
    forma_pago = _first_non_empty_text(
        totales.get("forma_pago"),
        contract.payment_method,
    )

    missing_fields: list[str] = []
    required_field_values = {
        "titulo": titulo,
        "numero_obra": obra_numero,
        "nombre_obra": obra_nombre,
        "tipo_contrato": tipo_contrato,
        "tenant_id": contract.tenant_id,
        "usuario_creador_id": usuario_creador_id,
    }
    for field_name, field_value in required_field_values.items():
        if field_value is None:
            missing_fields.append(field_name)
        elif isinstance(field_value, str) and not field_value.strip():
            missing_fields.append(field_name)
    if proveedor_id is None:
        missing_fields.append("proveedor_id")
    if missing_fields:
        logger.info(
            "comparatives_adapter op=build_v2_payload contract_id=%s tenant_id=%s missing_fields=%s",
            contract.id,
            contract.tenant_id,
            missing_fields,
        )

    if any(field != "proveedor_id" for field in missing_fields):
        return None

    return ComparativoCreate(
        tenant_id=contract.tenant_id,
        numero_obra=obra_numero,
        nombre_obra=obra_nombre,
        titulo=titulo,
        estado=EstadoComparativo.BORRADOR,
        tipo_contrato=tipo_contrato,
        proveedor_id=(int(proveedor_id) if proveedor_id is not None else None),
        usuario_creador_id=int(usuario_creador_id),
        usuario_actualizacion_id=user.id,
        nombre_contacto=_clean_optional_text(contract.supplier_contact_name),
        telefono_contacto=_clean_optional_text(contract.supplier_phone),
        email_contacto=_clean_optional_text(contract.supplier_email),
        duracion=_first_non_empty_text(contract.duration_text, contract.execution_duration),
        forma_pago=forma_pago,
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
    obra_numero, obra_nombre = _extract_contract_work_snapshot(contract)
    tipo_contrato = _clean_optional_text(getattr(contract.type, "value", contract.type))
    comparative_data = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    totales = comparative_data.get("totales") if isinstance(comparative_data.get("totales"), dict) else {}
    forma_pago = _first_non_empty_text(
        totales.get("forma_pago"),
        contract.payment_method,
    )

    return ComparativoUpdate(
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
        forma_pago=forma_pago,
        terminos_pago=(str(contract.payment_days) if contract.payment_days is not None else None),
        numero_trabajadores_obra=contract.min_workers,
        descripcion_garantias=_clean_optional_text(contract.warranty_text),
    )


def _normalize_lookup_token(value: object) -> Optional[str]:
    cleaned = _clean_optional_text(value)
    if not cleaned:
        return None
    return "".join(ch for ch in cleaned.upper() if ch.isalnum())


def _safe_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _safe_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _offer_display_name(offer: dict[str, Any]) -> Optional[str]:
    return _first_non_empty_text(
        offer.get("supplier_name"),
        offer.get("offer_name"),
        offer.get("empresa"),
        offer.get("proveedor"),
    )


def _offer_identifier(offer: dict[str, Any]) -> Optional[str]:
    raw_id = offer.get("id")
    if raw_id is None:
        return None
    return str(raw_id)


def _find_offer_by_selected_offer_id(
    offers: list[dict[str, Any]],
    *,
    selected_offer_id: object,
) -> Optional[dict[str, Any]]:
    selected_offer_id_str = _clean_optional_text(str(selected_offer_id)) if selected_offer_id is not None else None
    if not selected_offer_id_str:
        return None
    for offer in offers:
        offer_id = _offer_identifier(offer)
        if offer_id and offer_id == selected_offer_id_str:
            return offer
    return None


def _resolve_selected_offer_id_from_contract(contract: Contract) -> Optional[str]:
    comparative_data = _safe_dict(contract.comparative_data)
    comparative_selected_offer_id = comparative_data.get("selected_offer_id")
    if comparative_selected_offer_id is not None:
        selected_offer_id = _clean_optional_text(str(comparative_selected_offer_id))
        if selected_offer_id:
            return selected_offer_id

    legacy_selected_offer_id = getattr(contract, "selected_offer_id", None)
    if legacy_selected_offer_id is not None:
        selected_offer_id = _clean_optional_text(str(legacy_selected_offer_id))
        if selected_offer_id:
            return selected_offer_id

    return None


def _resolve_v2_proveedor_id_from_offer(
    session: Session,
    offer: dict[str, Any],
) -> Optional[int]:
    tax_id = normalize_tax_id(offer.get("supplier_tax_id"))
    if tax_id:
        stmt = text(
            """
            SELECT id
            FROM proveedores
            WHERE regexp_replace(UPPER(COALESCE(cif, '')), '[^A-Z0-9]', '', 'g') = :lookup_id
            LIMIT 1
            """
        )
        row = session.exec(stmt, params={"lookup_id": tax_id}).first()
        proveedor_id = _int_from_row_value(row)
        if proveedor_id is not None:
            return proveedor_id

    offer_name = _offer_display_name(offer)
    lookup_name = _normalize_lookup_token(offer_name)
    if not lookup_name:
        return None

    stmt = text(
        """
        SELECT id
        FROM proveedores
        WHERE regexp_replace(UPPER(COALESCE(razon_social, '')), '[^A-Z0-9]', '', 'g') = :lookup_name
           OR regexp_replace(UPPER(COALESCE(empresa, '')), '[^A-Z0-9]', '', 'g') = :lookup_name
        LIMIT 1
        """
    )
    row = session.exec(stmt, params={"lookup_name": lookup_name}).first()
    return _int_from_row_value(row)


def _build_hito_payloads(
    *,
    tenant_id: int,
    comparativo_id: int,
    raw_hitos: object,
) -> Optional[list[ComparativoHitoCreate]]:
    if raw_hitos is None:
        return None

    if isinstance(raw_hitos, str):
        resumen = _clean_optional_text(raw_hitos)
        if not resumen:
            return None
        return [
            ComparativoHitoCreate(
                tenant_id=tenant_id,
                comparativo_id=comparativo_id,
                nombre_hito="Resumen",
                descripcion_hito=resumen,
                orden=0,
            )
        ]

    if not isinstance(raw_hitos, list):
        return None

    payloads: list[ComparativoHitoCreate] = []
    for idx, item in enumerate(raw_hitos):
        if isinstance(item, str):
            descripcion = _clean_optional_text(item)
            if not descripcion:
                continue
            payloads.append(
                ComparativoHitoCreate(
                    tenant_id=tenant_id,
                    comparativo_id=comparativo_id,
                    nombre_hito=f"Hito {idx + 1}",
                    descripcion_hito=descripcion,
                    orden=idx,
                )
            )
            continue

        if not isinstance(item, dict):
            continue

        # Aliases del wizard (contract_data.additional.milestones_items):
        #   name -> nombre, description -> descripcion, start -> fecha_inicio, end -> fecha_fin
        nombre_hito = _first_non_empty_text(
            item.get("nombre"),
            item.get("titulo"),
            item.get("concepto"),
            item.get("name"),
        )
        descripcion_hito = _first_non_empty_text(
            item.get("descripcion"),
            item.get("observaciones"),
            item.get("detalle"),
            item.get("concepto"),
            item.get("description"),
        )
        payloads.append(
            ComparativoHitoCreate(
                tenant_id=tenant_id,
                comparativo_id=comparativo_id,
                fecha_inicio=(
                    item.get("fecha_inicio")
                    or item.get("fecha_prevista")
                    or item.get("start")
                ),
                fecha_fin=(
                    item.get("fecha_fin")
                    or item.get("fecha_vencimiento")
                    or item.get("end")
                ),
                nombre_hito=nombre_hito or f"Hito {idx + 1}",
                descripcion_hito=descripcion_hito,
                orden=idx,
            )
        )

    return payloads


def _build_offer_payload(
    *,
    tenant_id: int,
    comparativo_id: int,
    offer: dict[str, Any],
    proveedor_id: Optional[int],
    comparative_totals: dict[str, Any],
) -> ComparativoOfertaAdjudicadaCreate:
    return ComparativoOfertaAdjudicadaCreate(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        proveedor_id=proveedor_id,
        numero_oferta=_offer_identifier(offer),
        empresa=_offer_display_name(offer),
        telefono=_clean_optional_text(offer.get("supplier_phone")),
        email=_clean_optional_text(offer.get("supplier_email")),
        total_ofertado=offer.get("total_amount"),
        total_ofertas_homogeneas=comparative_totals.get("total_ofertas_homogeneas"),
        porcentaje_oferta_homogenea=comparative_totals.get(
            "porcentaje_oferta_homogenea_precio_neto"
        ),
        observaciones_oferta=_clean_optional_text(comparative_totals.get("observaciones_oferta")),
        garantias=_clean_optional_text(comparative_totals.get("garantias")),
        retenciones=_clean_optional_text(comparative_totals.get("retenciones")),
        plazos=_first_non_empty_text(offer.get("plazo"), comparative_totals.get("plazos")),
        proveedor_observaciones=_clean_optional_text(offer.get("notes")),
    )


def _build_discarded_offer_payload(
    *,
    tenant_id: int,
    comparativo_id: int,
    offer: dict[str, Any],
    proveedor_id: Optional[int],
    comparative_totals: dict[str, Any],
) -> ComparativoOfertaDescartadaCreate:
    return ComparativoOfertaDescartadaCreate(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        proveedor_id=proveedor_id,
        numero_oferta=_offer_identifier(offer),
        empresa=_offer_display_name(offer),
        telefono=_clean_optional_text(offer.get("supplier_phone")),
        email=_clean_optional_text(offer.get("supplier_email")),
        total_ofertado=offer.get("total_amount"),
        total_ofertas_homogeneas=comparative_totals.get("total_ofertas_homogeneas"),
        porcentaje_oferta_homogenea=comparative_totals.get(
            "porcentaje_oferta_homogenea_precio_neto"
        ),
        observaciones_oferta=_clean_optional_text(comparative_totals.get("observaciones_oferta")),
        garantias=_clean_optional_text(comparative_totals.get("garantias")),
        retenciones=_clean_optional_text(comparative_totals.get("retenciones")),
        plazos=_first_non_empty_text(offer.get("plazo"), comparative_totals.get("plazos")),
        proveedor_observaciones=_clean_optional_text(offer.get("notes")),
    )


def _build_partidas_for_offer(
    *,
    tenant_id: int,
    selected_offer_id: object,
    offer: dict[str, Any],
    lines: list[dict[str, Any]],
) -> list[ComparativoOfertaAdjudicadaPartidaCreate]:
    provider_tokens = {
        token
        for token in (
            _normalize_lookup_token(offer.get("supplier_name")),
            _normalize_lookup_token(offer.get("offer_name")),
            _normalize_lookup_token(offer.get("empresa")),
            _normalize_lookup_token(offer.get("proveedor")),
        )
        if token
    }
    partidas: list[ComparativoOfertaAdjudicadaPartidaCreate] = []
    for idx, line in enumerate(lines):
        prices = _safe_list(line.get("prices"))
        matching_price: Optional[dict[str, Any]] = None
        for price in prices:
            if not isinstance(price, dict):
                continue
            provider_token = _normalize_lookup_token(price.get("proveedor"))
            if provider_token and provider_token in provider_tokens:
                matching_price = price
                break
        if matching_price is None:
            continue
        partidas.append(
            ComparativoOfertaAdjudicadaPartidaCreate(
                tenant_id=tenant_id,
                comparativo_oferta_adjudicada_id=0,
                codigo_capitulo=_clean_optional_text(line.get("cod_capitulo")),
                medicion=line.get("cantidad"),
                unidad=_clean_optional_text(line.get("unidad")),
                descripcion=_clean_optional_text(line.get("descripcion")),
                precio=matching_price.get("precio_unitario"),
                importe=matching_price.get("importe"),
                orden=idx,
            )
        )
    return partidas


def _build_discarded_partidas_for_offer(
    *,
    tenant_id: int,
    offer: dict[str, Any],
    lines: list[dict[str, Any]],
) -> list[ComparativoOfertaDescartadaPartidaCreate]:
    provider_tokens = {
        token
        for token in (
            _normalize_lookup_token(offer.get("supplier_name")),
            _normalize_lookup_token(offer.get("offer_name")),
            _normalize_lookup_token(offer.get("empresa")),
            _normalize_lookup_token(offer.get("proveedor")),
        )
        if token
    }
    partidas: list[ComparativoOfertaDescartadaPartidaCreate] = []
    for idx, line in enumerate(lines):
        prices = _safe_list(line.get("prices"))
        matching_price: Optional[dict[str, Any]] = None
        for price in prices:
            if not isinstance(price, dict):
                continue
            provider_token = _normalize_lookup_token(price.get("proveedor"))
            if provider_token and provider_token in provider_tokens:
                matching_price = price
                break
        if matching_price is None:
            continue
        partidas.append(
            ComparativoOfertaDescartadaPartidaCreate(
                tenant_id=tenant_id,
                comparativo_oferta_descartada_id=0,
                codigo_capitulo=_clean_optional_text(line.get("cod_capitulo")),
                medicion=line.get("cantidad"),
                unidad=_clean_optional_text(line.get("unidad")),
                descripcion=_clean_optional_text(line.get("descripcion")),
                precio=matching_price.get("precio_unitario"),
                importe=matching_price.get("importe"),
                orden=idx,
            )
        )
    return partidas


def _log_v2_children_sync(
    *,
    comparativo_id: int,
    selected_offer_id: Optional[str],
    hitos_count: int,
    offers_count: int,
    adjudicada_partidas_count: int,
    descartadas_count: int,
    descartadas_partidas_count: int,
    skipped_reason: Optional[str] = None,
) -> None:
    logger.info(
        (
            "comparatives_adapter op=sync_v2_children comparativo_id=%s "
            "selected_offer_id=%s hitos_count=%s offers_count=%s "
            "adjudicada_partidas_count=%s descartadas_count=%s "
            "descartadas_partidas_count=%s skipped_reason=%s"
        ),
        comparativo_id,
        selected_offer_id or "",
        hitos_count,
        offers_count,
        adjudicada_partidas_count,
        descartadas_count,
        descartadas_partidas_count,
        skipped_reason or "",
    )


def _sync_v2_children_from_contract_comparative_data(
    session: Session,
    *,
    contract: Contract,
    comparativo_id: int,
    tenant_id: int,
    user_id: int,
) -> None:
    comparative_data = _safe_dict(contract.comparative_data)
    contract_data = _safe_dict(contract.contract_data)
    totales = _safe_dict(comparative_data.get("totales"))
    offers = [item for item in _safe_list(comparative_data.get("offers")) if isinstance(item, dict)]
    lines = [item for item in _safe_list(comparative_data.get("lines")) if isinstance(item, dict)]
    selected_offer_id = _resolve_selected_offer_id_from_contract(contract)

    # `contract_data` lleva los datos del formulario de informacion del
    # comparativo (wizard). Estructura observada en runtime:
    #   contract_data.additional.milestones_items: list[{name,start,end,description}]
    #   contract_data.economic.payment_method_agreed: str
    cd_additional = _safe_dict(contract_data.get("additional"))
    cd_economic = _safe_dict(contract_data.get("economic"))

    comparativo = comparativos_v2_repo.obtener_comparativo_por_id(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )
    if comparativo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comparativo v2 no encontrado para sincronizar detalle.",
        )

    # forma_pago: 1º totales.forma_pago, 2º contract_data.economic.payment_method_agreed
    forma_pago = _clean_optional_text(totales.get("forma_pago")) or _clean_optional_text(
        cd_economic.get("payment_method_agreed")
    )
    if forma_pago and comparativo.forma_pago != forma_pago:
        comparativos_v2_repo.actualizar_comparativo(
            session,
            comparativo=comparativo,
            payload=ComparativoUpdate(
                forma_pago=forma_pago,
                usuario_actualizacion_id=user_id,
            ),
        )

    # hitos: 1º totales.hitos (legacy / Excel / drafts), 2º contract_data.additional.milestones_items (wizard)
    hitos_key_present = "hitos" in totales
    raw_hitos = totales.get("hitos") if hitos_key_present else None
    hitos_source = "totales"
    if raw_hitos is None:
        cd_milestones = cd_additional.get("milestones_items")
        if isinstance(cd_milestones, list) and cd_milestones:
            raw_hitos = cd_milestones
            hitos_key_present = True
            hitos_source = "contract_data.additional.milestones_items"
    hitos_payload = _build_hito_payloads(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        raw_hitos=raw_hitos,
    )
    hitos_count = 0
    if hitos_key_present and hitos_payload is not None:
        comparativos_v2_repo.reemplazar_hitos(
            session,
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
            hitos=hitos_payload,
        )
        hitos_count = len(hitos_payload)
        logger.info(
            "comparatives_adapter op=sync_v2_children comparativo_id=%s hitos_source=%s hitos_count=%s",
            comparativo_id,
            hitos_source,
            hitos_count,
        )
    elif raw_hitos is None:
        logger.info(
            "comparatives_adapter op=sync_v2_children comparativo_id=%s skipped_hitos=true",
            comparativo_id,
        )

    if not selected_offer_id:
        _log_v2_children_sync(
            comparativo_id=comparativo_id,
            selected_offer_id=None,
            hitos_count=hitos_count,
            offers_count=len(offers),
            adjudicada_partidas_count=0,
            descartadas_count=0,
            descartadas_partidas_count=0,
            skipped_reason="missing_selected_offer_id",
        )
        logger.info(
            "comparatives_adapter op=sync_v2_children skipped_offers reason=missing_selected_offer_id comparativo_id=%s",
            comparativo_id,
        )
        return

    selected_offer = _find_offer_by_selected_offer_id(
        offers,
        selected_offer_id=selected_offer_id,
    )
    if selected_offer is None:
        _log_v2_children_sync(
            comparativo_id=comparativo_id,
            selected_offer_id=selected_offer_id,
            hitos_count=hitos_count,
            offers_count=len(offers),
            adjudicada_partidas_count=0,
            descartadas_count=0,
            descartadas_partidas_count=0,
            skipped_reason="selected_offer_id_not_found",
        )
        logger.info(
            "comparatives_adapter op=sync_v2_children skipped_offers reason=selected_offer_id_not_found comparativo_id=%s selected_offer_id=%s",
            comparativo_id,
            selected_offer_id,
        )
        return

    selected_proveedor_id = _resolve_v2_proveedor_id_from_offer(session, selected_offer)
    if selected_proveedor_id is None:
        logger.info(
            "comparatives_adapter op=sync_v2_children comparativo_id=%s missing_provider_id=%s",
            comparativo_id,
            _offer_display_name(selected_offer) or "",
        )
    oferta_adjudicada_payload = _build_offer_payload(
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        offer=selected_offer,
        proveedor_id=selected_proveedor_id,
        comparative_totals=totales,
    )
    oferta_adjudicada_model = comparativos_v2_repo.guardar_oferta_adjudicada(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        payload=oferta_adjudicada_payload,
    )
    adjudicada_partidas = _build_partidas_for_offer(
        tenant_id=tenant_id,
        selected_offer_id=selected_offer_id,
        offer=selected_offer,
        lines=lines,
    )
    comparativos_v2_repo.reemplazar_partidas_oferta_adjudicada(
        session,
        tenant_id=tenant_id,
        comparativo_oferta_adjudicada_id=oferta_adjudicada_model.id,
        partidas=adjudicada_partidas,
    )

    comparativos_v2_repo.reemplazar_ofertas_descartadas(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )
    discarded_offers = [
        offer
        for offer in offers
        if _offer_identifier(offer) and _offer_identifier(offer) != selected_offer_id
    ]
    descartadas_partidas_count = 0
    for discarded_offer in discarded_offers:
        proveedor_id = _resolve_v2_proveedor_id_from_offer(session, discarded_offer)
        if proveedor_id is None:
            logger.info(
                "comparatives_adapter op=sync_v2_children comparativo_id=%s missing_provider_id=%s",
                comparativo_id,
                _offer_display_name(discarded_offer) or "",
            )
        oferta_descartada_model = comparativos_v2_repo.guardar_oferta_descartada(
            session,
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
            payload=_build_discarded_offer_payload(
                tenant_id=tenant_id,
                comparativo_id=comparativo_id,
                offer=discarded_offer,
                proveedor_id=proveedor_id,
                comparative_totals=totales,
            ),
        )
        partidas_descartadas = _build_discarded_partidas_for_offer(
            tenant_id=tenant_id,
            offer=discarded_offer,
            lines=lines,
        )
        comparativos_v2_repo.reemplazar_partidas_oferta_descartada(
            session,
            tenant_id=tenant_id,
            comparativo_oferta_descartada_id=oferta_descartada_model.id,
            partidas=partidas_descartadas,
        )
        descartadas_partidas_count += len(partidas_descartadas)

    hitos_count = len(
        comparativos_v2_repo.obtener_hitos_por_comparativo(
            session,
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
        )
    )
    adjudicada_count = 1 if comparativos_v2_repo.obtener_oferta_adjudicada_por_comparativo(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    ) else 0
    descartadas_models = comparativos_v2_repo.obtener_ofertas_descartadas_por_comparativo(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )
    _log_v2_children_sync(
        comparativo_id=comparativo_id,
        selected_offer_id=selected_offer_id,
        hitos_count=hitos_count,
        offers_count=len(offers),
        adjudicada_partidas_count=len(adjudicada_partidas),
        descartadas_count=len(descartadas_models) if adjudicada_count >= 0 else 0,
        descartadas_partidas_count=descartadas_partidas_count,
    )


def sync_v2_children_from_contract(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    contract = _get_contract_or_404(session, contract_id, tenant_id)
    comparativo_id = _get_v2_comparativo_id_from_contract(contract)
    if comparativo_id is None:
        _log_adapter_path(
            "sync_v2_children_from_contract",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="legacy",
            note="no_v2_link_skip_children_sync",
        )
        return contract
    _sync_v2_children_from_contract_comparative_data(
        session,
        contract=contract,
        comparativo_id=comparativo_id,
        tenant_id=tenant_id,
        user_id=user.id,
    )
    session.commit()
    session.refresh(contract)
    return contract




def _resolver_aprobadores_v2(
    session: Session,
    *,
    tenant_id: int,
    creador_id: int,
) -> list[dict[str, Any]]:
    """Construye las 2 aprobaciones del flujo: Director Técnico del creador + Gerencia (sin asignar).

    - Obra: busca el director_tecnico_id del perfil del creador. Si existe y tiene
      can_approve_comparative, lo asigna. Si no, deja usuario_aprobador_id=None.
    - Gerencia: siempre una aprobación sin usuario asignado; cualquier Gerencia
      con can_approve_comparative puede resolverla.
    """
    # Buscar el Director Técnico asignado al creador
    dt_user_id: Optional[int] = None
    dt_row = session.exec(
        text("""
            SELECT dt_ep.user_id
            FROM employeeprofile ep
            JOIN employeeprofile dt_ep ON dt_ep.id = ep.director_tecnico_id
            JOIN position dt_pos ON dt_pos.id = dt_ep.position_id
            WHERE ep.user_id = :creador_id
              AND ep.tenant_id = :tenant_id
              AND ep.is_active = TRUE
              AND dt_ep.is_active = TRUE
              AND dt_pos.can_approve_comparative = TRUE
              AND dt_pos.is_active = TRUE
            LIMIT 1
        """),
        params={"creador_id": creador_id, "tenant_id": tenant_id},
    ).first()
    if dt_row:
        dt_user_id = int(dt_row[0])

    return [
        {
            "usuario_aprobador_id": dt_user_id,
            "rol_aprobador": "Obra",
            "orden_aprobacion": 0,
        },
        {
            "usuario_aprobador_id": None,
            "rol_aprobador": "Gerencia",
            "orden_aprobacion": 0,
        },
    ]


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


def ensure_v2_draft_link(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: Optional[str] = None,
    raise_on_error: bool = False,
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    contract = _get_contract_or_404(session, contract_id, tenant_id)
    existing_v2_id = _get_v2_comparativo_id_from_contract(contract)
    if existing_v2_id is not None:
        _log_adapter_path(
            "ensure_v2_draft_link",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="v2",
            comparativo_id=existing_v2_id,
            note="already_has_v2_link",
        )
        return contract

    payload = _build_v2_create_payload_from_contract(
        session,
        contract=contract,
        user=user,
    )
    if payload is None:
        _log_adapter_path(
            "ensure_v2_draft_link",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="legacy_fallback",
            note="missing_data_for_v2_create",
        )
        return contract

    v2_service = ComparativosV2Service(session)
    try:
        detalle = v2_service.crear_comparativo(
            tenant_id=tenant_id,
            payload=payload,
            usuario_id=user.id,
            comentario_historial=comment
            or "Comparativo creado desde adapter legacy para mantener vinculo v2.",
        )
        _set_v2_comparativo_id_on_contract(session, contract, detalle.comparativo.id)
        _sync_contract_from_v2_detail(session, contract, detalle)
        session.commit()
        session.refresh(contract)
        _log_adapter_path(
            "ensure_v2_draft_link",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="v2",
            comparativo_id=detalle.comparativo.id,
            note="created_v2_link",
        )
        return contract
    except DomainError as exc:
        session.rollback()
        _log_adapter_path(
            "ensure_v2_draft_link",
            contract_id=contract.id,
            tenant_id=tenant_id,
            path="legacy_fallback",
            note=f"domain_error_{exc.message}",
        )
        if raise_on_error:
            raise _domain_error_to_http_exception(exc) from exc
        return contract


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
        _sync_v2_children_from_contract_comparative_data(
            session,
            contract=contract,
            comparativo_id=v2_comparativo_id,
            tenant_id=tenant_id,
            user_id=user.id,
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

    _sync_v2_children_from_contract_comparative_data(
        session,
        contract=contract,
        comparativo_id=v2_comparativo_id,
        tenant_id=tenant_id,
        user_id=user.id,
    )

    aprobadores = _resolver_aprobadores_v2(session, tenant_id=tenant_id, creador_id=contract.created_by_id or user.id)
    try:
        detalle = v2_service.enviar_a_aprobacion(
            tenant_id=tenant_id,
            comparativo_id=v2_comparativo_id,
            usuario_id=user.id,
            aprobadores_iniciales=aprobadores or None,
        )
    except DomainError as exc:
        raise _domain_error_to_http_exception(exc) from exc

    _sync_contract_from_v2_detail(session, contract, detalle)
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
    session.commit()
    session.refresh(contract)
    return contract

