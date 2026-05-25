from __future__ import annotations

from io import BytesIO
from pathlib import Path
import importlib
import re
from typing import Any

from app.domains.documents.utils import _normalize_field_name
from app.domains.documents.pdf_extract.anchors import _line_buckets
from app.domains.documents.pdf_extract.replacements import (
    _legacy_phrase_replacements,
    _manual_template_line_replacements,
)
from app.domains.documents.pdf_extract.suministro import _fill_suministro_template_precise


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


def _normalized_values(values: dict[str, str]) -> dict[str, str]:
    return {
        _normalize_field_name(k): str(v).strip()
        for k, v in values.items()
        if str(v).strip()
    }


def _strict_tokens(normalized_values: dict[str, str]) -> set[str]:
    return {
        key
        for key in normalized_values.keys()
        if "_" in key or key in {"dia", "mes", "anyo", "ano", "ttt", "promotora"}
    }


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


def _line_tokens(line_words: list[dict[str, Any]]) -> list[str]:
    return [
        _normalize_field_name(str(w.get("text") or "").strip(".,;:()[]{}"))
        for w in line_words
    ]


def _apply_manual_line_replacements(
    lines: list[list[dict[str, Any]]],
    legacy_line_repls: list[tuple[str, str]],
    page: Any,
    page_idx: int,
    placements_by_page: dict[int, list[tuple[float, float, float, float, float, str]]],
    matched_line_patterns: set[str],
) -> None:
    if not legacy_line_repls or page_idx != 0:
        return

    for line_words in lines:
        line_text_raw = " ".join(str(w.get("text") or "") for w in line_words).strip()
        line_text_norm = _normalize_field_name(line_text_raw)
        if not line_text_norm:
            continue
        for pattern, replacement in legacy_line_repls:
            if pattern in matched_line_patterns:
                continue
            if pattern not in line_text_norm:
                continue
            x0 = min(float(item.get("x0", 0.0)) for item in line_words)
            x1 = max(float(item.get("x1", x0 + 20.0)) for item in line_words)
            top = min(float(item.get("top", 0.0)) for item in line_words)
            bottom = max(float(item.get("bottom", top + 10.0)) for item in line_words)
            page_height = float(page.height)
            page_width = float(page.width)
            y_bottom = page_height - bottom
            height = max(10.0, bottom - top)
            line_width = max(30.0, page_width - x0 - 24.0, x1 - x0)
            placements_by_page.setdefault(page_idx, []).append(
                (x0, y_bottom - 2.0, line_width, height + 5.0, max(line_width + 8.0, 220.0), replacement)
            )
            matched_line_patterns.add(pattern)
            break


def _apply_phrase_replacements(
    lines: list[list[dict[str, Any]]],
    legacy_replacements: dict[str, str],
    page: Any,
    page_idx: int,
    placements_by_page: dict[int, list[tuple[float, float, float, float, float, str]]],
    red_erase_by_page: dict[int, list[tuple[float, float, float, float]]],
) -> None:
    for line_words in lines:
        token_words = _line_tokens(line_words)
        occupied: set[int] = set()
        for phrase_key, replacement in legacy_replacements.items():
            phrase_tokens = [tk for tk in phrase_key.split("_") if tk]
            if not phrase_tokens:
                continue
            span = len(phrase_tokens)
            if span == 0 or span > len(token_words):
                continue
            for idx in range(0, len(token_words) - span + 1):
                if any((idx + offset) in occupied for offset in range(span)):
                    continue
                window = token_words[idx : idx + span]
                if window != phrase_tokens:
                    continue

                first = line_words[idx]
                last = line_words[idx + span - 1]
                x0 = float(first.get("x0", 0.0))
                x1 = float(last.get("x1", x0 + 20.0))
                top = min(
                    float(item.get("top", 0.0))
                    for item in line_words[idx : idx + span]
                )
                bottom = max(
                    float(item.get("bottom", top + 10.0))
                    for item in line_words[idx : idx + span]
                )
                page_height = float(page.height)
                y_bottom = page_height - bottom
                height = max(8.0, bottom - top)
                width = max(20.0, x1 - x0)
                red_erase_by_page.setdefault(page_idx, []).append((x0, y_bottom, width, height))
                placements_by_page.setdefault(page_idx, []).append(
                    (x0, y_bottom, width, height, width + 6.0, replacement)
                )
                for offset in range(span):
                    occupied.add(idx + offset)
                break


