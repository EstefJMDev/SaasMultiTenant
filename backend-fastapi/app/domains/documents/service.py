from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
import re
from typing import Any

logger = logging.getLogger("app.documents.service")

from app.platform.contracts_core.models import Contract, ContractDocumentType, ContractType
from app.domains.documents.docx_templates import _convert_docx_to_pdf, _render_docx_template
from app.domains.documents.pdf_generator import _render_comparative_pdf, _render_summary_pdf
from app.domains.documents.pdf_utils import (
    _fill_pdf_placeholders_exact,
    _fill_template_by_anchors,
    _patch_suministro_signature_page,
)
from app.domains.documents.template_resolver import _docx_template_path_for, _template_path_for
from app.domains.documents.utils import (
    _compute_rc_insurance_amount,
    _format_amount,
    _human_duration_between,
    _number_to_words_upper,
    _price_to_words_upper,
)
from app.domains.documents.storage import (
    build_contract_document_path,
    ensure_parent_dir,
    safe_unlink,
    write_bytes_from_path,
)


REQUIRED_SUPPLIER_FIELDS = [
    "supplier_name",
    "supplier_tax_id",
]

def supplier_data_complete(contract: Contract) -> bool:
    for field in REQUIRED_SUPPLIER_FIELDS:
        value = getattr(contract, field, None)
        if not value:
            return False
    return True

def _compose_company_address(contract: Contract) -> str:
    parts = [
        contract.supplier_address,
        contract.supplier_city,
        contract.supplier_postal_code,
        contract.supplier_country,
    ]
    return ", ".join([str(p).strip() for p in parts if p and str(p).strip()])

