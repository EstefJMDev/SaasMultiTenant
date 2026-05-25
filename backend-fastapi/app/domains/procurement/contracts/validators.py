from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import object_session

from app.platform.contracts_core.models import Contract, ContractStatus, ContractType


def normalize_tax_id(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9]", "", value).upper()
    return cleaned or None


def normalize_email(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().lower()
    return cleaned or None


def normalize_human_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    # Reparar mojibake UTF-8 interpretado como latin1 (p.ej. EspaÃ±a -> España).
    if any(token in cleaned for token in ("Ã", "Â")):
        try:
            repaired = cleaned.encode("latin-1").decode("utf-8")
            if repaired.strip():
                cleaned = repaired.strip()
        except UnicodeError:
            pass
    return cleaned


def _ensure_status_or_400(current: ContractStatus, allowed: list[ContractStatus]) -> None:
    if current not in set(allowed):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transicion invalida desde estado {current}",
        )


def is_valid_email(value: Optional[str]) -> bool:
    if not value:
        return False
    return re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value) is not None


def _ensure_supplier_email_required(contract: Contract) -> None:
    if not is_valid_email(contract.supplier_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo del proveedor es obligatorio y debe ser valido.",
        )


def _is_non_empty(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _first_non_empty(*values: Any) -> Any:
    for value in values:
        if _is_non_empty(value):
            return value
    return None


def _first_from_maps(maps: list[dict[str, Any]], keys: list[str]) -> Any:
    for mapping in maps:
        for key in keys:
            if key in mapping and _is_non_empty(mapping.get(key)):
                return mapping.get(key)
    return None


REQUIRED_FIELDS_BY_CONTRACT_TYPE: dict[ContractType, list[str]] = {
    ContractType.SERVICIO: [
        "razon_social",
        "empresa",
        "cif",
        "nombre_gerente",
        "nif_gerente",
        "direccion_empresa",
    ],
    ContractType.SUMINISTRO: [
        "razon_social",
        "empresa",
        "cif",
        "nombre_gerente",
        "nif_gerente",
        "direccion_empresa",
    ],
    ContractType.SUBCONTRATACION: [
        "razon_social",
        "empresa",
        "cif",
        "nombre_gerente",
        "nif_gerente",
        "direccion_empresa",
        "tipo_escritura",
        "fecha_escritura",
        "nombre_notario",
        "num_protocolo",
    ],
}

JEFE_OBRA_INTAKE_REQUIRED_FIELDS: dict[str, str] = {
    "num_obra": "Nº obra",
    "empresa_contratada": "Empresa contratada",
    "nombre_contacto": "Nombre contacto",
    "telefono_contacto": "Teléfono contacto",
    "email_contacto": "Email contacto",
    "duracion_ejecucion": "Duración ejecución",
    "fecha_inicio": "Fecha inicio",
    "fecha_fin": "Fecha fin",
    "hitos_clave": "Fechas por hitos o aspectos clave",
    "descripcion_uds_contratadas": "Descripción UDs contratadas",
    "modo_precio": "Modalidad de precio",
    "precio_total_ejecucion": "Precio total ejecución obra",
    "forma_pago": "Forma de pago",
    "forma_pago_pactada": "Forma de pago pactada",
}

# Campos bloqueantes mínimos: solo los que son siempre visibles en el formulario
# del Jefe de Obra. Los campos condicionales (contacto del proveedor cuando aún
# no está en la base, descripción de uds. cuando el check no está marcado,
# portes/descarga según tipo, modo de precio en SUBCONTRATA) se validan en
# frontend según visibilidad y no deben provocar 400 si no aparecen.
JEFE_OBRA_INTAKE_BLOCKING_FIELDS: tuple[str, ...] = (
    "empresa_contratada",
    "precio_total_ejecucion",
)


def build_required_fields(contract_type: ContractType) -> list[str]:
    return list(REQUIRED_FIELDS_BY_CONTRACT_TYPE.get(contract_type, []))


def _normalize_context_value(value: Any) -> Any:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped if stripped else None
    return value


def _compose_supplier_address(contract: Contract) -> Optional[str]:
    parts = [
        contract.supplier_address,
        contract.supplier_city,
        contract.supplier_postal_code,
        contract.supplier_country,
    ]
    clean = [str(p).strip() for p in parts if p and str(p).strip()]
    return ", ".join(clean) if clean else None


def _safe_to_iso_date(value: Any) -> Optional[str]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, str):
        token = value.strip()
        if not token:
            return None
        return token
    return str(value)


def _derive_duration_from_dates(start_date: Any, end_date: Any) -> Optional[str]:
    start = _safe_to_iso_date(start_date)
    end = _safe_to_iso_date(end_date)
    if not start or not end:
        return None
    return f"{start} - {end}"


