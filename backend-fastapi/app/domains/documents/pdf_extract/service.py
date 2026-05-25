from __future__ import annotations

from io import BytesIO
from pathlib import Path
import importlib
from typing import Any

from app.platform.contracts_core.models import Contract
from app.domains.documents.utils import _normalize_field_name
from app.domains.documents.pdf_extract.anchors import _anchor_map_for, _line_buckets
from app.domains.documents.pdf_extract.suministro import (
    _fill_suministro_template_precise as _suministro_fill,
)


def _safe_import(module_name: str):
    try:
        return importlib.import_module(module_name)
    except Exception:  # pragma: no cover
        return None


_reportlab_pdfgen_canvas = _safe_import("reportlab.pdfgen.canvas")
_pypdf = _safe_import("pypdf")
pdfplumber = _safe_import("pdfplumber")

canvas = _reportlab_pdfgen_canvas
PdfReader = getattr(_pypdf, "PdfReader", None)
PdfWriter = getattr(_pypdf, "PdfWriter", None)


def _fill_template_by_anchors(
    template_path: Path,
    output_path: Path,
    values: dict[str, str],
    contract: Contract,
) -> bool:
    if PdfReader is None or PdfWriter is None or canvas is None or pdfplumber is None:
        return False

    anchor_map = _anchor_map_for(contract)
    normalized_values = {_normalize_field_name(k): str(v).strip() for k, v in values.items() if str(v).strip()}
    pending_fields = {k for k in anchor_map.keys() if normalized_values.get(k)}
    if not pending_fields:
        return False

    placements_by_page: dict[int, list[tuple[float, float, str]]] = {}
    with pdfplumber.open(str(template_path)) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            words = page.extract_words() or []
            lines = _line_buckets(words)
            for line_words in lines:
                line_text_raw = " ".join(str(w.get("text") or "") for w in line_words)
                line_text_norm = _normalize_field_name(line_text_raw)
                if not line_text_norm:
                    continue
                for field in list(pending_fields):
                    anchors = [_normalize_field_name(a) for a in (anchor_map.get(field) or [])]
                    if not any(anchor in line_text_norm for anchor in anchors):
                        continue
                    value = normalized_values.get(field)
                    if not value:
                        pending_fields.discard(field)
                        break
                    rightmost = max(line_words, key=lambda w: float(w.get("x1", 0.0)))
                    x = float(rightmost.get("x1", 0.0)) + 8.0
                    y = float(page.height) - float(rightmost.get("top", 0.0)) - 2.0
                    placements_by_page.setdefault(page_idx, []).append((x, y, value))
                    pending_fields.discard(field)
                    break
            if not pending_fields:
                break

    if not placements_by_page:
        return False

    template_reader = PdfReader(str(template_path))
    overlay_buffer = BytesIO()
    overlay_canvas = canvas.Canvas(overlay_buffer)
    total_pages = len(template_reader.pages)

    for page_idx, page in enumerate(template_reader.pages):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        overlay_canvas.setPageSize((width, height))
        # Forzar color de texto en negro para evitar heredar estilos rojos del PDF base.
        overlay_canvas.setFillColorRGB(0, 0, 0)
        overlay_canvas.setFont("Helvetica", 8)
        for x, y, value in placements_by_page.get(page_idx, []):
            overlay_canvas.drawString(x, y, value)
        if page_idx < total_pages - 1:
            overlay_canvas.showPage()

    overlay_canvas.save()
    overlay_buffer.seek(0)
    overlay_reader = PdfReader(overlay_buffer)

    writer = PdfWriter()
    for page_idx, page in enumerate(template_reader.pages):
        if page_idx < len(overlay_reader.pages):
            try:
                page.merge_page(overlay_reader.pages[page_idx], over=True)
            except TypeError:
                page.merge_page(overlay_reader.pages[page_idx])
        writer.add_page(page)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as out:
        writer.write(out)
    return True


def _fill_suministro_template_precise(
    template_path: Path,
    output_path: Path,
    values: dict[str, str],
) -> bool:
    return _suministro_fill(template_path, output_path, values)