def _apply_token_replacements(
    lines: list[list[dict[str, Any]]],
    normalized_values: dict[str, str],
    strict_tokens: set[str],
    page: Any,
    page_idx: int,
    placements_by_page: dict[int, list[tuple[float, float, float, float, float, str]]],
    red_erase_by_page: dict[int, list[tuple[float, float, float, float]]],
) -> None:
    for line_words in lines:
        line_text_raw = " ".join(str(w.get("text") or "") for w in line_words).strip()
        line_text_norm = _normalize_field_name(line_text_raw)
        if not line_text_norm:
            continue
        for token, replacement in normalized_values.items():
            if token not in line_text_norm:
                continue
            if token in strict_tokens and line_text_norm != token:
                continue
            if replacement in line_text_raw:
                continue
            leftmost = min(line_words, key=lambda w: float(w.get("x0", 0.0)))
            rightmost = max(line_words, key=lambda w: float(w.get("x1", 0.0)))
            x0 = float(leftmost.get("x0", 0.0))
            x1 = float(rightmost.get("x1", x0 + 20.0))
            top = min(float(item.get("top", 0.0)) for item in line_words)
            bottom = max(float(item.get("bottom", top + 10.0)) for item in line_words)
            page_height = float(page.height)
            y_bottom = page_height - bottom
            height = max(8.0, bottom - top)
            width = max(20.0, x1 - x0)
            red_erase_by_page.setdefault(page_idx, []).append((x0, y_bottom, width, height))
            placements_by_page.setdefault(page_idx, []).append(
                (x0, y_bottom, width, height, width + 6.0, replacement)
            )
            break


def _build_overlay(
    template_reader: Any,
    placements_by_page: dict[int, list[tuple[float, float, float, float, float, str]]],
    red_erase_by_page: dict[int, list[tuple[float, float, float, float]]],
) -> Any:
    overlay_buffer = BytesIO()
    overlay_canvas = canvas.Canvas(overlay_buffer)
    total_pages = len(template_reader.pages)

    for page_idx, page in enumerate(template_reader.pages):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        overlay_canvas.setPageSize((width, height))
        overlay_canvas.setFillColorRGB(1, 1, 1)
        for x, y, w, h in red_erase_by_page.get(page_idx, []):
            overlay_canvas.rect(x - 0.8, y - 0.8, w + 2.0, h + 2.0, fill=1, stroke=0)
        overlay_canvas.setFillColorRGB(0, 0, 0)
        overlay_canvas.setFont("Helvetica", 8)
        for x, y, w, h, max_width, value in placements_by_page.get(page_idx, []):
            clean = re.sub(r"\s+", " ", str(value or "").strip())
            if not clean:
                continue
            # Ajuste de ancho minimo
            font_size = 8
            while font_size > 6 and overlay_canvas.stringWidth(clean, "Helvetica", font_size) > max_width:
                font_size -= 0.5
            overlay_canvas.setFont("Helvetica", font_size)
            overlay_canvas.drawString(x, y + 0.6, clean)
        if page_idx < total_pages - 1:
            overlay_canvas.showPage()

    overlay_canvas.save()
    overlay_buffer.seek(0)
    return PdfReader(overlay_buffer)


def _merge_with_overlay(template_reader: Any, overlay_reader: Any, output_path: Path) -> None:
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


def _fill_pdf_placeholders_exact(
    template_path: Path,
    output_path: Path,
    values: dict[str, str],
) -> bool:
    if PdfReader is None or PdfWriter is None or canvas is None or pdfplumber is None:
        return False

    normalized_values = _normalized_values(values)
    if not normalized_values:
        return False

    if template_path.name.upper() in {"SUMINISTRO.PDF", "SUMINISTROS.PDF"}:
        return _fill_suministro_template_precise(template_path, output_path, values)

    template_reader = PdfReader(str(template_path))
    placements_by_page: dict[int, list[tuple[float, float, float, float, float, str]]] = {}
    red_erase_by_page: dict[int, list[tuple[float, float, float, float]]] = {}
    legacy_replacements: dict[str, str] = {}
    legacy_line_repls: list[tuple[str, str]] = _manual_template_line_replacements(values)
    strict_tokens = _strict_tokens(normalized_values)

    matched_line_patterns: set[str] = set()
    with pdfplumber.open(str(template_path)) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            words = page.extract_words(extra_attrs=["non_stroking_color"]) or []
            lines = _line_buckets(words)

            _apply_manual_line_replacements(
                lines,
                legacy_line_repls,
                page,
                page_idx,
                placements_by_page,
                matched_line_patterns,
            )

            if legacy_replacements and page_idx <= 2:
                _apply_phrase_replacements(
                    lines,
                    legacy_replacements,
                    page,
                    page_idx,
                    placements_by_page,
                    red_erase_by_page,
                )

            if not legacy_replacements and page_idx <= 2:
                legacy_replacements = _legacy_phrase_replacements(values)
                _apply_phrase_replacements(
                    lines,
                    legacy_replacements,
                    page,
                    page_idx,
                    placements_by_page,
                    red_erase_by_page,
                )

            _apply_token_replacements(
                lines,
                normalized_values,
                strict_tokens,
                page,
                page_idx,
                placements_by_page,
                red_erase_by_page,
            )

    if not placements_by_page and not red_erase_by_page:
        return False

    overlay_reader = _build_overlay(template_reader, placements_by_page, red_erase_by_page)
    _merge_with_overlay(template_reader, overlay_reader, output_path)
    return True
