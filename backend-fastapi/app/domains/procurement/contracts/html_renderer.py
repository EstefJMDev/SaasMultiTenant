"""
HTML → PDF renderer for contracts using Jinja2 + WeasyPrint.

Pipeline:
    context (dict {VAR: str})  ->  Jinja2 template  ->  HTML  ->  WeasyPrint  ->  PDF

This is the replacement for the DOCX + LibreOffice path. Same input contract
context produced by ``_build_substitution_context`` in document_generator.py
is consumed here directly — no remapping needed.

Wiring into ``generate_contract_from_template`` happens in Fase 2 (per-template
migration), once the HTML templates contain the full clause text.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Mapping

from app.platform.contracts_core.models import ContractType

logger = logging.getLogger("app.procurement.html_renderer")

# Directory holding the HTML/Jinja templates and the shared base.css.
TEMPLATES_DIR: Path = Path(__file__).parent / "templates_html"

# Map contract type -> template filename. Add SERVICIO when its template exists
# (Fase 2 continuation).
_TEMPLATE_BY_TYPE: dict[ContractType, str] = {
    ContractType.SUMINISTRO: "suministro.html.j2",
    ContractType.SUBCONTRATACION: "subcontratacion.html.j2",
    ContractType.SERVICIO: "servicios.html.j2",
}


class HtmlRendererError(RuntimeError):
    """Raised when HTML→PDF rendering fails for any reason."""


def has_html_template_for(contract_type: ContractType) -> bool:
    """Return True iff an HTML template is registered AND present on disk."""
    name = _TEMPLATE_BY_TYPE.get(contract_type)
    if not name:
        return False
    return (TEMPLATES_DIR / name).exists()


def render_contract_html_to_pdf(
    *,
    contract_type: ContractType,
    context: Mapping[str, Any],
    output_path: Path,
) -> bool:
    """
    Render a contract to PDF from its HTML/Jinja template.

    Args:
        contract_type: drives template selection.
        context: dict {VAR_NAME: str} as produced by _build_substitution_context.
        output_path: target .pdf file path. Parent dirs must exist.

    Returns:
        True on success. On failure, raises HtmlRendererError with the cause —
        the caller decides whether to surface as HTTP 500.
    """
    template_name = _TEMPLATE_BY_TYPE.get(contract_type)
    if not template_name:
        raise HtmlRendererError(
            f"No HTML template registered for contract type {contract_type}"
        )

    template_path = TEMPLATES_DIR / template_name
    if not template_path.exists():
        raise HtmlRendererError(f"HTML template not found on disk: {template_path}")

    try:
        from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape
    except ImportError as exc:
        raise HtmlRendererError(
            "jinja2 is not installed. Add it to requirements.txt."
        ) from exc

    try:
        from weasyprint import HTML
    except ImportError as exc:
        raise HtmlRendererError(
            "weasyprint is not installed. Add it to requirements.txt "
            "and ensure system libs (pango, cairo, gdk-pixbuf) are present."
        ) from exc

    # Jinja env: autoescape HTML by default; tolerate missing vars (render as '').
    # We intentionally do NOT use StrictUndefined here because the substitution
    # context may legitimately omit optional fields; templates handle absence
    # with `or ''` and `{% if %}` guards.
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(enabled_extensions=("html", "j2", "html.j2")),
        trim_blocks=True,
        lstrip_blocks=True,
    )

    try:
        template = env.get_template(template_name)
        html_str = template.render(**dict(context))
    except Exception as exc:
        logger.error("Jinja2 render failed for %s: %s", template_name, exc)
        raise HtmlRendererError(f"Template render failed: {exc}") from exc

    try:
        # base_url so WeasyPrint resolves <link rel="stylesheet" href="base.css">.
        HTML(string=html_str, base_url=str(TEMPLATES_DIR)).write_pdf(
            target=str(output_path)
        )
    except Exception as exc:
        logger.error("WeasyPrint PDF write failed: %s", exc)
        raise HtmlRendererError(f"PDF generation failed: {exc}") from exc

    return True
