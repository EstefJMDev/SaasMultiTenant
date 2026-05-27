from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlmodel import Session

from app.domains.procurement.rea_validator import consultar_rea
from app.domains.procurement.suppliers import normalize_tax_id
from app.platform.contracts_core.comparativos_enums import (
    EstadoAprobacionComparativo,
    EstadoComparativo,
)
from app.platform.contracts_core.comparativos_models import Comparativo
from app.platform.contracts_core.comparativos_schemas import (
    ComparativoCreate,
    ComparativoHitoCreate,
    ComparativoOfertaAdjudicadaCreate,
    ComparativoOfertaAdjudicadaPartidaCreate,
    ComparativoOfertaDescartadaCreate,
    ComparativoOfertaDescartadaPartidaCreate,
    ComparativoUpdate,
)

from . import repo


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _clean_optional_text(value: object) -> Optional[str]:
    if not isinstance(value, str):
        return None
    token = value.strip()
    return token or None


def _safe_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _safe_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _first_non_empty_text(*values: object) -> Optional[str]:
    for value in values:
        cleaned = _clean_optional_text(value)
        if cleaned:
            return cleaned
    return None


def _normalize_lookup_token(value: object) -> Optional[str]:
    cleaned = _clean_optional_text(value)
    if not cleaned:
        return None
    return "".join(ch for ch in cleaned.upper() if ch.isalnum())


def _parse_int(value: object) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


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


def _resolve_provider_id_from_tax_or_name(
    session: Session,
    *,
    tax_id: object = None,
    name: object = None,
) -> Optional[int]:
    lookup_tax_id = normalize_tax_id(tax_id)
    if lookup_tax_id:
        row = session.exec(
            text(
                """
                SELECT id
                FROM proveedores
                WHERE regexp_replace(UPPER(COALESCE(cif, '')), '[^A-Z0-9]', '', 'g') = :lookup_id
                LIMIT 1
                """
            ),
            params={"lookup_id": lookup_tax_id},
        ).first()
        if row is not None:
            return int(getattr(row, "id", row[0]))

    lookup_name = _normalize_lookup_token(name)
    if not lookup_name:
        return None
    row = session.exec(
        text(
            """
            SELECT id
            FROM proveedores
            WHERE regexp_replace(UPPER(COALESCE(razon_social, '')), '[^A-Z0-9]', '', 'g') = :lookup_name
               OR regexp_replace(UPPER(COALESCE(empresa, '')), '[^A-Z0-9]', '', 'g') = :lookup_name
            LIMIT 1
            """
        ),
        params={"lookup_name": lookup_name},
    ).first()
    if row is None:
        return None
    return int(getattr(row, "id", row[0]))


def _resolve_provider_id_from_ui_payload(
    session: Session,
    comparative_data: dict[str, Any],
) -> Optional[int]:
    selected_offer_id = comparative_data.get("selected_offer_id")
    offers = _safe_list(comparative_data.get("offers"))
    selected_offer = None
    if selected_offer_id is not None:
        for offer in offers:
            if isinstance(offer, dict) and str(offer.get("id")) == str(selected_offer_id):
                selected_offer = offer
                break
    if selected_offer is None and offers:
        selected_offer = next((offer for offer in offers if isinstance(offer, dict)), None)

    tax_id = comparative_data.get("supplier_tax_id")
    name = comparative_data.get("supplier_name")
    if isinstance(selected_offer, dict):
        tax_id = selected_offer.get("supplier_tax_id") or tax_id
        name = _offer_display_name(selected_offer) or name
    return _resolve_provider_id_from_tax_or_name(
        session,
        tax_id=tax_id,
        name=name,
    )


