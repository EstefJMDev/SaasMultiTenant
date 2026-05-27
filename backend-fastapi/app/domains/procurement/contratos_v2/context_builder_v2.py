from __future__ import annotations

import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from fastapi import status
from num2words import num2words
from sqlmodel import Session

from app.core.errors import DomainError
from app.platform.contracts_core.comparativos_models import (
    Contrato,
    ContratoDatosProveedor,
    ContratoHito,
    ContratoOfertaAdjudicada,
    ContratoOfertaAdjudicadaPartida,
)

from . import repo


_MONTHS_ES = [
    "",
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
]

_APOCOPE_VEINTIUNO_RE = re.compile(r"\bveintiuno\b")
_APOCOPE_UNO_RE = re.compile(r"\buno\b")


def _str(value: Any) -> str:
    return str(value).strip() if value not in (None, "") else ""


def _pick(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
    return None


def _to_decimal(value: Any) -> Optional[Decimal]:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _format_date_es(value: Any) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    raw = str(value).strip()
    if not raw:
        return ""
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw[: len(fmt)], fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return raw


def _format_eur(value: Any) -> str:
    amount = _to_decimal(value)
    if amount is None:
        return ""
    s = f"{amount:,.2f}"
    s = s.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{s} €"


def _format_qty(value: Any) -> str:
    qty = _to_decimal(value)
    if qty is None:
        return ""
    if qty == int(qty):
        return str(int(qty))
    return f"{qty:.2f}".replace(".", ",")


def _format_decimal_plain(value: Any) -> str:
    amount = _to_decimal(value)
    if amount is None:
        return ""
    return f"{amount:.2f}"


def _followed_by_mil_or_millon(text: str, pos: int) -> bool:
    rest = text[pos:].lstrip()
    return rest.startswith("mil") or rest.startswith("millón") or rest.startswith("millones")


def _apocope_uno(text: str) -> str:
    text = _APOCOPE_VEINTIUNO_RE.sub(
        lambda m: "veintiún" if _followed_by_mil_or_millon(text, m.end()) else m.group(0),
        text,
    )
    text = _APOCOPE_UNO_RE.sub(
        lambda m: "un" if _followed_by_mil_or_millon(text, m.end()) else m.group(0),
        text,
    )
    if text.endswith(" uno"):
        return text[:-4] + " un"
    if text == "uno":
        return "un"
    if text.endswith(" veintiuno"):
        return text[:-10] + " veintiún"
    if text == "veintiuno":
        return "veintiún"
    return text


def _int_to_words_es(value: Any) -> str:
    if value in (None, ""):
        return ""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return ""
    try:
        return _apocope_uno(num2words(n, lang="es")).upper()
    except Exception:
        return ""


def _amount_to_words_eur(value: Any) -> str:
    amount = _to_decimal(value)
    if amount is None:
        return ""
    quantized = amount.quantize(Decimal("0.01"))
    sign = "MENOS " if quantized < 0 else ""
    quantized = abs(quantized)
    euros = int(quantized)
    cents = int((quantized - euros) * 100)
    try:
        euros_text = _apocope_uno(num2words(euros, lang="es")).upper()
        cents_text = _apocope_uno(num2words(cents, lang="es")).upper() if cents else ""
    except Exception:
        return ""
    euro_unit = "EURO" if euros == 1 else "EUROS"
    result = f"{sign}{euros_text} {euro_unit}"
    if cents:
        cent_unit = "CÉNTIMO" if cents == 1 else "CÉNTIMOS"
        result += f" CON {cents_text} {cent_unit}"
    return result


def _parse_forma_pago(raw: Any) -> tuple[str, str]:
    if raw is None:
        return "", ""
    text = str(raw).strip()
    if not text:
        return "", ""
    days_match = re.search(r"(\d{1,3})\s*d[íi]as?", text, flags=re.IGNORECASE)
    if not days_match:
        days_match = re.search(r"\b(\d{1,3})\b", text)
    days = days_match.group(1) if days_match else ""
    method_raw = text
    if days_match:
        method_raw = (text[: days_match.start()] + text[days_match.end():]).strip()
    method_raw = re.sub(r"d[íi]as?", "", method_raw, flags=re.IGNORECASE).strip(" :-,.")
    return method_raw, days


def _build_hitos_text(hitos: list[ContratoHito]) -> str:
    lines: list[str] = []
    for hito in hitos:
        parts: list[str] = []
        name = _str(hito.nombre_hito)
        if name:
            parts.append(f"{name}:")
        start = _format_date_es(hito.fecha_inicio)
        end = _format_date_es(hito.fecha_fin)
        desc = _str(hito.descripcion_hito)
        if start:
            parts.append(f"inicio: {start}")
        if end:
            parts.append(f"finalizacion: {end}")
        if desc:
            parts.append(f"observaciones: {desc}")
        if parts:
            lines.append(" — ".join(parts) if len(parts) > 1 else parts[0])
    return "\n".join(lines)


def _build_lineas(
    partidas: list[ContratoOfertaAdjudicadaPartida],
) -> tuple[list[dict[str, str]], str, Optional[Decimal]]:
    rows: list[dict[str, str]] = []
    total = Decimal("0")
    for partida in partidas:
        importe = _to_decimal(partida.importe)
        if importe is not None:
            total += importe
        rows.append(
            {
                "med": _format_qty(partida.cantidad),
                "uds": _str(partida.unidad),
                "descripcion": _str(partida.descripcion),
                "precio": _format_eur(partida.precio_unitario),
                "importe": _format_eur(partida.importe),
            }
        )
    if not rows:
        return [], "", None
    return rows, _format_eur(total), total


def _resolve_reference_date(contrato: Contrato) -> datetime:
    for value in (
        contrato.fecha_firma,
        contrato.fecha_aprobacion,
        contrato.fecha_creacion,
        contrato.fecha_actualizacion,
    ):
        if isinstance(value, datetime):
            return value
    return datetime.now(timezone.utc)


def build_substitution_context_v2(
    session: Session,
    *,
    tenant_id: int,
    contrato_id: int,
) -> dict[str, Any]:
    contrato = repo.obtener_contrato_por_id(
        session,
        tenant_id=tenant_id,
        contrato_id=contrato_id,
    )
    if contrato is None:
        raise DomainError(
            "Contrato v2 no encontrado para construir contexto.",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    datos_json = (
        dict(contrato.datos_contractuales_json)
        if isinstance(contrato.datos_contractuales_json, dict)
        else {}
    )
    datos_proveedor = repo.obtener_datos_proveedor_por_contrato(
        session,
        tenant_id=tenant_id,
        contrato_id=contrato_id,
    )
    hitos = repo.obtener_hitos_por_contrato(
        session,
        tenant_id=tenant_id,
        contrato_id=contrato_id,
    )
    oferta = repo.obtener_oferta_adjudicada_snapshot_por_contrato(
        session,
        tenant_id=tenant_id,
        contrato_id=contrato_id,
    )
    partidas = repo.obtener_partidas_adjudicadas_snapshot_por_contrato(
        session,
        tenant_id=tenant_id,
        contrato_id=contrato_id,
    )

    lineas, total_lineas, total_lineas_decimal = _build_lineas(partidas)

    raw_forma_pago = _pick(
        datos_json,
        "forma_pago",
        "payment_method",
        "condiciones_pago",
    ) or (oferta.forma_pago if oferta is not None else "")
    forma_pago, forma_pago_dias = _parse_forma_pago(raw_forma_pago)
    termino_pago = _str(_pick(datos_json, "terminos_pago", "termino_pago"))
    if not termino_pago and forma_pago_dias:
        termino_pago = f"{forma_pago_dias} días"

    fecha_inicio_raw = None
    fecha_fin_raw = None
    if hitos:
        starts = [h.fecha_inicio for h in hitos if h.fecha_inicio is not None]
        ends = [h.fecha_fin for h in hitos if h.fecha_fin is not None]
        if starts:
            fecha_inicio_raw = min(starts)
        if ends:
            fecha_fin_raw = max(ends)
    if fecha_inicio_raw is None:
        fecha_inicio_raw = _pick(datos_json, "fecha_inicio")
    if fecha_fin_raw is None:
        fecha_fin_raw = _pick(datos_json, "fecha_fin", "fin_obra")

    precio_origen = (
        oferta.total_ofertado
        if oferta is not None and oferta.total_ofertado is not None
        else total_lineas_decimal
    )
    precio_numero = _format_decimal_plain(precio_origen)
    precio_letra = _amount_to_words_eur(precio_origen)

    num_trab_raw = _pick(
        datos_json,
        "numero_trabajadores_obra",
        "num_trab",
        "numero_trabajadores",
    )
    num_trab = _str(num_trab_raw)
    num_trab_letra = _int_to_words_es(num_trab_raw)

    provider: Optional[ContratoDatosProveedor] = datos_proveedor
    hitos_text = _build_hitos_text(hitos)
    ref_date = _resolve_reference_date(contrato)

    ctx: dict[str, Any] = {
        "RAZON_SOCIAL": _str(
            (provider.razon_social if provider else None)
            or (provider.empresa if provider else None)
            or _pick(datos_json, "proveedor_razon_social", "razon_social", "empresa")
        ),
        "CIF": _str((provider.cif if provider else None) or _pick(datos_json, "proveedor_cif", "cif")),
        "DIRECCION_EMPRESA": _str(
            (provider.direccion_empresa if provider else None)
            or _pick(datos_json, "direccion_empresa")
        ),
        "NOMBRE_GERENTE": _str(
            (provider.nombre_gerente if provider else None)
            or _pick(datos_json, "nombre_gerente")
        ),
        "NIF_GERENTE": _str(
            (provider.nif_gerente if provider else None)
            or _pick(datos_json, "nif_gerente", "dni_gerente")
        ),
        "NOMBRE_OBRA": _str(_pick(datos_json, "nombre_obra") or contrato.nombre_obra),
        "NUM_OBRA": _str(_pick(datos_json, "numero_obra", "num_obra") or contrato.numero_obra),
        "NUMERO_OBRA": _str(_pick(datos_json, "numero_obra", "num_obra") or contrato.numero_obra),
        "FECHA_INICIO": _format_date_es(fecha_inicio_raw),
        "FECHA_FIN": _format_date_es(fecha_fin_raw),
        "FORMA_PAGO": _str(forma_pago),
        "DIA": str(ref_date.day),
        "MES": _MONTHS_ES[ref_date.month],
        "ANIO": str(ref_date.year),
        "LINEAS": lineas,
        "TOTAL_LINEAS": total_lineas,
        "TIPO_SERVICIO": _str(_pick(datos_json, "tipo_servicio", "service_category")),
        "PROMOTORA": _str(_pick(datos_json, "promotora", "promotor")),
        "DURACION_OBRA": _str(_pick(datos_json, "duracion_obra", "duracion", "plazo")),
        "PORTES": _str(_pick(datos_json, "portes", "freight_responsible")),
        "DESCARGAS": _str(_pick(datos_json, "descargas", "unloading_responsible")),
        "TERMINO_PAGO": termino_pago,
        "HITOS": hitos_text,
        "TIPO_ESCRITURA": _str(
            (provider.tipo_escritura if provider else None)
            or _pick(datos_json, "tipo_escritura")
        ),
        "FECHA_ESCRITURA": _format_date_es(
            (provider.fecha_escritura if provider else None)
            or _pick(datos_json, "fecha_escritura")
        ),
        "NOMBRE_NOTARIO": _str(
            (provider.nombre_notario if provider else None)
            or _pick(datos_json, "nombre_notario")
        ),
        "NUMERO_PROTOCOLO": _str(
            (provider.numero_protocolo if provider else None)
            or _pick(datos_json, "numero_protocolo")
        ),
        "PRECIO_NUMERO": precio_numero,
        "PRECIO_LETRA": precio_letra,
        "NUM_TRAB": num_trab,
        "NUM_TRAB_LETRA": num_trab_letra,
        "GARANTIA": _str(
            _pick(datos_json, "descripcion_garantias", "garantia")
            or (
                oferta.condiciones_json.get("garantias")
                if oferta is not None and isinstance(oferta.condiciones_json, dict)
                else None
            )
        ),
        "SEGURO": _str(_pick(datos_json, "seguro")),
        "FIN_OBRA": _format_date_es(fecha_fin_raw),
    }

    return ctx
