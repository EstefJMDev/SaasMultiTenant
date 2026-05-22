from __future__ import annotations

from pathlib import Path
import importlib
import re
import subprocess
from typing import Any, Optional


def _safe_import(module_name: str) -> Any:
    try:
        return importlib.import_module(module_name)
    except Exception:  # pragma: no cover
        return None


_docxtpl = _safe_import("docxtpl")
DocxTemplate = getattr(_docxtpl, "DocxTemplate", None)

_BRACKET_TOKEN_RE = re.compile(r"\[([A-Z][A-Z0-9_]*)\]")

_FORCED_FONT_NAME = "Arial"
_FONT_SIZE_DELTA_PT = -2
_FONT_SIZE_DEFAULT_PT = 11
_FONT_SIZE_MIN_PT = 8


def _shrink_run_size(run: Any) -> None:
    try:
        from docx.shared import Pt  # type: ignore

        current = run.font.size
        if current is not None:
            new_pt = max(_FONT_SIZE_MIN_PT, int(current.pt) + _FONT_SIZE_DELTA_PT)
        else:
            new_pt = max(_FONT_SIZE_MIN_PT, _FONT_SIZE_DEFAULT_PT + _FONT_SIZE_DELTA_PT)
        run.font.size = Pt(new_pt)
    except Exception:
        pass


def _force_arial_on_run(run: Any) -> None:
    try:
        run.font.name = _FORCED_FONT_NAME
        rPr = run._element.get_or_add_rPr()
        from docx.oxml.ns import qn  # type: ignore
        from docx.oxml import OxmlElement  # type: ignore

        rFonts = rPr.find(qn("w:rFonts"))
        if rFonts is None:
            rFonts = OxmlElement("w:rFonts")
            rPr.append(rFonts)
        for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
            rFonts.set(qn(f"w:{attr}"), _FORCED_FONT_NAME)
    except Exception:
        pass
    _shrink_run_size(run)


def _force_arial_on_doc(doc: Any) -> None:
    try:
        from docx.shared import Pt  # type: ignore
        from docx.oxml.ns import qn  # type: ignore
        from docx.oxml import OxmlElement  # type: ignore

        normal = doc.styles["Normal"]
        normal.font.name = _FORCED_FONT_NAME
        current_size = normal.font.size
        if current_size is not None:
            new_pt = max(_FONT_SIZE_MIN_PT, int(current_size.pt) + _FONT_SIZE_DELTA_PT)
        else:
            new_pt = max(_FONT_SIZE_MIN_PT, _FONT_SIZE_DEFAULT_PT + _FONT_SIZE_DELTA_PT)
        normal.font.size = Pt(new_pt)

        rpr = normal.element.get_or_add_rPr()
        rFonts = rpr.find(qn("w:rFonts"))
        if rFonts is None:
            rFonts = OxmlElement("w:rFonts")
            rpr.append(rFonts)
        for attr in ("ascii", "hAnsi", "eastAsia", "cs"):
            rFonts.set(qn(f"w:{attr}"), _FORCED_FONT_NAME)
    except Exception:
        pass

    def _walk_runs(container: Any) -> None:
        for para in getattr(container, "paragraphs", []) or []:
            for run in para.runs:
                _force_arial_on_run(run)
        for table in getattr(container, "tables", []) or []:
            for row in table.rows:
                for cell in row.cells:
                    _walk_runs(cell)

    try:
        _walk_runs(doc)
    except Exception:
        pass

    try:
        for section in getattr(doc, "sections", []) or []:
            for sub in (getattr(section, "header", None), getattr(section, "footer", None)):
                if sub is not None:
                    _walk_runs(sub)
    except Exception:
        pass


def _apply_arial_to_docx_file(docx_path: Path) -> bool:
    """Reabre un .docx ya guardado y fuerza Arial en estilo Normal, runs de body,
    tablas (anidadas), headers y footers. Idempotente; best-effort."""
    docx_module = _safe_import("docx")
    if docx_module is None:
        return False
    try:
        doc = docx_module.Document(str(docx_path))
        _force_arial_on_doc(doc)
        doc.save(str(docx_path))
        return True
    except Exception:
        return False