def extract_context(contract: Contract) -> dict[str, Any]:
    from app.domains.work.catalog_api import get_worksite_by_code_for_tenant

    contract_data = contract.contract_data or {}
    comparative_data = contract.comparative_data or {}
    economic = contract_data.get("economic") or {}
    schedule = contract_data.get("schedule") or {}
    resources = contract_data.get("resources") or {}
    logistics = contract_data.get("logistics") or {}
    service = contract_data.get("service") or {}
    additional = contract_data.get("additional") or {}
    legal = contract_data.get("legal") or {}
    manager = contract_data.get("manager") or {}
    project_meta = contract_data.get("project") or {}
    header = comparative_data.get("header") if isinstance(comparative_data, dict) else {}
    if not isinstance(header, dict):
        header = {}
    contract_session = object_session(contract)
    worksite = (
        get_worksite_by_code_for_tenant(
            contract_session,  # type: ignore[arg-type]
            tenant_id=contract.tenant_id,
            code=contract.project_number
            or project_meta.get("num_obra")
            or header.get("obra_numero")
            or header.get("obra_num")
            or comparative_data.get("obra_numero")
            or comparative_data.get("obra_num"),
        )
        if contract_session is not None
        else None
    )
    worksite_client_name = (
        str(getattr(worksite, "client_name", "") or "").strip() if worksite else ""
    )

    base_context: dict[str, Any] = {
        "contract_id": contract.id,
        "contract_type": contract.type.value if hasattr(contract.type, "value") else str(contract.type),
        "supplier_name": contract.supplier_name,
        "supplier_tax_id": contract.supplier_tax_id,
        "supplier_email": contract.supplier_email,
        "supplier_phone": contract.supplier_phone,
        "supplier_city": contract.supplier_city,
        "supplier_postal_code": contract.supplier_postal_code,
        "supplier_country": contract.supplier_country,
        "supplier_contact_name": contract.supplier_contact_name,
        "supplier_bank_iban": contract.supplier_bank_iban,
        "supplier_bank_bic": contract.supplier_bank_bic,
        "direccion_empresa": _compose_supplier_address(contract),
        "razon_social": contract.supplier_name,
        "empresa": contract.supplier_name,
        "cif": contract.supplier_tax_id,
        "cif_empresa": contract.supplier_tax_id,
        "nombre_gerente": _first_non_empty(
            contract.supplier_legal_rep_name,
            manager.get("nombre_gerente"),
            legal.get("nombre_gerente"),
            additional.get("nombre_gerente"),
            contract.supplier_contact_name,
        ),
        "nif_gerente": contract.supplier_legal_rep_dni
        or manager.get("nif_gerente")
        or legal.get("nif_gerente")
        or additional.get("nif_gerente"),
        "dni_gerente": contract.supplier_legal_rep_dni
        or manager.get("dni_gerente")
        or legal.get("dni_gerente")
        or additional.get("dni_gerente"),
        "tipo_escritura": contract.deed_type or legal.get("tipo_escritura") or additional.get("tipo_escritura"),
        "fecha_escritura": _safe_to_iso_date(contract.deed_date or legal.get("fecha_escritura") or additional.get("fecha_escritura")),
        "nombre_notario": contract.notary_name or legal.get("nombre_notario") or additional.get("nombre_notario"),
        "num_protocolo": contract.notary_protocol or legal.get("num_protocolo") or additional.get("num_protocolo"),
        "nombre_obra": project_meta.get("nombre_obra") or header.get("obra_nombre") or comparative_data.get("obra") or (worksite.name if worksite else None),
        "nom_obra": project_meta.get("nom_obra")
        or project_meta.get("nombre_obra")
        or header.get("obra_nombre")
        or comparative_data.get("obra")
        or (worksite.name if worksite else None),
        "num_obra": contract.project_number or project_meta.get("num_obra") or header.get("obra_num") or contract.project_id,
        "promotora": worksite_client_name
        or contract.promoter
        or project_meta.get("promotora")
        or additional.get("promotora"),
        "fecha_inicio": _safe_to_iso_date(schedule.get("start_date") or project_meta.get("fecha_inicio")),
        "fecha_fin": _safe_to_iso_date(schedule.get("end_date") or project_meta.get("fecha_fin")),
        "duracion_obra": project_meta.get("duracion_obra")
        or schedule.get("duration")
        or schedule.get("duration_months"),
        "hitos": additional.get("milestones"),
        "forma_pago": economic.get("payment_method"),
        "portes": logistics.get("shipping_type"),
        "descargas": logistics.get("unloading_type"),
        "categoria_servicio": service.get("category"),
        "precio_num": economic.get("total_execution_price") or contract.total_amount,
        "precio_let": economic.get("price_text"),
        "garantia": additional.get("garantias") or additional.get("garantia"),
        "work_number": resources.get("work_number"),
        "num_trab": resources.get("workers_count"),
        "num_trab_let": resources.get("workers_count_text") or additional.get("num_trab_let"),
    }

    # Exponer claves top-level de contract_data para compatibilidad con plantillas legadas.
    for key, value in contract_data.items():
        if key not in base_context:
            base_context[key] = value

    normalized_context = {k: _normalize_context_value(v) for k, v in base_context.items()}
    return normalized_context


