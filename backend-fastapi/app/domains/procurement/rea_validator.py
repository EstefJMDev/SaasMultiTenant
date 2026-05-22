"""Validacion de proveedores frente al REA (Registro de Empresas Acreditadas).

El REA es un registro publico del Ministerio de Trabajo. Consultamos su
formulario publico para saber si un proveedor (subcontrata) figura "en ALTA".
Si el proveedor existe en el REA y ademas existe en nuestra BD local con
estado ACTIVE, el comparativo puede ir directo a aprobacion de gerencia.
En cualquier otro caso, se envia el formulario de onboarding al proveedor.
"""
from __future__ import annotations

import logging
import re
from typing import Optional, TypedDict

import httpx

logger = logging.getLogger(__name__)

REA_URL = "https://expinterweb.mites.gob.es/rea/pub/consulta.htm"
REA_TIMEOUT_SECONDS = 15.0


class ReaResult(TypedDict, total=False):
    encontrada: Optional[bool]
    estado: str
    tipo_identificacion: str
    numero: str
    error: str


def _normalize_tax_id(tax_id: str) -> str:
    return (tax_id or "").strip().upper().replace("-", "").replace(" ", "")


def detect_tipo_identificacion(tax_id: str) -> str:
    """Detecta el tipo de identificador segun el formato espanol.

    Codigos REA:
      "1" = NIF (persona fisica): 8 digitos + letra
      "2" = NIE: empieza por X, Y o Z
      "3" = CIF (persona juridica): empieza por letra (A, B, C, D, E, F, G, H, J, N, P, Q, R, S, U, V, W)

    Fallback: "3" (CIF) por ser el caso mas habitual en contratacion empresarial.
    """
    normalized = _normalize_tax_id(tax_id)
    if not normalized:
        return "3"
    if normalized[0] in {"X", "Y", "Z"} and re.match(r"^[XYZ]\d{7}[A-Z]$", normalized):
        return "2"
    if re.match(r"^\d{8}[A-Z]$", normalized):
        return "1"
    if normalized[0].isalpha():
        return "3"
    return "3"


# Marcadores de resultado del formulario publico REA.
#
# Bug historico: la pagina HTML del REA contiene textos de ayuda/leyenda que
# mencionan literalmente "no consta la acreditacion" aunque el resultado real
# para esa consulta sea ALTA. La deteccion antigua comprobaba ese substring
# antes que "ALTA", devolviendo NO_CONSTA para empresas acreditadas.
#
# Estrategia nueva:
#   1) Acotamos la busqueda al bloque que sigue al titulo "Resultado de la
#      consulta" cuando aparece (descarta ayudas/leyendas previas).
#   2) NO_CONSTA exige literal "NO" como palabra delante de "consta" (case
#      insensitive); evita matches dentro de frases explicativas neutras.
#   3) ALTA se detecta por celda explicita (>ALTA<) o por la frase positiva
#      "consta como Empresa Acreditada".
#   4) Orden: ERROR_VALIDACION -> NO_CONSTA -> ALTA -> DESCONOCIDO.
_RE_RESULT_HEADER = re.compile(
    r"Resultado(?:s)?\s+de\s+(?:la\s+|su\s+)?consulta", re.IGNORECASE
)
_RE_ERROR_VALIDACION = re.compile(
    r"Seleccione un tipo de identificador|El campo no puede estar vac",
    re.IGNORECASE,
)
_RE_NO_CONSTA = re.compile(
    r"\bNO\b\s+consta(\s+como\s+Empresa\s+Acreditada|\s+la\s+acreditaci[oó]n)",
    re.IGNORECASE,
)
_RE_ALTA_TAG = re.compile(r">\s*ALTA\s*<", re.IGNORECASE)
_RE_ALTA_BLOCK = re.compile(
    r"consta\s+como\s+Empresa\s+Acreditada", re.IGNORECASE
)


def _classify_response(html: str) -> str:
    if not html:
        return "DESCONOCIDO"
    if _RE_ERROR_VALIDACION.search(html):
        return "ERROR_VALIDACION"

    header_match = _RE_RESULT_HEADER.search(html)
    scope = html[header_match.start():] if header_match else html
    scoped = header_match is not None

    if _RE_NO_CONSTA.search(scope):
        return "NO_CONSTA"
    if _RE_ALTA_TAG.search(scope) or _RE_ALTA_BLOCK.search(scope):
        return "ALTA"

    if not scoped and re.search(r"\bALTA\b", html):
        return "ALTA"
    return "DESCONOCIDO"


def consultar_rea(
    tax_id: str,
    tipo_identificacion: Optional[str] = None,
) -> ReaResult:
    """Consulta sincrona al formulario publico del REA.

    Devuelve un dict con `encontrada` (True/False/None) y `estado`:
      - ALTA: proveedor acreditado en el REA
      - NO_CONSTA: el REA no encuentra acreditacion
      - ERROR_VALIDACION: el formulario rechazo los datos enviados
      - DESCONOCIDO: respuesta inesperada (no se pudo determinar)
      - ERROR_RED: fallo de red o timeout (no concluyente)
    """
    numero = _normalize_tax_id(tax_id)
    if not numero:
        return {"encontrada": False, "estado": "ERROR_VALIDACION", "error": "tax_id vacio"}

    tipo = tipo_identificacion or detect_tipo_identificacion(numero)

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "tipoIdentificacion": tipo,
        "numIdentificacion": numero,
        "submitButton_mostrar": "Mostrar",
    }

    try:
        with httpx.Client(timeout=REA_TIMEOUT_SECONDS, follow_redirects=True) as client:
            response = client.post(REA_URL, data=data, headers=headers)
            response.raise_for_status()
            html = response.text
    except httpx.HTTPError as exc:
        logger.warning("Error consultando REA tax_id=%s tipo=%s: %s", numero, tipo, exc)
        return {
            "encontrada": None,
            "estado": "ERROR_RED",
            "tipo_identificacion": tipo,
            "numero": numero,
            "error": str(exc),
        }

    estado = _classify_response(html)

    # Trazabilidad: el resumen siempre, y un snippet del HTML cuando no se
    # llega a ALTA para poder diagnosticar falsos negativos sin desbordar logs.
    logger.info("REA consulta numero=%s tipo=%s estado=%s", numero, tipo, estado)
    if estado != "ALTA":
        logger.debug("REA html (truncado 1500c): %s", (html or "")[:1500])

    if estado == "ALTA":
        encontrada: Optional[bool] = True
    elif estado in {"NO_CONSTA", "ERROR_VALIDACION"}:
        encontrada = False
    else:
        encontrada = None

    return {
        "encontrada": encontrada,
        "estado": estado,
        "tipo_identificacion": tipo,
        "numero": numero,
    }
