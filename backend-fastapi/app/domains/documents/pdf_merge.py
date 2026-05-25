from __future__ import annotations

from pathlib import Path
import importlib

from app.domains.documents.utils import _normalize_field_name


def _safe_import(module_name: str):
    try:
        return importlib.import_module(module_name)
    except Exception:  # pragma: no cover
        return None


_pypdf = _safe_import("pypdf")
PdfReader = getattr(_pypdf, "PdfReader", None)
PdfWriter = getattr(_pypdf, "PdfWriter", None)


def _fill_template_form(template_path: Path, output_path: Path, values: dict[str, str]) -> bool:
    if PdfReader is None or PdfWriter is None:
        return False

    reader = PdfReader(str(template_path))
    fields = reader.get_fields() or {}
    if not fields:
        return False

    normalized_values = {_normalize_field_name(k): v for k, v in values.items() if v}

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    resolved: dict[str, str] = {}
    for field_name in fields.keys():
        normalized_field = _normalize_field_name(str(field_name))
        value = normalized_values.get(normalized_field)
        if value:
            resolved[str(field_name)] = value

    if not resolved:
        return False

    for page in writer.pages:
        writer.update_page_form_field_values(page, resolved)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as out:
        writer.write(out)
    return True

def _merge_pdfs(base_pdf: Path, append_pdf: Path, output_path: Path) -> None:
    if PdfReader is None or PdfWriter is None:
        # Fallback: priorizar plantilla base si no podemos fusionar PDFs.
        # Así no mostramos solo el resumen cuando falta pypdf.
        if base_pdf.exists():
            output_path.write_bytes(base_pdf.read_bytes())
        else:
            output_path.write_bytes(append_pdf.read_bytes())
        return

    writer = PdfWriter()
    for src in (base_pdf, append_pdf):
        reader = PdfReader(str(src))
        for page in reader.pages:
            writer.add_page(page)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as out:
        writer.write(out)