def build_create_payload_from_ui(
    session: Session,
    *,
    tenant_id: int,
    usuario_id: int,
    contract_type: Optional[str],
    title: Optional[str],
    comparative_data: Optional[dict[str, Any]],
    source_file_path: Optional[str] = None,
    source_filename: Optional[str] = None,
) -> ComparativoCreate:
    data = _safe_dict(comparative_data)
    header = _safe_dict(data.get("header"))
    totales = _safe_dict(data.get("totales"))
    additional = _safe_dict(_safe_dict(data.get("contract_data")).get("additional"))
    economic = _safe_dict(_safe_dict(data.get("contract_data")).get("economic"))
    resources = _safe_dict(_safe_dict(data.get("contract_data")).get("resources"))

    return ComparativoCreate(
        tenant_id=tenant_id,
        numero_obra=_first_non_empty_text(data.get("obra_numero"), header.get("obra_num")),
        nombre_obra=_first_non_empty_text(data.get("obra_nombre"), header.get("obra_nombre")),
        titulo=_clean_optional_text(title) or _clean_optional_text(data.get("title")),
        estado=EstadoComparativo.BORRADOR,
        tipo_contrato=_clean_optional_text(contract_type) or _clean_optional_text(data.get("contract_type")),
        proveedor_id=_resolve_provider_id_from_ui_payload(session, data),
        usuario_creador_id=usuario_id,
        usuario_actualizacion_id=usuario_id,
        nombre_contacto=_first_non_empty_text(data.get("supplier_contact_name"), data.get("contacto_nombre")),
        telefono_contacto=_first_non_empty_text(data.get("supplier_phone"), data.get("contacto_telefono")),
        email_contacto=_first_non_empty_text(data.get("supplier_email"), data.get("contacto_email")),
        duracion=_first_non_empty_text(data.get("duration_text"), data.get("duracion"), data.get("duracion_ejecucion")),
        descripcion_unidades_contratadas=_first_non_empty_text(
            additional.get("units_description"),
            data.get("descripcion_uds"),
        ),
        condicion_ejecucion=_first_non_empty_text(
            additional.get("price_execution_mode"),
            data.get("condicion_ejecucion"),
        ),
        forma_pago=_first_non_empty_text(
            economic.get("payment_method_agreed"),
            economic.get("payment_method"),
            totales.get("forma_pago"),
            data.get("payment_method"),
        ),
        terminos_pago=_first_non_empty_text(
            data.get("payment_days"),
            economic.get("payment_days"),
            data.get("terminos_pago"),
        ),
        descripcion_forma_pago_otros=_clean_optional_text(economic.get("payment_method_other_text")),
        numero_trabajadores_obra=_parse_int(resources.get("workers_on_site") or resources.get("workers_count")),
        descripcion_garantias=_first_non_empty_text(
            data.get("warranty_text"),
            economic.get("retention_description"),
            data.get("garantia"),
        ),
        payload_ui_json=data,
        source_file_path=source_file_path,
        source_filename=source_filename,
    )


def build_update_payload_from_ui(
    session: Session,
    *,
    usuario_id: int,
    contract_type: Optional[str],
    title: Optional[str],
    comparative_data: Optional[dict[str, Any]],
    source_file_path: Optional[str] = None,
    source_filename: Optional[str] = None,
) -> ComparativoUpdate:
    data = _safe_dict(comparative_data)
    header = _safe_dict(data.get("header"))
    totales = _safe_dict(data.get("totales"))
    additional = _safe_dict(_safe_dict(data.get("contract_data")).get("additional"))
    economic = _safe_dict(_safe_dict(data.get("contract_data")).get("economic"))
    resources = _safe_dict(_safe_dict(data.get("contract_data")).get("resources"))

    return ComparativoUpdate(
        numero_obra=_first_non_empty_text(data.get("obra_numero"), header.get("obra_num")),
        nombre_obra=_first_non_empty_text(data.get("obra_nombre"), header.get("obra_nombre")),
        titulo=_clean_optional_text(title) or _clean_optional_text(data.get("title")),
        tipo_contrato=_clean_optional_text(contract_type) or _clean_optional_text(data.get("contract_type")),
        proveedor_id=_resolve_provider_id_from_ui_payload(session, data),
        usuario_actualizacion_id=usuario_id,
        nombre_contacto=_first_non_empty_text(data.get("supplier_contact_name"), data.get("contacto_nombre")),
        telefono_contacto=_first_non_empty_text(data.get("supplier_phone"), data.get("contacto_telefono")),
        email_contacto=_first_non_empty_text(data.get("supplier_email"), data.get("contacto_email")),
        duracion=_first_non_empty_text(data.get("duration_text"), data.get("duracion"), data.get("duracion_ejecucion")),
        descripcion_unidades_contratadas=_first_non_empty_text(
            additional.get("units_description"),
            data.get("descripcion_uds"),
        ),
        condicion_ejecucion=_first_non_empty_text(
            additional.get("price_execution_mode"),
            data.get("condicion_ejecucion"),
        ),
        forma_pago=_first_non_empty_text(
            economic.get("payment_method_agreed"),
            economic.get("payment_method"),
            totales.get("forma_pago"),
            data.get("payment_method"),
        ),
        terminos_pago=_first_non_empty_text(
            data.get("payment_days"),
            economic.get("payment_days"),
            data.get("terminos_pago"),
        ),
        descripcion_forma_pago_otros=_clean_optional_text(economic.get("payment_method_other_text")),
        numero_trabajadores_obra=_parse_int(resources.get("workers_on_site") or resources.get("workers_count")),
        descripcion_garantias=_first_non_empty_text(
            data.get("warranty_text"),
            economic.get("retention_description"),
            data.get("garantia"),
        ),
        payload_ui_json=data,
        source_file_path=source_file_path,
        source_filename=source_filename,
    )