def extract_jefe_obra_intake_context(contract: Contract) -> dict[str, Any]:
    context = extract_context(contract)
    contract_data = contract.contract_data or {}
    economic = contract_data.get("economic") or {}
    schedule = contract_data.get("schedule") or {}
    resources = contract_data.get("resources") or {}
    additional = contract_data.get("additional") or {}
    manager = contract_data.get("manager") or {}
    legal = contract_data.get("legal") or {}
    project_meta = contract_data.get("project") or {}
    contact_sources = [additional, manager, legal, project_meta]

    intake_context: dict[str, Any] = {
        "num_obra": _first_non_empty(
            context.get("num_obra"),
            context.get("work_number"),
            resources.get("work_number"),
            project_meta.get("obra_num"),
        ),
        "empresa_contratada": _first_non_empty(contract.supplier_name, context.get("empresa"), context.get("razon_social")),
        "nombre_contacto": _first_non_empty(contract.supplier_contact_name, context.get("nombre_gerente")),
        "telefono_contacto": _first_non_empty(
            contract.supplier_phone,
            _first_from_maps(contact_sources, ["telefono_contacto", "phone", "telefono", "contact_phone"]),
        ),
        "email_contacto": _first_non_empty(
            contract.supplier_email,
            _first_from_maps(contact_sources, ["email_contacto", "email", "correo", "contact_email"]),
        ),
        "duracion_ejecucion": _first_non_empty(
            context.get("duracion_obra"),
            context.get("duracion_contrato"),
            schedule.get("duration"),
            schedule.get("duration_months"),
            _derive_duration_from_dates(context.get("fecha_inicio"), context.get("fecha_fin")),
        ),
        "fecha_inicio": context.get("fecha_inicio"),
        "fecha_fin": context.get("fecha_fin"),
        "hitos_clave": _first_non_empty(
            context.get("hitos"),
            additional.get("milestones"),
            additional.get("hitos_clave"),
            schedule.get("milestones"),
            context.get("duracion_obra"),
            _derive_duration_from_dates(context.get("fecha_inicio"), context.get("fecha_fin")),
        ),
        "descripcion_uds_contratadas": _first_non_empty(
            additional.get("units_description"),
            additional.get("descripcion_uds"),
            additional.get("descripcion_unidades"),
            contract.description,
            contract.title,
        ),
        "modo_precio": _first_non_empty(
            economic.get("price_type"),
            additional.get("price_execution_mode"),
            additional.get("modo_precio"),
        ),
        "precio_total_ejecucion": _first_non_empty(
            economic.get("total_execution_price"),
            economic.get("price_numeric"),
            context.get("precio_num"),
        ),
        "forma_pago": _first_non_empty(
            context.get("forma_pago"),
            economic.get("payment_method"),
            economic.get("payment_method_agreed"),
            additional.get("forma_pago"),
        ),
        "forma_pago_pactada": _first_non_empty(
            economic.get("payment_method_agreed"),
            economic.get("payment_method"),
            additional.get("forma_pago_pactada"),
        ),
    }
    return {k: _normalize_context_value(v) for k, v in intake_context.items()}


def validate_jefe_obra_intake(contract: Contract) -> list[str]:
    intake_context = extract_jefe_obra_intake_context(contract)
    missing: list[str] = []
    for key in JEFE_OBRA_INTAKE_BLOCKING_FIELDS:
        value = intake_context.get(key)
        if not _is_non_empty(value):
            missing.append(key)
    email_value = intake_context.get("email_contacto")
    if _is_non_empty(email_value) and not is_valid_email(str(email_value)):
        missing.append("email_contacto")
    return sorted(set(missing))


def format_jefe_obra_intake_missing_fields(fields: list[str]) -> str:
    labels = [JEFE_OBRA_INTAKE_REQUIRED_FIELDS.get(field, field) for field in fields]
    return ", ".join(labels)


def validate_required(context: dict[str, Any], required_fields: list[str]) -> list[str]:
    missing: list[str] = []
    for field in required_fields:
        value = context.get(field)
        if not _is_non_empty(value):
            missing.append(field)
    return missing


def build_supplier_onboarding_payload(contract: Contract) -> dict[str, Any]:
    context = extract_context(contract)
    required_fields = build_required_fields(contract.type)
    missing_fields = validate_required(context, required_fields)
    comparative_data = contract.comparative_data or {}
    jefe_obra_value = _normalize_context_value(comparative_data.get("jefe_obra"))
    nombre_gerente_value = _first_non_empty(
        jefe_obra_value,
        context.get("nombre_gerente"),
    )
    prefill = {
        "razon_social": context.get("razon_social"),
        "empresa": context.get("empresa"),
        "cif": context.get("cif"),
        "nombre_gerente": nombre_gerente_value,
        "nif_gerente": context.get("nif_gerente"),
        "direccion_empresa": context.get("direccion_empresa"),
        "tipo_escritura": context.get("tipo_escritura"),
        "fecha_escritura": context.get("fecha_escritura"),
        "nombre_notario": context.get("nombre_notario"),
        "num_protocolo": context.get("num_protocolo"),
    }
    return {
        "required_fields": required_fields,
        "missing_fields": missing_fields,
        "prefill": prefill,
    }
