from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import importlib
import textwrap
from typing import Any


def _safe_import(module_name: str) -> Any:
    try:
        return importlib.import_module(module_name)
    except Exception:  # pragma: no cover
        return None


_reportlab_colors = _safe_import("reportlab.lib.colors")
_reportlab_pagesizes = _safe_import("reportlab.lib.pagesizes")
_reportlab_styles = _safe_import("reportlab.lib.styles")
_reportlab_pdfgen_canvas = _safe_import("reportlab.pdfgen.canvas")
_reportlab_platypus = _safe_import("reportlab.platypus")

colors = _reportlab_colors
A4 = getattr(_reportlab_pagesizes, "A4", (595.27, 841.89))
landscape = getattr(_reportlab_pagesizes, "landscape", None)
getSampleStyleSheet = getattr(_reportlab_styles, "getSampleStyleSheet", None)
canvas = _reportlab_pdfgen_canvas
Paragraph = getattr(_reportlab_platypus, "Paragraph", None)
SimpleDocTemplate = getattr(_reportlab_platypus, "SimpleDocTemplate", None)
Spacer = getattr(_reportlab_platypus, "Spacer", None)
Table = getattr(_reportlab_platypus, "Table", None)
TableStyle = getattr(_reportlab_platypus, "TableStyle", None)


def _render_summary_pdf(path: Path, lines: list[str], title: str) -> None:
    if canvas is None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join(lines), encoding="utf-8")
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(path), pagesize=A4)
    _, height = A4
    left_margin = 42
    top = height - 48
    y = top
    line_height = 14

    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(left_margin, y, title)
    y -= 22
    pdf.setFont("Helvetica", 10)

    for line in lines:
        wrapped = textwrap.wrap(line, width=110) or [""]
        for row in wrapped:
            if y < 42:
                pdf.showPage()
                pdf.setFont("Helvetica", 10)
                y = top
            pdf.drawString(left_margin, y, row)
            y -= line_height

    pdf.save()


def _render_comparative_pdf(
    path: Path,
    contract_id: int,
    headers: list[str],
    rows: list[list[str]],
) -> None:
    if not rows or SimpleDocTemplate is None or Table is None or colors is None:
        lines = [
            f"Comparativo CT-{contract_id}",
            f"Generado: {datetime.now(timezone.utc).isoformat()}",
            "",
            "No hay lineas suficientes para renderizar tabla.",
        ]
        _render_summary_pdf(path, lines, "Comparativo de ofertas")
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    page_size = landscape(A4) if landscape else A4
    doc = SimpleDocTemplate(
        str(path),
        pagesize=page_size,
        leftMargin=24,
        rightMargin=24,
        topMargin=24,
        bottomMargin=24,
    )
    styles = getSampleStyleSheet()
    story: list[Any] = [
        Paragraph(f"Comparativo de ofertas - CT-{contract_id}", styles["Title"]),
        Spacer(1, 8),
        Paragraph(f"Generado: {datetime.now(timezone.utc).isoformat()}", styles["Normal"]),
        Spacer(1, 12),
    ]

    table_data = [headers] + rows
    col_widths = [50, 40, 240] + [85 for _ in headers[3:]]
    table = Table(table_data, repeatRows=1, colWidths=col_widths)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#9CA3AF")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
            ]
        )
    )
    story.append(table)
    doc.build(story)