def _build_hito_payloads(
    *,
    tenant_id: int,
    comparativo_id: int,
    raw_hitos: object,
) -> list[ComparativoHitoCreate]:
    if raw_hitos is None:
        return []
    if isinstance(raw_hitos, str):
        resumen = _clean_optional_text(raw_hitos)
        if not resumen:
            return []
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
        return []

    payloads: list[ComparativoHitoCreate] = []
    for idx, item in enumerate(raw_hitos):
        if not isinstance(item, dict):
            continue
        payloads.append(
            ComparativoHitoCreate(
                tenant_id=tenant_id,
                comparativo_id=comparativo_id,
                fecha_inicio=item.get("fecha_inicio") or item.get("start"),
                fecha_fin=item.get("fecha_fin") or item.get("end"),
                nombre_hito=_first_non_empty_text(item.get("nombre"), item.get("name")) or f"Hito {idx + 1}",
                descripcion_hito=_first_non_empty_text(item.get("descripcion"), item.get("description")),
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
        porcentaje_oferta_homogenea=comparative_totals.get("porcentaje_oferta_homogenea_precio_neto"),
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
        porcentaje_oferta_homogenea=comparative_totals.get("porcentaje_oferta_homogenea_precio_neto"),
        observaciones_oferta=_clean_optional_text(comparative_totals.get("observaciones_oferta")),
        garantias=_clean_optional_text(comparative_totals.get("garantias")),
        retenciones=_clean_optional_text(comparative_totals.get("retenciones")),
        plazos=_first_non_empty_text(offer.get("plazo"), comparative_totals.get("plazos")),
        proveedor_observaciones=_clean_optional_text(offer.get("notes")),
    )


def _build_partidas_for_offer(
    *,
    tenant_id: int,
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


def sync_children_from_ui_payload(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
    comparative_data: Optional[dict[str, Any]],
) -> None:
    data = _safe_dict(comparative_data)
    contract_data = _safe_dict(data.get("contract_data"))
    additional = _safe_dict(contract_data.get("additional"))
    raw_hitos = additional.get("milestones_items") or additional.get("milestones")
    repo.reemplazar_hitos(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        hitos=_build_hito_payloads(
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
            raw_hitos=raw_hitos,
        ),
    )

    offers = [offer for offer in _safe_list(data.get("offers")) if isinstance(offer, dict)]
    selected_offer_id = data.get("selected_offer_id")
    selected_offer = None
    if selected_offer_id is not None:
        selected_offer = next(
            (offer for offer in offers if str(offer.get("id")) == str(selected_offer_id)),
            None,
        )
    if selected_offer is None and offers:
        selected_offer = offers[0]

    lines = [line for line in _safe_list(data.get("lines")) if isinstance(line, dict)]
    comparative_totals = _safe_dict(data.get("totales"))

    if selected_offer is not None:
        proveedor_id = _resolve_provider_id_from_tax_or_name(
            session,
            tax_id=selected_offer.get("supplier_tax_id"),
            name=_offer_display_name(selected_offer),
        )
        oferta_model = repo.guardar_oferta_adjudicada(
            session,
            tenant_id=tenant_id,
            comparativo_id=comparativo_id,
            payload=_build_offer_payload(
                tenant_id=tenant_id,
                comparativo_id=comparativo_id,
                offer=selected_offer,
                proveedor_id=proveedor_id,
                comparative_totals=comparative_totals,
            ),
        )
        repo.reemplazar_partidas_oferta_adjudicada(
            session,
            tenant_id=tenant_id,
            comparativo_oferta_adjudicada_id=oferta_model.id,
            partidas=_build_partidas_for_offer(
                tenant_id=tenant_id,
                offer=selected_offer,
                lines=lines,
            ),
        )
    else:
        repo.borrar_hijos_por_filtro(
            session,
            model=repo.ComparativoOfertaAdjudicada,
            tenant_id=tenant_id,
            filtro_columna="comparativo_id",
            filtro_valor=comparativo_id,
        )

    discarded_models: list[ComparativoOfertaDescartadaCreate] = []
    discarded_partidas: list[list[ComparativoOfertaDescartadaPartidaCreate]] = []
    for offer in offers:
        if selected_offer is not None and str(offer.get("id")) == str(selected_offer.get("id")):
            continue
        proveedor_id = _resolve_provider_id_from_tax_or_name(
            session,
            tax_id=offer.get("supplier_tax_id"),
            name=_offer_display_name(offer),
        )
        discarded_models.append(
            _build_discarded_offer_payload(
                tenant_id=tenant_id,
                comparativo_id=comparativo_id,
                offer=offer,
                proveedor_id=proveedor_id,
                comparative_totals=comparative_totals,
            )
        )
        discarded_partidas.append(
            _build_discarded_partidas_for_offer(
                tenant_id=tenant_id,
                offer=offer,
                lines=lines,
            )
        )

    repo.reemplazar_ofertas_descartadas(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
        ofertas=discarded_models,
        partidas_por_oferta=discarded_partidas,
    )


def map_estado_to_ui_status(estado: str) -> str:
    return {
        EstadoComparativo.BORRADOR.value: "DRAFT",
        EstadoComparativo.PENDIENTE_APROBACION.value: "PENDING_MGMT_APPROVAL",
        EstadoComparativo.APROBADO.value: "APPROVED",
        EstadoComparativo.NECESITA_CAMBIOS.value: "NEEDS_CHANGES",
        EstadoComparativo.RECHAZADO.value: "REJECTED",
    }.get(estado, "DRAFT")


def build_ui_comparative_payload(
    session: Session,
    *,
    detalle: dict[str, Any],
) -> dict[str, Any]:
    comparativo = detalle["comparativo"]
    get_value = (
        (lambda key, default=None: comparativo.get(key, default))
        if isinstance(comparativo, dict)
        else (lambda key, default=None: getattr(comparativo, key, default))
    )
    payload_ui_json = _safe_dict(get_value("payload_ui_json"))
    proveedor = (
        repo.obtener_proveedor_por_id(session, proveedor_id=int(get_value("proveedor_id")))
        if get_value("proveedor_id") is not None
        else None
    )
    offers = payload_ui_json.get("offers")
    if not isinstance(offers, list):
        offers = []

    supplier_name = (
        _clean_optional_text(payload_ui_json.get("supplier_name"))
        or (proveedor or {}).get("empresa")
        or (proveedor or {}).get("razon_social")
    )
    supplier_tax_id = (
        _clean_optional_text(payload_ui_json.get("supplier_tax_id"))
        or (proveedor or {}).get("cif")
    )

    return {
        "id": int(get_value("id")),
        "tenant_id": int(get_value("tenant_id")),
        "created_by_id": int(get_value("usuario_creador_id")),
        "project_id": None,
        "type": get_value("tipo_contrato"),
        "status": map_estado_to_ui_status(str(get_value("estado"))),
        "comparative_status": map_estado_to_ui_status(str(get_value("estado"))),
        "title": get_value("titulo"),
        "description": None,
        "selected_offer_id": _parse_int(
            payload_ui_json.get("selected_offer_id")
            or (offers[0].get("id") if offers else None)
        ),
        "supplier_name": supplier_name,
        "supplier_display_name": supplier_name,
        "supplier_tax_id": supplier_tax_id,
        "supplier_email": _clean_optional_text(payload_ui_json.get("supplier_email")) or get_value("email_contacto"),
        "supplier_phone": _clean_optional_text(payload_ui_json.get("supplier_phone")) or get_value("telefono_contacto"),
        "supplier_address": _clean_optional_text(payload_ui_json.get("supplier_address")),
        "supplier_contact_name": _clean_optional_text(payload_ui_json.get("supplier_contact_name")) or get_value("nombre_contacto"),
        "total_amount": _safe_dict(payload_ui_json.get("totales")).get("precio_neto_oferta") or _safe_dict(payload_ui_json.get("totales")).get("total_ofertas_homogeneas"),
        "project_number": get_value("numero_obra"),
        "payment_method": get_value("forma_pago"),
        "payment_days": _parse_int(get_value("terminos_pago")),
        "warranty_text": get_value("descripcion_garantias"),
        "min_workers": get_value("numero_trabajadores_obra"),
        "comparative_data": {
            **payload_ui_json,
            **(
                {
                    "source_file_path": get_value("source_file_path"),
                    "source_filename": get_value("source_filename"),
                }
                if get_value("source_file_path")
                else {}
            ),
        },
        "contract_data": payload_ui_json.get("contract_data"),
        "created_at": get_value("fecha_creacion").isoformat(),
        "updated_at": get_value("fecha_actualizacion").isoformat(),
        "submitted_at": None,
        "approved_at": get_value("fecha_aprobacion").isoformat()
        if get_value("fecha_aprobacion")
        else None,
        "rejected_at": get_value("fecha_rechazo").isoformat()
        if get_value("fecha_rechazo")
        else None,
        "rejected_reason": get_value("motivo_rechazo"),
    }


def build_ui_approvals(detalle: dict[str, Any]) -> list[dict[str, Any]]:
    approvals = []
    for row in detalle.get("aprobaciones", []):
        get_value = (
            (lambda key, default=None: row.get(key, default))
            if isinstance(row, dict)
            else (lambda key, default=None: getattr(row, key, default))
        )
        role = str(get_value("rol_aprobador", "") or "").upper()
        department = "OBRA" if role in {"OBRA", "DT", "JO"} else "GERENCIA"
        approvals.append(
            {
                "id": int(get_value("id")),
                "tenant_id": int(get_value("tenant_id")),
                "contract_id": int(get_value("comparativo_id")),
                "department": department,
                "status": {
                    EstadoAprobacionComparativo.PENDIENTE.value: "PENDING",
                    EstadoAprobacionComparativo.APROBADO.value: "APPROVED",
                    EstadoAprobacionComparativo.RECHAZADO.value: "REJECTED",
                }.get(str(get_value("estado")), "PENDING"),
                "cycle_number": 1,
                "created_at": get_value("fecha_asignacion"),
                "decided_by_id": get_value("usuario_aprobador_id"),
                "decided_by_name": None,
                "decided_by_department": department,
                "decided_at": get_value("fecha_resolucion"),
                "comment": get_value("comentario"),
            }
        )
    return approvals


def delete_comparativo_if_allowed(
    session: Session,
    *,
    tenant_id: int,
    comparativo_id: int,
) -> None:
    comparativo = repo.obtener_comparativo_por_id(
        session,
        tenant_id=tenant_id,
        comparativo_id=comparativo_id,
    )
    if comparativo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comparativo no encontrado.")
    if str(comparativo.estado) not in {
        EstadoComparativo.BORRADOR.value,
        EstadoComparativo.NECESITA_CAMBIOS.value,
        EstadoComparativo.RECHAZADO.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden eliminar comparativos en borrador, necesita cambios o rechazados.",
        )
    comparativo.eliminado_en = _utcnow()
    comparativo.fecha_actualizacion = _utcnow()
    session.add(comparativo)
    session.commit()


def validate_rea_for_comparativo(
    session: Session,
    *,
    comparativo: Comparativo,
) -> dict[str, Any]:
    tipo = str(comparativo.tipo_contrato or "").strip().upper()
    if tipo != "SUBCONTRATACION":
        return {
            "rea": {
                "encontrada": None,
                "estado": "SKIPPED_NOT_SUBCONTRATACION",
            },
            "supplier_in_db": True,
            "next_action": "send_to_approval",
        }

    payload = _safe_dict(comparativo.payload_ui_json)
    tax_id = (
        _clean_optional_text(payload.get("supplier_tax_id"))
        or _clean_optional_text((repo.obtener_proveedor_por_id(session, proveedor_id=int(comparativo.proveedor_id or 0)) or {}).get("cif"))
    )
    if not tax_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Es necesario un CIF/NIF para validar el REA.",
        )
    rea_result = consultar_rea(tax_id)
    return {
        "rea": rea_result,
        "supplier_in_db": bool(comparativo.proveedor_id),
        "next_action": "send_to_approval" if rea_result.get("estado") == "ALTA" else "send_to_supplier",
    }


def resolve_source_file(comparativo: Comparativo) -> tuple[Path, str]:
    raw_path = _clean_optional_text(comparativo.source_file_path)
    if not raw_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Este comparativo no tiene un archivo Excel original almacenado.",
        )
    path_obj = Path(raw_path)
    if not path_obj.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Archivo Excel original no encontrado en almacenamiento.",
        )
    return path_obj, comparativo.source_filename or f"comparativo-CP-{comparativo.id}{path_obj.suffix}"
