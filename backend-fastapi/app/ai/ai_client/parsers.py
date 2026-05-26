import re
from typing import Any, Dict, Optional

from app.ai.errors import AIInvalidResponseError
from app.ai.ai_client.parsers_helpers import (  # noqa: F401
    _as_str_or_none,
    _find_supplier_name_by_tax_id,
    _find_supplier_name_in_header,
    _looks_like_bad_supplier_name,
    _looks_like_customer,
    _normalize_amount,
    _normalize_currency,
    _normalize_date,
    _normalize_tax_id,
    _regex_due_date,
    _regex_invoice_number,
    _regex_total_amount,
    _trim_comparative_text,
    _trim_invoice_text,
)


def extract_json_block(text: str) -> str:
    """Extract JSON from LLM response, handling markdown code blocks."""
    # Intenta encontrar bloques markdown primero
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if json_match:
        return json_match.group(1)

    # Fallback: buscar primer objeto JSON válido
    start = text.find("{")
    if start == -1:
        raise AIInvalidResponseError("No se encontró JSON en la respuesta")

    depth = 0
    in_string = False
    escape_next = False

    for i in range(start, len(text)):
        char = text[i]

        # Manejar strings para evitar contar llaves dentro de strings
        if char == '"' and not escape_next:
            in_string = not in_string
        elif char == "\\" and in_string:
            escape_next = True
            continue

        if not in_string:
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]

        escape_next = False

    raise AIInvalidResponseError("JSON incompleto en la respuesta")


def normalize_invoice_json(raw: Dict[str, Any], fallback_text: str = "") -> Dict[str, Any]:
    """Normalize raw LLM JSON output to standard format."""
    if not isinstance(raw, dict):
        raw = {}

    def pick(*keys: str):
        """Pick first available key (case-insensitive)."""
        for key in keys:
            if key in raw:
                return raw[key]
            for rk in raw:
                if rk.lower() == key.lower():
                    return raw[rk]
        return None

    # Extraer campos
    supplier_name = pick("supplier_name", "supplier", "vendor", "proveedor", "emisor")
    supplier_tax_id = pick("supplier_tax_id", "vat", "nif", "cif", "tax_id")
    invoice_number = pick("invoice_number", "num_factura", "number", "numero")
    issue_date_val = pick("issue_date", "fecha_emision", "date", "fecha")
    due_date_val = pick("due_date", "fecha_vencimiento", "vencimiento")
    total_amount_val = pick("total_amount", "total", "importe", "amount")
    currency = pick("currency", "moneda")
    concept = pick("concept", "concepto", "description", "descripcion")

    # Fallbacks con regex
    if not invoice_number:
        invoice_number = _regex_invoice_number(fallback_text)
    if not due_date_val:
        due_date_val = _regex_due_date(fallback_text)
    if total_amount_val in (None, ""):
        total_amount_val = _regex_total_amount(fallback_text)

    # Normalizar tax_id y nombre
    supplier_tax_id_norm = _normalize_tax_id(_as_str_or_none(supplier_tax_id))
    supplier_name_norm = _as_str_or_none(supplier_name)
    invoice_number_str = _as_str_or_none(invoice_number)

    # Intentar mejorar supplier_name si es necesario
    if supplier_tax_id_norm and (
        supplier_name_norm is None
        or _looks_like_customer(supplier_name_norm)
        or _looks_like_bad_supplier_name(supplier_name_norm, invoice_number_str)
    ):
        guessed = _find_supplier_name_by_tax_id(fallback_text, supplier_tax_id_norm)
        if guessed and not _looks_like_bad_supplier_name(guessed, invoice_number_str):
            supplier_name_norm = guessed
        else:
            header_guess = _find_supplier_name_in_header(fallback_text)
            supplier_name_norm = (
                header_guess
                if header_guess and not _looks_like_bad_supplier_name(header_guess, invoice_number_str)
                else supplier_name_norm  # Mantener el original si no hay mejor opción
            )

    result = {
        "supplier_name": supplier_name_norm,
        "supplier_tax_id": supplier_tax_id_norm,
        "invoice_number": invoice_number_str,
        "issue_date": _normalize_date(issue_date_val),
        "due_date": _normalize_date(due_date_val),
        "total_amount": _normalize_amount(total_amount_val),
        "currency": _normalize_currency(currency, fallback_text),
        "concept": _as_str_or_none(concept),
    }

    return result


