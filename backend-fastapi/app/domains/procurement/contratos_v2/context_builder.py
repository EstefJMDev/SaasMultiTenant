from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING, Any, Iterable, Optional

from num2words import num2words

if TYPE_CHECKING:
    from app.platform.contracts_core.comparativos_models import (
        Contrato,
        ContratoDatosProveedor,
        ContratoHito,
        ContratoOfertaAdjudicada,
        ContratoOfertaAdjudicadaPartida,
    )


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


def _str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _first_non_empty(*values: Any) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str):
            if value.strip():
                return value.strip()
            continue
        return value
    return None


def _to_decimal(value: Any) -> Optional[Decimal]:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _format_date_es(value: Any) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    raw = str(value).strip()
    if not raw:
        return ""
    for fmt in (
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%d/%m/%Y",
    ):
        try:
            return datetime.strptime(raw[: len(fmt) + 8], fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    return raw


def _format_eur(value: Any) -> str:
    dec = _to_decimal(value)
    if dec is None:
        return ""
    rendered = f"{dec:,.2f}"
    rendered = rendered.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{rendered} €"


def _format_qty(value: Any) -> str:
    dec = _to_decimal(value)
    if dec is None:
        return ""
    if dec == dec.to_integral():
        return str(int(dec))
    return f"{dec:.2f}".replace(".", ",")


def _apocope_uno(text: str) -> str:
    result = text
    result = result.replace(" veintiuno", " veintiún")
    if result.endswith(" uno"):
        result = result[:-4] + " un"
    if result == "uno":
        result = "un"
    if result == "veintiuno":
        result = "veintiún"
    return result


def _amount_to_words_eur(value: Any) -> str:
    amount = _to_decimal(value)
    if amount is None:
        return ""
    amount = amount.quantize(Decimal("0.01"))
    sign = "MENOS " if amount < 0 else ""
    amount = abs(amount)
    euros = int(amount)
    cents = int((amount - euros) * 100)
    try:
        euros_text = _apocope_uno(num2words(euros, lang="es")).upper()
        cents_text = _apocope_uno(num2words(cents, lang="es")).upper() if cents else ""
    except Exception:
        return ""
    euro_unit = "EURO" if euros == 1 else "EUROS"
    out = f"{sign}{euros_text} {euro_unit}"
    if cents:
        cent_unit = "CÉNTIMO" if cents == 1 else "CÉNTIMOS"
        out += f" CON {cents_text} {cent_unit}"
    return out


def _int_to_words_es(value: Any) -> str:
    if value is None or value == "":
        return ""
    try:
        number = int(Decimal(str(value)))
    except Exception:
        return ""
    try:
        return _apocope_uno(num2words(number, lang="es")).upper()
    except Exception:
        return ""


def _build_hitos_text(hitos: Iterable[ContratoHito]) -> str:
    lines: list[str] = []
    for h in hitos:
        tokens: list[str] = []
        if _str(h.nombre_hito):
            tokens.append(f"{_str(h.nombre_hito)}:")
        if h.fecha_inicio:
            tokens.append(f"inicio: {_format_date_es(h.fecha_inicio)}")
        if h.fecha_fin:
            tokens.append(f"finalizacion: {_format_date_es(h.fecha_fin)}")
        if _str(h.descripcion_hito):
            tokens.append(f"observaciones: {_str(h.descripcion_hito)}")
        if tokens:
            lines.append(" - ".join(tokens))
    return "\n".join(lines)


def _build_lineas(partidas: Iterable[ContratoOfertaAdjudicadaPartida]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for partida in partidas:
        out.append(
            {
                "med": _format_qty(partida.cantidad),
                "uds": _str(partida.unidad),
                "descripcion": _str(partida.descripcion),
                "precio": _format_eur(partida.precio_unitario),
                "importe": _format_eur(partida.importe),
            }
        )
    return out


def build_substitution_context_v2(
    *,
    contrato: Contrato,
    datos_proveedor: Optional[ContratoDatosProveedor],
    hitos: list[ContratoHito],
    oferta_adjudicada: Optional[ContratoOfertaAdjudicada],
    partidas: list[ContratoOfertaAdjudicadaPartida],
    fecha_referencia: Optional[datetime | date] = None,
) -> dict[str, Any]:
    datos_contractuales = dict(contrato.datos_contractuales_json or {})
    condiciones = (
        dict(oferta_adjudicada.condiciones_json or {}) if oferta_adjudicada is not None else {}
    )

    fecha_doc = fecha_referencia or contrato.fecha_firma or contrato.fecha_aprobacion or contrato.fecha_creacion
    if isinstance(fecha_doc, date) and not isinstance(fecha_doc, datetime):
        fecha_doc = datetime.combine(fecha_doc, datetime.min.time()).replace(tzinfo=timezone.utc)
    if fecha_doc is None:
        fecha_doc = datetime.now(timezone.utc)

    hitos_text = _build_hitos_text(hitos)
    lineas = _build_lineas(partidas)

    total_lineas_raw: Optional[Decimal] = None
    for partida in partidas:
        if partida.importe is None:
            continue
        if total_lineas_raw is None:
            total_lineas_raw = Decimal("0")
        total_lineas_raw += Decimal(str(partida.importe))
    if total_lineas_raw is None:
        total_lineas_raw = _to_decimal(
            oferta_adjudicada.total_ofertado if oferta_adjudicada is not None else None
        )

    importe_total = _to_decimal(
        oferta_adjudicada.total_ofertado if oferta_adjudicada is not None else None
    )
    num_trabajadores = _first_non_empty(
        datos_contractuales.get("num_trabajadores"),
        condiciones.get("num_trabajadores"),
        condiciones.get("numero_trabajadores_obra"),
    )

    fecha_inicio_raw = _first_non_empty(
        datos_contractuales.get("fecha_inicio"),
        condiciones.get("fecha_inicio"),
    )
    fecha_fin_raw = _first_non_empty(
        datos_contractuales.get("fecha_fin"),
        datos_contractuales.get("fin_obra"),
        condiciones.get("fin_obra"),
    )

    forma_pago = _first_non_empty(
        oferta_adjudicada.forma_pago if oferta_adjudicada is not None else None,
        condiciones.get("forma_pago"),
        datos_contractuales.get("forma_pago"),
    )

    contexto: dict[str, Any] = {
        "RAZON_SOCIAL": _first_non_empty(
            datos_proveedor.razon_social if datos_proveedor is not None else None,
            datos_proveedor.empresa if datos_proveedor is not None else None,
            oferta_adjudicada.proveedor_nombre_snapshot if oferta_adjudicada is not None else None,
        )
        or "",
        "CIF": _str(datos_proveedor.cif if datos_proveedor is not None else None),
        "DIRECCION_EMPRESA": _str(
            datos_proveedor.direccion_empresa if datos_proveedor is not None else None
        ),
        "NOMBRE_GERENTE": _first_non_empty(
            datos_proveedor.nombre_gerente if datos_proveedor is not None else None,
            datos_contractuales.get("responsable"),
        )
        or "",
        "NIF_GERENTE": _str(datos_proveedor.nif_gerente if datos_proveedor is not None else None),
        "NOMBRE_OBRA": _str(contrato.nombre_obra),
        "NUM_OBRA": _str(contrato.numero_obra),
        "NUMERO_OBRA": _str(contrato.numero_obra),
        "FECHA_INICIO": _format_date_es(fecha_inicio_raw),
        "FECHA_FIN": _format_date_es(fecha_fin_raw),
        "FORMA_PAGO": _str(forma_pago),
        "DIA": str(fecha_doc.day),
        "MES": _MONTHS_ES[fecha_doc.month],
        "ANIO": str(fecha_doc.year),
        "LINEAS": lineas,
        "TOTAL_LINEAS": _format_eur(total_lineas_raw),
        "TIPO_SERVICIO": _str(
            _first_non_empty(
                datos_contractuales.get("tipo_servicio"),
                condiciones.get("tipo_servicio"),
            )
        ),
        "PROMOTORA": _str(
            _first_non_empty(
                datos_contractuales.get("promotora"),
                condiciones.get("promotora"),
            )
        ),
        "DURACION_OBRA": _str(
            _first_non_empty(
                datos_contractuales.get("duracion_obra"),
                oferta_adjudicada.plazo if oferta_adjudicada is not None else None,
                condiciones.get("duracion_obra"),
            )
        ),
        "PORTES": _str(
            _first_non_empty(
                datos_contractuales.get("portes"),
                condiciones.get("portes"),
            )
        ),
        "DESCARGAS": _str(
            _first_non_empty(
                datos_contractuales.get("descargas"),
                condiciones.get("descargas"),
            )
        ),
        "TERMINO_PAGO": _str(
            _first_non_empty(
                datos_contractuales.get("termino_pago"),
                condiciones.get("termino_pago"),
            )
        ),
        "HITOS": hitos_text,
        "TIPO_ESCRITURA": _str(datos_proveedor.tipo_escritura if datos_proveedor is not None else None),
        "FECHA_ESCRITURA": _format_date_es(
            datos_proveedor.fecha_escritura if datos_proveedor is not None else None
        ),
        "NOMBRE_NOTARIO": _str(datos_proveedor.nombre_notario if datos_proveedor is not None else None),
        "NUMERO_PROTOCOLO": _str(
            datos_proveedor.numero_protocolo if datos_proveedor is not None else None
        ),
        "PRECIO_NUMERO": _format_eur(importe_total),
        "PRECIO_LETRA": _amount_to_words_eur(importe_total),
        "NUM_TRAB": _str(num_trabajadores),
        "NUM_TRAB_LETRA": _int_to_words_es(num_trabajadores),
        "GARANTIA": _str(
            _first_non_empty(
                datos_contractuales.get("garantia"),
                condiciones.get("garantia"),
            )
        ),
        "SEGURO": _str(
            _first_non_empty(
                datos_contractuales.get("seguro"),
                condiciones.get("seguro"),
            )
        ),
        "FIN_OBRA": _format_date_es(
            _first_non_empty(
                datos_contractuales.get("fin_obra"),
                condiciones.get("fin_obra"),
                fecha_fin_raw,
            )
        ),
    }

    return contexto


__all__ = ["build_substitution_context_v2"]