def _patch_suministro_signature_page(document_path: Path, values: dict[str, str]) -> None:
    if PdfReader is None or PdfWriter is None or canvas is None or pdfplumber is None:
        return
    if not document_path.exists():
        return

    supplier_name = str(values.get("razon_social") or "").strip()
    manager_name = str(values.get("nombre_gerente") or "").strip()
    if not supplier_name and not manager_name:
        return

    reader = PdfReader(str(document_path))
    if len(reader.pages) < 2:
        return

    def _is_red_word(word: dict[str, Any]) -> bool:
        color = word.get("non_stroking_color")
        if not isinstance(color, (tuple, list)) or len(color) < 3:
            return False
        try:
            r = float(color[0])
            g = float(color[1])
            b = float(color[2])
        except (TypeError, ValueError):
            return False
        return r >= 0.75 and g <= 0.30 and b <= 0.30

    supplier_box: tuple[float, float, float, float] | None = None
    signer_box: tuple[float, float, float, float] | None = None

    with pdfplumber.open(str(document_path)) as pdf:
        page = pdf.pages[1]
        height = float(page.height)
        words = page.extract_words(extra_attrs=["non_stroking_color"]) or []
        lines = _line_buckets(words)

        for line_words in lines:
            raw_line = " ".join(str(w.get("text") or "") for w in line_words).strip()
            norm_line = _normalize_field_name(raw_line)
            if "empresa_falsa_sl" in norm_line and supplier_box is None:
                red_words = [w for w in line_words if _is_red_word(w)]
                if red_words:
                    x0 = min(float(w.get("x0", 0.0)) for w in red_words)
                    x1 = max(float(w.get("x1", x0 + 10.0)) for w in red_words)
                    top = min(float(w.get("top", 0.0)) for w in red_words)
                    bottom = max(float(w.get("bottom", top + 10.0)) for w in red_words)
                    supplier_box = (x0, height - bottom, x1 - x0, max(8.0, bottom - top))
            if "fdo_alex" in norm_line and signer_box is None:
                red_words = [w for w in line_words if _is_red_word(w)]
                if red_words:
                    x0 = min(float(w.get("x0", 0.0)) for w in red_words)
                    x1 = max(float(w.get("x1", x0 + 10.0)) for w in red_words)
                    top = min(float(w.get("top", 0.0)) for w in red_words)
                    bottom = max(float(w.get("bottom", top + 10.0)) for w in red_words)
                    signer_box = (x0, height - bottom, x1 - x0, max(8.0, bottom - top))

    if supplier_box is None and signer_box is None:
        return

    overlay_buffer = BytesIO()
    overlay_canvas = canvas.Canvas(overlay_buffer)
    total_pages = len(reader.pages)
    for page_idx, page in enumerate(reader.pages):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        overlay_canvas.setPageSize((width, height))
        if page_idx == 1:
            overlay_canvas.setFont("Helvetica", 8.5)
            if supplier_box and supplier_name:
                x, y, w, h = supplier_box
                overlay_canvas.setFillColorRGB(1, 1, 1)
                overlay_canvas.rect(x - 0.8, y - 0.8, max(w + 2.0, 95.0), h + 2.0, fill=1, stroke=0)
                overlay_canvas.setFillColorRGB(0, 0, 0)
                overlay_canvas.drawString(x, y + 0.6, supplier_name)
            if signer_box and manager_name:
                x, y, w, h = signer_box
                overlay_canvas.setFillColorRGB(1, 1, 1)
                overlay_canvas.rect(x - 0.8, y - 0.8, max(w + 2.0, 55.0), h + 2.0, fill=1, stroke=0)
                overlay_canvas.setFillColorRGB(0, 0, 0)
                overlay_canvas.drawString(x, y + 0.6, manager_name)
        if page_idx < total_pages - 1:
            overlay_canvas.showPage()

    overlay_canvas.save()
    overlay_buffer.seek(0)
    overlay_reader = PdfReader(overlay_buffer)

    writer = PdfWriter()
    for page_idx, page in enumerate(reader.pages):
        if page_idx < len(overlay_reader.pages):
            try:
                page.merge_page(overlay_reader.pages[page_idx], over=True)
            except TypeError:
                page.merge_page(overlay_reader.pages[page_idx])
        writer.add_page(page)

    patched_path = document_path.with_name(f"{document_path.stem}_patched.pdf")
    with patched_path.open("wb") as out:
        writer.write(out)
    patched_path.replace(document_path)