def normalize_comparative_json(raw: Dict[str, Any], fallback_text: str = "") -> Dict[str, Any]:
    if not isinstance(raw, dict):
        raw = {}

    header = raw.get("header") if isinstance(raw.get("header"), dict) else {}
    providers = raw.get("providers") if isinstance(raw.get("providers"), list) else []
    lines = raw.get("lines") if isinstance(raw.get("lines"), list) else []
    precios_minimos = raw.get("precios_minimos") if isinstance(raw.get("precios_minimos"), list) else []
    totales = raw.get("totales") if isinstance(raw.get("totales"), dict) else {}
    firmas = raw.get("firmas") if isinstance(raw.get("firmas"), dict) else {}
    resumen = raw.get("resumen") if isinstance(raw.get("resumen"), dict) else {}

    def as_str(value: Any) -> Optional[str]:
        return _as_str_or_none(value)

    def as_date(value: Any) -> Optional[str]:
        return _normalize_date(value)

    def as_amount(value: Any) -> Optional[float]:
        return _normalize_amount(value)

    normalized = {
        "header": {
            "obra_num": as_str(header.get("obra_num")),
            "obra_nombre": as_str(header.get("obra_nombre")),
            "descripcion": as_str(header.get("descripcion")),
            "jefe_obra": as_str(header.get("jefe_obra")),
            "telefono_jo": as_str(header.get("telefono_jo")),
            "planificacion_num": as_str(header.get("planificacion_num")),
            "fecha_solicitud": as_date(header.get("fecha_solicitud")),
            "fecha_aprobacion": as_date(header.get("fecha_aprobacion")),
        },
        "providers": [],
        "lines": [],
        "precios_minimos": [],
        "costes_directos_total": as_amount(raw.get("costes_directos_total")),
        "precio_venta_total": as_amount(raw.get("precio_venta_total")),
        # `totales` solo lleva las claves con valor real. No materializamos
        # claves a None para que downstream (sync v2, helpers de merge,
        # consumidores del JSON) puedan distinguir "no hay dato" (clave
        # ausente) de "valor explicito null". Si el origen aporta un valor,
        # la clave aparece; si no, se omite.
        "totales": {
            k: v
            for k, v in {
                "total_ofertado_proveedor": as_amount(totales.get("total_ofertado_proveedor")),
                "total_ofertas_homogeneas": as_amount(totales.get("total_ofertas_homogeneas")),
                "porcentaje_oferta_homogenea_precio_neto": as_amount(
                    totales.get("porcentaje_oferta_homogenea_precio_neto")
                ),
                "forma_pago": as_str(totales.get("forma_pago")),
                "observaciones_oferta": as_str(totales.get("observaciones_oferta")),
                "garantias": as_str(totales.get("garantias")),
                "retenciones": as_str(totales.get("retenciones")),
                "plazos": as_str(totales.get("plazos")),
                "hitos": as_str(totales.get("hitos")),
            }.items()
            if v is not None
        },
        "firmas": {
            "firmante_jo": as_str(firmas.get("firmante_jo")),
            "cargo_jo": as_str(firmas.get("cargo_jo")),
            "firmante_gerente": as_str(firmas.get("firmante_gerente")),
            "proveedor_propuesto_aceptado": as_str(firmas.get("proveedor_propuesto_aceptado")),
            "fecha_firma": as_date(firmas.get("fecha_firma")),
        },
        "resumen": {
            "presupuesto_liquido_obra": as_amount(resumen.get("presupuesto_liquido_obra")),
            "total_gestionado_en_compras": as_amount(resumen.get("total_gestionado_en_compras")),
            "relevancia_compra": as_amount(resumen.get("relevancia_compra")),
        },
    }

    for item in providers:
        if isinstance(item, str):
            normalized["providers"].append({"name": as_str(item), "offer_num": None})
            continue
        if not isinstance(item, dict):
            continue
        normalized["providers"].append(
            {
                "name": as_str(item.get("name") or item.get("provider") or item.get("proveedor")),
                "offer_num": as_str(item.get("offer_num") or item.get("oferta_num") or item.get("oferta_n")),
            }
        )

    for item in lines:
        if not isinstance(item, dict):
            continue
        prices_in = item.get("prices") if isinstance(item.get("prices"), list) else []
        prices_out = []
        for price in prices_in:
            if not isinstance(price, dict):
                continue
            prices_out.append(
                {
                    "proveedor": as_str(price.get("proveedor") or price.get("provider")),
                    "precio_unitario": as_amount(price.get("precio_unitario") or price.get("precio")),
                    "importe": as_amount(price.get("importe") or price.get("importe_total") or price.get("total")),
                }
            )
        if not prices_out:
            inline_price = as_amount(item.get("precio_unitario") or item.get("precio"))
            inline_amount = as_amount(item.get("importe") or item.get("importe_total") or item.get("total"))
            inline_provider = as_str(item.get("proveedor") or item.get("provider"))
            if inline_price is not None or inline_amount is not None:
                prices_out.append(
                    {
                        "proveedor": inline_provider,
                        "precio_unitario": inline_price,
                        "importe": inline_amount,
                    }
                )
        normalized["lines"].append(
            {
                "cod_capitulo": as_str(item.get("cod_capitulo") or item.get("cod") or item.get("codigo")),
                "cantidad": as_amount(item.get("cantidad") or item.get("medicion") or item.get("med")),
                "unidad": as_str(item.get("unidad") or item.get("ud") or item.get("unit")),
                "descripcion": as_str(item.get("descripcion") or item.get("concepto") or item.get("partida")),
                "prices": prices_out,
            }
        )

    for item in precios_minimos:
        if not isinstance(item, dict):
            continue
        normalized["precios_minimos"].append(
            {
                "proveedor": as_str(item.get("proveedor")),
                "precio": as_amount(item.get("precio")),
            }
        )

    return normalized