def _replace_bracket_tokens_in_paragraph(para: Any, tokens: dict[str, str]) -> None:
    """Sustituye [VAR] dentro de un párrafo de python-docx, uniendo runs para
    detectar tokens partidos entre múltiples runs y reescribiendo el texto en
    el primer run (vaciar el resto). Preserva el formato del primer run.
    """
    runs = list(para.runs)
    if not runs:
        return
    full_text = "".join(r.text for r in runs)
    if "[" not in full_text:
        return
    replaced = _BRACKET_TOKEN_RE.sub(
        lambda m: tokens.get(m.group(1), m.group(0)),
        full_text,
    )
    if replaced == full_text:
        return
    runs[0].text = replaced
    for r in runs[1:]:
        r.text = ""


def _replace_bracket_tokens_in_doc(doc: Any, tokens: dict[str, str]) -> None:
    """Aplica sustitución [VAR] en body, tablas (incluyendo anidadas), headers
    y footers de un documento python-docx.
    """
    def _walk_paragraphs(container: Any) -> None:
        for para in getattr(container, "paragraphs", []) or []:
            _replace_bracket_tokens_in_paragraph(para, tokens)
        for table in getattr(container, "tables", []) or []:
            for row in table.rows:
                for cell in row.cells:
                    _walk_paragraphs(cell)

    _walk_paragraphs(doc)
    for section in getattr(doc, "sections", []) or []:
        header = getattr(section, "header", None)
        footer = getattr(section, "footer", None)
        if header is not None:
            _walk_paragraphs(header)
        if footer is not None:
            _walk_paragraphs(footer)


def _apply_bracket_tokens_to_docx(docx_path: Path, tokens: dict[str, str]) -> bool:
    """Abre un .docx ya generado y sustituye in-place todos los [VAR] presentes
    según el dict tokens (clave en MAYÚSCULA). Devuelve True si se pudo abrir
    y guardar.
    """
    docx_module = _safe_import("docx")
    if docx_module is None:
        return False
    try:
        doc = docx_module.Document(str(docx_path))
        _replace_bracket_tokens_in_doc(doc, tokens)
        doc.save(str(docx_path))
        return True
    except Exception:
        return False


def _render_docx_template(
    template_path: Path,
    output_docx: Path,
    context: dict[str, Any],
    bracket_tokens: Optional[dict[str, str]] = None,
) -> bool:
    """Renderiza una plantilla .docx.

    Soporta dos sintaxis simultáneamente:
      - Jinja-style (`{{ var }}`, `{% if %}`) vía docxtpl.
      - Tokens planos `[VAR]` sustituidos con python-docx si se pasa el dict
        `bracket_tokens` con clave en MAYÚSCULA → valor string.

    El paso de tokens [VAR] se ejecuta DESPUÉS del render de docxtpl, para no
    interferir con la lógica Jinja y porque muchas plantillas heredadas usan
    solo tokens corchete.
    """
    if DocxTemplate is None:
        return False
    try:
        tpl = DocxTemplate(str(template_path))
        tpl.render(context)
        output_docx.parent.mkdir(parents=True, exist_ok=True)
        tpl.save(str(output_docx))
    except Exception:
        return False
    if bracket_tokens:
        # Best-effort: si falla el segundo paso, mantenemos el docx renderizado
        # por docxtpl (puede que el caller use otras vías).
        _apply_bracket_tokens_to_docx(output_docx, bracket_tokens)
    # Forzar Arial en el docx renderizado para que la regeneración no devuelva
    # la tipografía original de la plantilla (best-effort).
    _apply_arial_to_docx_file(output_docx)
    return True


def _convert_docx_to_pdf(source_docx: Path, output_pdf: Path) -> bool:
    try:
        result = subprocess.run(
            [
                "soffice",
                "--headless",
                "--convert-to",
                "pdf:writer_pdf_Export",
                "--outdir",
                str(output_pdf.parent),
                str(source_docx),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
            check=False,
        )
    except Exception:
        return False

    if result.returncode != 0:
        return False

    generated = output_pdf.parent / f"{source_docx.stem}.pdf"
    if not generated.exists():
        return False

    if generated.resolve() != output_pdf.resolve():
        output_pdf.parent.mkdir(parents=True, exist_ok=True)
        output_pdf.write_bytes(generated.read_bytes())
        try:
            generated.unlink(missing_ok=True)
        except Exception:
            pass
    return output_pdf.exists()