def _clean_supplier_name(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    if not text:
        return fallback
    # Evita nombres residuales tipo "1", "2", etc.
    if re.fullmatch(r"\d+", text):
        return fallback
    return text

def _today_parts() -> tuple[str, str, str]:
    now = datetime.now(timezone.utc)
    month_map = {
        1: "enero",
        2: "febrero",
        3: "marzo",
        4: "abril",
        5: "mayo",
        6: "junio",
        7: "julio",
        8: "agosto",
        9: "septiembre",
        10: "octubre",
        11: "noviembre",
        12: "diciembre",
    }
    return str(now.day), month_map.get(now.month, str(now.month)), str(now.year)

def _contract_field_map(contract: Contract) -> dict[str, str]:
    contract_data: dict[str, Any] = dict(contract.contract_data or {})
    comparative_data: dict[str, Any] = dict(contract.comparative_data or {})
    comparative_header = dict(comparative_data.get("header") or {})
    manager = dict(contract_data.get("manager") or {})
    legal = dict(contract_data.get("legal") or {})
    schedule = dict(contract_data.get("schedule") or {})
    economic = dict(contract_data.get("economic") or {})
    project = dict(contract_data.get("project") or {})
    service = dict(contract_data.get("service") or {})
    logistics = dict(contract_data.get("logistics") or {})
    additional = dict(contract_data.get("additional") or {})
    resources = dict(contract_data.get("resources") or {})
    day, month, year = _today_parts()

    # Prioridad: columnas dedicadas (contract.work_start_date, work_end_date,
    # duration_text) sobre JSONB legacy.
    column_start = getattr(contract, "work_start_date", None)
    column_end = getattr(contract, "work_end_date", None)
    start_date = str(column_start) if column_start else str(schedule.get("start_date") or "")
    end_date = str(column_end) if column_end else str(schedule.get("end_date") or "")
    duration_fallback = str(
        getattr(contract, "duration_text", None)
        or project.get("duracion_obra")
        or schedule.get("duration")
        or ""
    )
    computed_duration = _human_duration_between(start_date, end_date)
    if computed_duration and not getattr(contract, "duration_text", None):
        duration_fallback = computed_duration

    raw_price = (
        economic.get("total_execution_price")
        or economic.get("price_numeric")
        or additional.get("precio_raw")
        or contract.total_amount
    )
    formatted_price = _format_amount(raw_price)
    auto_price_text = _price_to_words_upper(raw_price)

    raw_workers = resources.get("workers_count") or additional.get("numero_de_trabajadores")
    workers_text = (
        str(resources.get("workers_count_text") or additional.get("num_trab_let") or "").strip()
        or _number_to_words_upper(raw_workers)
    )

    insurance_amount = _compute_rc_insurance_amount(raw_price)
    insurance_text = (
        str(additional.get("seguro_responsabilidad_civil_text") or "").strip()
        or _price_to_words_upper(insurance_amount if insurance_amount != "N/A" else None)
    )
    # En SUBCONTRATACION el seguro RC no debe rellenar GARANTIA por defecto.
    retention_value = str(economic.get("retention") or "").strip().upper()
    if retention_value == "NO":
        retention_guarantee_default = (
            "El CONTRATISTA retendrá el 0% de cada factura que expida el SUBCONTRATISTA, "
            "por tanto, la certificación y/o factura mensual debe llevar reflejada la "
            "retención por garantía."
        )
    elif retention_value == "SI":
        retention_guarantee_default = (
            "El CONTRATISTA practicará una retención del cinco por ciento (5 %) sobre el "
            "importe de cada certificación o factura emitida por el SUBCONTRATISTA, en "
            "concepto de garantía de la correcta ejecución de los trabajos. En "
            "consecuencia, cada certificación y/o factura mensual deberá reflejar "
            "expresamente dicha retención.\n\n"
            "Las cantidades retenidas se mantendrán durante la ejecución de la obra. A la "
            "emisión de la última certificación, el SUBCONTRATISTA deberá aportar un aval "
            "bancario por importe equivalente al cinco por ciento (5 %) del importe final "
            "certificado, con una vigencia mínima de doce (12) meses, que permitirá la "
            "liberación y canje de las retenciones practicadas durante la obra."
        )
    else:
        retention_guarantee_default = ""
    retention_guarantee_value = (
        str(getattr(contract, "warranty_text", None) or "").strip()
        or retention_guarantee_default
    )
    guarantee_value = retention_guarantee_value

    project_name_value = (
        str(
            project.get("nombre_obra")
            or project.get("nom_obra")
            or project.get("obra")
            or comparative_header.get("obra_nombre")
            or comparative_header.get("nombre_obra")
            or comparative_header.get("obra")
            or comparative_data.get("obra")
            or comparative_data.get("nombre_obra")
            or contract.title
            or ""
        ).strip()
    )
    project_number_value = (
        str(
            getattr(contract, "project_number", None)
            or project.get("num_obra")
            or project.get("obra_num")
            or project.get("expediente")
            or comparative_header.get("obra_num")
            or comparative_header.get("num_obra")
            or comparative_header.get("expediente")
            or comparative_data.get("num_obra")
            or comparative_data.get("expediente")
            or contract.project_id
            or contract.id
            or ""
        ).strip()
    )
    promoter_value = str(
        getattr(contract, "promoter", None)
        or project.get("promotora")
        or project.get("promotor")
        or additional.get("promotora")
        or additional.get("promotor")
        or comparative_header.get("promotora")
        or comparative_header.get("promotor")
        or ""
    ).strip() or "CONSTRUCCIONES URDECON, S.A."
    # Hitos: priorizamos la lista estructurada `milestones_items` (si trae
    # items con nombre/fechas la serializamos), si no, el string plano. NO
    # usamos la duración como fallback: cuando el form no rellena hitos, el
    # token debe quedar vacío (mostrar duración duplica info y produce
    # "X dias dias" si la duración ya incluye "días").
    milestones_value = ""
    items = additional.get("milestones_items")
    if isinstance(items, list):
        lines: list[str] = []
        for raw in items:
            if not isinstance(raw, dict):
                continue
            name = str(raw.get("name") or raw.get("nombre") or "").strip()
            start = str(raw.get("start") or raw.get("inicio") or "").strip()
            end = str(raw.get("end") or raw.get("fin") or raw.get("finalizacion") or "").strip()
            desc = str(
                raw.get("description") or raw.get("descripcion") or raw.get("observaciones") or ""
            ).strip()
            parts: list[str] = []
            if name:
                parts.append(f"{name}:")
            if start:
                parts.append(f"inicio: {start}")
            if end:
                parts.append(f"finalizacion: {end}")
            if desc:
                parts.append(f"observaciones: {desc}")
            if parts:
                lines.append(" — ".join(parts) if len(parts) > 1 else parts[0])
        if lines:
            milestones_value = "\n".join(lines)
    if not milestones_value:
        milestones_value = str(
            getattr(contract, "milestones_text", None)
            or additional.get("milestones")
            or additional.get("hitos")
            or additional.get("ttt")
            or ""
        ).strip()

    supplier_address_value = str(
        contract.supplier_address
        or manager.get("direccion_empresa")
        or manager.get("direccion")
        or additional.get("direccion_empresa")
        or ""
    ).strip()
    if not supplier_address_value:
        supplier_address_value = _compose_company_address(contract)

    manager_name_value = str(
        getattr(contract, "supplier_legal_rep_name", None)
        or manager.get("nombre_gerente")
        or manager.get("manager_name")
        or manager.get("representante")
        or manager.get("legal_representative")
        or manager.get("contact_name")
        or contract.supplier_contact_name
        or ""
    ).strip()
    if not manager_name_value:
        manager_name_value = str(contract.supplier_name or "").strip()

    responsible_value = str(
        manager.get("responsable")
        or manager.get("representante")
        or additional.get("responsable")
        or manager_name_value
    ).strip()

    manager_nif_value = str(
        getattr(contract, "supplier_legal_rep_dni", None)
        or manager.get("nif_gerente")
        or manager.get("dni_gerente")
        or manager.get("manager_nif")
        or manager.get("legal_rep_dni")
        or legal.get("nif_representante")
        or legal.get("dni_representante")
        or additional.get("nif_gerente")
        or additional.get("dni_gerente")
        or ""
    ).strip()
    # NO usar contract.supplier_tax_id como fallback: el NIF del gerente y el
    # CIF de la empresa son datos distintos; mejor dejarlo vacío que pintar el
    # CIF donde corresponde un NIF/DNI personal.

    # Forma de pago: priorizar `payment_method_agreed` (lo que rellena el form
    # del comparativo, ej. "Confirming 60 días"). `payment_method` suele venir
    # vacío en el flujo nuevo. Se mantiene compatibilidad con nombres legados.
    # Prioridad: contract.payment_method (columna dedicada del form
    # SUMINISTRO). Si el método es OTROS y hay payment_method_other_text, se
    # usa el texto libre como FORMA_PAGO en la plantilla.
    column_method = str(getattr(contract, "payment_method", None) or "").strip()
    column_other = str(getattr(contract, "payment_method_other_text", None) or "").strip()
    if column_method.upper() == "OTROS" and column_other:
        payment_method_value = column_other
    elif column_method:
        payment_method_value = column_method
    else:
        payment_method_value = str(
            economic.get("payment_method_agreed")
            or additional.get("forma_pago_pactada")
            or economic.get("payment_method")
            or economic.get("forma_pago")
            or additional.get("payment_method")
            or additional.get("forma_pago")
            or ""
        ).strip()
    payment_days_column = getattr(contract, "payment_days", None)
    payment_days_text = (
        f"{int(payment_days_column)} días"
        if payment_days_column is not None
        else ""
    )

    # Portes / descargas: el form del contrato los guarda en
    # contract_data.additional.freight_party / unloading_party. Mantenemos
    # nombres legados como fallback.
    shipping_value = str(
        getattr(contract, "freight_responsible", None)
        or additional.get("freight_party")
        or logistics.get("shipping_type")
        or logistics.get("shipping_responsibility")
        or logistics.get("portes")
        or additional.get("shipping_type")
        or additional.get("portes")
        or ""
    ).strip()
    unloading_value = str(
        getattr(contract, "unloading_responsible", None)
        or additional.get("unloading_party")
        or logistics.get("unloading_type")
        or logistics.get("unloading_responsibility")
        or logistics.get("descargas")
        or additional.get("unloading_type")
        or additional.get("descargas")
        or ""
    ).strip()

    supplier_name_value = _clean_supplier_name(
        contract.supplier_name,
        fallback=str(contract.supplier_contact_name or "").strip() or "PROVEEDOR",
    )

    return {
        "day": day,
        "dia": day,
        "month": month,
        "mes": month,
        "year": year,
        "anyo": year,
        "ano": year,
        "contract_id": str(contract.id or ""),
        "titulo": str(contract.title or ""),
        "razon_social": supplier_name_value,
        "empresa": supplier_name_value,
        "cif": str(contract.supplier_tax_id or ""),
        "cif_empresa": str(contract.supplier_tax_id or ""),
        "email": str(contract.supplier_email or ""),
        "telefono": str(contract.supplier_phone or ""),
        "direccion_empresa": supplier_address_value,
        "ciudad": str(contract.supplier_city or ""),
        "cp": str(contract.supplier_postal_code or ""),
        "pais": str(contract.supplier_country or ""),
        "nombre_gerente": manager_name_value,
        "nif_gerente": manager_nif_value,
        "dni_gerente": manager_nif_value,
        "responsable": responsible_value,
        "importe_total": _format_amount(contract.total_amount),
        "moneda": str(contract.currency or ""),
        "forma_pago": payment_method_value,
        "termino_pago": payment_days_text,
        "fecha_inicio": start_date,
        "fecha_fin": end_date,
        "project_name": project_name_value,
        "nombre_obra": project_name_value,
        "nom_obra": project_name_value,
        "project_number": project_number_value,
        "num_obra": project_number_value,
        "promoter": promoter_value,
        "promotora": promoter_value,
        "service_category": str(service.get("category") or ""),
        "categoria_servicio": str(service.get("category") or ""),
        "retencion_garantia": retention_guarantee_value,
        "shipping_responsibility": shipping_value,
        "portes": shipping_value,
        "unloading_responsibility": unloading_value,
        "descargas": unloading_value,
        "duration": duration_fallback,
        "duracion": duration_fallback,
        "duracion_obra": duration_fallback,
        "duracion_contrato": duration_fallback,
        "plazo_contrato": duration_fallback,
        "milestones": milestones_value,
        "hitos": milestones_value,
        "ttt": milestones_value,
        "plazo_entrega": duration_fallback,
        "plazo": duration_fallback,
        "price_numeric": formatted_price,
        "precio_num": formatted_price,
        "price_text": str(economic.get("price_text") or auto_price_text),
        "precio_let": str(economic.get("price_text") or auto_price_text),
        "guarantee": guarantee_value,
        "garantia": guarantee_value,
        "seguro_rc": insurance_amount,
        "seguro_rc_num": insurance_amount,
        "seguro_responsabilidad_civil": insurance_amount,
        "seguro_responsabilidad_civil_num": insurance_amount,
        "seguro_responsabilidad_civil_let": insurance_text,
        "min_workers_number": str(raw_workers or ""),
        "num_trab": str(raw_workers or ""),
        "min_workers_text": workers_text,
        "num_trab_let": workers_text,
        "deed_type": str(legal.get("tipo_escritura") or ""),
        "tipo_escritura": str(legal.get("tipo_escritura") or ""),
        "deed_date": str(legal.get("fecha_escritura") or ""),
        "fecha_escritura": str(legal.get("fecha_escritura") or ""),
        "notary_name": str(legal.get("nombre_notario") or ""),
        "nombre_notario": str(legal.get("nombre_notario") or ""),
        "protocol_number": str(legal.get("num_protocolo") or ""),
        "num_protocolo": str(legal.get("num_protocolo") or ""),
    }

def _docx_context(contract: Contract) -> dict[str, Any]:
    m = _contract_field_map(contract)
    day, month, year = _today_parts()
    return {
        "contract": {
            "day": day,
            "month": month,
            "year": year,
            "company_name": m.get("razon_social") or "",
            "company_cif": m.get("cif") or "",
            "company_address": _compose_company_address(contract),
            "manager_name": m.get("nombre_gerente") or "",
            "manager_nif": m.get("nif_gerente") or "",
            "project_name": m.get("project_name") or "",
            "project_number": m.get("project_number") or "",
            "promoter": m.get("promoter") or "",
            "start_date": m.get("fecha_inicio") or "",
            "end_date": m.get("fecha_fin") or "",
            "duration": m.get("duration") or "",
            "payment_method": m.get("forma_pago") or "",
            "service_category": m.get("service_category") or "",
            "shipping_responsibility": m.get("shipping_responsibility") or "",
            "unloading_responsibility": m.get("unloading_responsibility") or "",
            "milestones": m.get("milestones") or "",
            "price_numeric": m.get("price_numeric") or "",
            "price_text": m.get("price_text") or "",
            "guarantee": m.get("guarantee") or "",
            "rc_insurance_amount": m.get("seguro_responsabilidad_civil") or "",
            "rc_insurance_text": m.get("seguro_responsabilidad_civil_let") or "",
            "min_workers_number": m.get("min_workers_number") or "",
            "min_workers_text": m.get("min_workers_text") or "",
            "deed_type": m.get("deed_type") or "",
            "deed_date": m.get("deed_date") or "",
            "notary_name": m.get("notary_name") or "",
            "protocol_number": m.get("protocol_number") or "",
        }
    }

def _context_lines(contract: Contract) -> list[str]:
    m = _contract_field_map(contract)
    lines = [
        f"Contrato CT-{m['contract_id']}",
        f"Tipo: {contract.type.value if hasattr(contract.type, 'value') else contract.type}",
        f"Generado: {datetime.now(timezone.utc).isoformat()}",
        "",
        "DATOS PROVEEDOR",
        f"Razon social / Empresa: {m['razon_social'] or '-'}",
        f"CIF: {m['cif'] or '-'}",
        f"Email: {m['email'] or '-'}",
        f"Telefono: {m['telefono'] or '-'}",
        f"Direccion empresa: {m['direccion_empresa'] or '-'}",
        f"Ciudad: {m['ciudad'] or '-'}",
        f"CP: {m['cp'] or '-'}",
        f"Pais: {m['pais'] or '-'}",
        f"Nombre gerente / contacto: {m['nombre_gerente'] or '-'}",
        f"NIF gerente: {m['nif_gerente'] or '-'}",
        "",
        "DATOS CONTRATO",
        f"Titulo: {m['titulo'] or '-'}",
        f"Importe total: {m['importe_total']} {m['moneda']}",
        f"Precio en letra: {m['precio_let'] or '-'}",
        f"Seguro RC: {m['seguro_responsabilidad_civil'] or '-'}",
        f"Forma pago: {m['forma_pago'] or '-'}",
        f"Fecha inicio: {m['fecha_inicio'] or '-'}",
        f"Fecha fin: {m['fecha_fin'] or '-'}",
        f"Duracion contrato: {m['duracion_contrato'] or '-'}",
    ]

    contract_type = contract.type.value if hasattr(contract.type, "value") else str(contract.type)
    if contract_type == ContractType.SUBCONTRATACION.value:
        lines.extend(
            [
                "",
                "DATOS LEGALES SUBCONTRATACION",
                f"Tipo escritura: {m['deed_type'] or '-'}",
                f"Fecha escritura: {m['deed_date'] or '-'}",
                f"Nombre notario: {m['notary_name'] or '-'}",
                f"Numero protocolo: {m['protocol_number'] or '-'}",
            ]
        )
    return lines

def _build_comparative_table_rows(contract: Contract) -> tuple[list[str], list[list[str]]]:
    data = dict(contract.comparative_data or {})
    offers = list(data.get("offers") or [])
    lines = list(data.get("lines") or [])

    provider_names: list[str] = []
    for offer in offers:
        if not isinstance(offer, dict):
            continue
        name = str(offer.get("supplier_name") or offer.get("offer_name") or "").strip()
        if name and name not in provider_names:
            provider_names.append(name)

    if not provider_names:
        for line in lines:
            if not isinstance(line, dict):
                continue
            for price in list(line.get("prices") or []):
                if not isinstance(price, dict):
                    continue
                name = str(price.get("proveedor") or "").strip()
                if name and name not in provider_names:
                    provider_names.append(name)

    headers = ["Medicion", "Ud", "Descripcion"] + provider_names
    rows: list[list[str]] = []
    for line in lines:
        if not isinstance(line, dict):
            continue
        row = [
            str(line.get("cantidad") or "-"),
            str(line.get("unidad") or "-"),
            str(line.get("descripcion") or "-")[:120],
        ]
        prices = list(line.get("prices") or [])
        price_by_provider: dict[str, str] = {}
        for price in prices:
            if not isinstance(price, dict):
                continue
            provider = str(price.get("proveedor") or "").strip()
            if not provider:
                continue
            amount = price.get("importe")
            price_by_provider[provider] = _format_amount(amount)

        for provider in provider_names:
            row.append(price_by_provider.get(provider, "-"))
        rows.append(row)

    if not rows and offers:
        for offer in offers:
            if not isinstance(offer, dict):
                continue
            row = ["-", "-", str(offer.get("offer_name") or offer.get("supplier_name") or "Oferta")]
            for provider in provider_names:
                current_name = str(offer.get("supplier_name") or offer.get("offer_name") or "").strip()
                row.append(_format_amount(offer.get("total_amount")) if current_name == provider else "-")
            rows.append(row)

    return headers, rows

def generate_comparative(contract: Contract) -> Path:
    path = build_contract_document_path(
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        doc_type=ContractDocumentType.COMPARATIVE,
        filename="comparative.pdf",
    )

    headers, rows = _build_comparative_table_rows(contract)

    _render_comparative_pdf(path, contract.id, headers, rows)
    return path

def _generate_contract_template_block(template_path, path, field_map, contract):
    """
    Sustituye el bloque de relleno de plantilla en generate_contract().
    Usa nombres de archivo temporales con timestamp para evitar reutilizar
    PDFs ya procesados de ejecuciones anteriores.
    """
    from datetime import datetime

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")

    exact_path = path.with_name(f"_tmp_exact_{ts}.pdf")
    try:
        if _fill_pdf_placeholders_exact(template_path, exact_path, field_map):
            write_bytes_from_path(path, exact_path)
            if template_path.name.upper() in {"SUMINISTRO.PDF", "SUMINISTROS.PDF"}:
                _patch_suministro_signature_page(path, field_map)
            return path
    finally:
        safe_unlink(exact_path)

    anchor_path = path.with_name(f"_tmp_anchor_{ts}.pdf")
    try:
        if _fill_template_by_anchors(template_path, anchor_path, field_map, contract):
            write_bytes_from_path(path, anchor_path)
            if template_path.name.upper() in {"SUMINISTRO.PDF", "SUMINISTROS.PDF"}:
                _patch_suministro_signature_page(path, field_map)
            return path
    finally:
        safe_unlink(anchor_path)

    return None  # ningun metodo funciono -> caller usa fallback

def _bracket_tokens_for_contract(contract: Contract) -> dict[str, str]:
    """Construye el dict de tokens MAYÚSCULA → valor para las plantillas docx
    que usan sintaxis plana `[TOKEN]` (ej. CONTRATO_SUMINISTRO_template.docx).

    Reutiliza _contract_field_map para no duplicar lógica de extracción de
    datos (proveedor, gerente, obra, fechas, etc.).
    """
    m = _contract_field_map(contract)

    def _s(v: Any) -> str:
        return str(v).strip() if v not in (None, "") else ""

    # FORMA_PAGO ya viene resuelto en _contract_field_map: contract.payment_method
    # (con override a payment_method_other_text cuando es OTROS). TERMINO_PAGO se
    # deriva de contract.payment_days como "{N} días". Fallback: parseo legacy
    # cuando viene combinado en el JSONB.
    forma_pago_metodo = _s(m.get("forma_pago"))
    termino_pago = _s(m.get("termino_pago"))
    if not termino_pago:
        dias_match = re.search(r"(\d{1,3})\s*d[íi]as?", forma_pago_metodo, flags=re.IGNORECASE)
        if not dias_match:
            dias_match = re.search(r"\b(\d{1,3})\b", forma_pago_metodo)
        if dias_match:
            termino_pago = f"{dias_match.group(1)} días"
            before = forma_pago_metodo[: dias_match.start()]
            after = forma_pago_metodo[dias_match.end() :]
            forma_pago_metodo = re.sub(r"d[íi]as?", "", before + after, flags=re.IGNORECASE).strip(" :-,.;")

    # Líneas/partidas del comparativo (proveedor ganador) y total. Solo se
    # consumen por la plantilla HTML — Word ignora valores no-string.
    try:
        from app.domains.procurement.contracts.document_generator import (
            _build_suministro_lines,
            _format_date_es,
        )
        lineas, total_lineas = _build_suministro_lines(contract)
    except Exception:
        lineas, total_lineas = [], ""
        try:
            from app.domains.procurement.contracts.document_generator import _format_date_es
        except Exception:  # pragma: no cover
            def _format_date_es(value):  # type: ignore
                return str(value or "")

    # Datos de escritura del proveedor: el JSONB legal a menudo no trae
    # `num_protocolo` ni `fecha_escritura` en formato es-ES. Caemos al lookup
    # canónico en `proveedores` por CIF — misma cadena que usa la ruta
    # `document_generator._build_substitution_context`.
    provider_notary_protocol = ""
    provider_deed_date_raw = None
    if contract.supplier_tax_id:
        try:
            from sqlmodel import Session
            from app.db.session import engine
            from app.domains.invoices.ocr.repo import _get_provider_by_tax_id

            with Session(engine) as _lookup_session:
                provider = _get_provider_by_tax_id(
                    _lookup_session,
                    tax_id=contract.supplier_tax_id,
                )
            if provider:
                provider_notary_protocol = _s(provider.get("numero_protocolo"))
                provider_deed_date_raw = provider.get("fecha_escritura")
        except Exception:
            pass

    fecha_escritura_str = _format_date_es(
        m.get("fecha_escritura") or m.get("deed_date") or provider_deed_date_raw
    )
    numero_protocolo_str = _s(
        m.get("num_protocolo")
        or m.get("protocol_number")
        or provider_notary_protocol
    )

    fecha_inicio_str = _format_date_es(m.get("fecha_inicio"))
    fecha_fin_str = _format_date_es(m.get("fecha_fin"))
    return {
        "RAZON_SOCIAL": _s(m.get("razon_social")),
        "CIF": _s(m.get("cif")),
        "DIRECCION_EMPRESA": _s(m.get("direccion_empresa")),
        "NOMBRE_GERENTE": _s(m.get("nombre_gerente")),
        "NIF_GERENTE": _s(m.get("nif_gerente")),
        "RESPONSABLE": _s(m.get("responsable")),
        "REPRESENTANTE": _s(m.get("responsable") or m.get("representante")),
        "NOMBRE_OBRA": _s(m.get("project_name") or m.get("nombre_obra")),
        "NUM_OBRA": _s(m.get("project_number") or m.get("num_obra")),
        "NUMERO_OBRA": _s(m.get("project_number") or m.get("num_obra")),
        "PROMOTORA": _s(m.get("promoter") or m.get("promotora")),
        "DURACION_OBRA": _s(m.get("duration") or m.get("duracion_obra")),
        "HITOS": _s(m.get("milestones") or m.get("hitos")),
        "FORMA_PAGO": forma_pago_metodo,
        "TERMINO_PAGO": termino_pago,
        "PORTES": _s(m.get("portes") or m.get("shipping_responsibility")),
        "DESCARGAS": _s(m.get("descargas") or m.get("unloading_responsibility")),
        "FECHA_INICIO": fecha_inicio_str,
        "FECHA_FIN": fecha_fin_str,
        "FIN_OBRA": fecha_fin_str,
        "DIA": _s(m.get("dia") or m.get("day")),
        "MES": _s(m.get("mes") or m.get("month")),
        "ANIO": _s(m.get("anyo") or m.get("year") or m.get("ano")),
        # ── Tokens SUBCONTRATACIÓN ──────────────────────────────────────────
        "TIPO_ESCRITURA": _s(m.get("tipo_escritura") or m.get("deed_type")),
        "FECHA_ESCRITURA": fecha_escritura_str,
        "NOMBRE_NOTARIO": _s(m.get("nombre_notario") or m.get("notary_name")),
        "NUMERO_PROTOCOLO": numero_protocolo_str,
        "PRECIO_NUMERO": _s(m.get("price_numeric") or m.get("precio_num") or m.get("importe_total")),
        "PRECIO_LETRA": _s(m.get("price_text") or m.get("precio_let")),
        "NUM_TRAB": _s(m.get("num_trab") or m.get("min_workers_number")),
        "NUM_TRAB_LETRA": _s(m.get("num_trab_let") or m.get("min_workers_text")),
        "GARANTIA": _s(m.get("garantia") or m.get("guarantee")),
        "RETENCION_GARANTIA": _s(m.get("retencion_garantia")),
        "SEGURO": _s(m.get("seguro_responsabilidad_civil") or m.get("seguro_rc")),
        "TIPO_SERVICIO": _s(m.get("service_category") or m.get("categoria_servicio")),
        # Líneas del comparativo (consumidas solo por plantillas HTML/Jinja).
        "LINEAS": lineas,
        "TOTAL_LINEAS": total_lineas,
        # Legados — no rompen si la plantilla no los usa.
        "NOMBRE_PROVEEDOR": _s(m.get("razon_social")),
        "CIF_NIF": _s(m.get("cif")),
        "DIRECCION": _s(m.get("direccion_empresa")),
        "IMPORTE_TOTAL": _s(m.get("importe_total")),
    }


def generate_contract(contract: Contract) -> Path | None:
    if not supplier_data_complete(contract):
        return None

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    path = build_contract_document_path(
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        doc_type=ContractDocumentType.CONTRACT,
        filename=f"contract_{timestamp}.pdf",
    )

    # Prefer HTML+CSS render (Jinja2 + WeasyPrint) for contract types with an
    # HTML template registered. Avoids DOCX→LibreOffice reflow issues (broken
    # signature placement, layout drift). Falls back to the legacy DOCX/PDF
    # pipeline below for types not yet migrated.
    try:
        from app.domains.procurement.contracts.html_renderer import (
            HtmlRendererError,
            has_html_template_for,
            render_contract_html_to_pdf,
        )

        if has_html_template_for(contract.type):
            html_context = _bracket_tokens_for_contract(contract)
            ensure_parent_dir(path)
            render_contract_html_to_pdf(
                contract_type=contract.type,
                context=html_context,
                output_path=path,
            )
            return path
    except HtmlRendererError as exc:
        logger.error(
            "HTML renderer failed for contract_id=%s, falling back to DOCX: %s",
            contract.id,
            exc,
        )
        # Intentional fall-through to DOCX path so a failure here does not
        # block contract generation; the legacy pipeline still works.

    context = _docx_context(contract)
    bracket_tokens = _bracket_tokens_for_contract(contract)
    docx_template_path = _docx_template_path_for(contract)
    if docx_template_path:
        rendered_docx = path.with_name("contract_rendered.docx")
        rendered = _render_docx_template(
            docx_template_path,
            rendered_docx,
            context,
            bracket_tokens=bracket_tokens,
        )
        if rendered and _convert_docx_to_pdf(rendered_docx, path):
            return path

    field_map = _contract_field_map(contract)
    template_path = _template_path_for(contract)
    if template_path:
        filled_path = _generate_contract_template_block(template_path, path, field_map, contract)
        if filled_path:
            return filled_path

        # Si no fue posible rellenar automaticamente, mantener plantilla intacta.
        write_bytes_from_path(path, template_path)
        if template_path.name.upper() in {"SUMINISTRO.PDF", "SUMINISTROS.PDF"}:
            _patch_suministro_signature_page(path, field_map)
        return path

    summary_path = path.with_name("contract_data_summary.pdf")
    _render_summary_pdf(summary_path, _context_lines(contract), "Resumen de datos para contrato")

    write_bytes_from_path(path, summary_path)

    return path
