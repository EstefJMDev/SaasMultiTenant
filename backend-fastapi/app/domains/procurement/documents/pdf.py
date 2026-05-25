from __future__ import annotations

from typing import Any, Optional, Tuple


def get_pypdf() -> Tuple[Optional[Any], Optional[Any]]:
    try:
        from pypdf import PdfReader, PdfWriter  # type: ignore
    except Exception:  # pragma: no cover
        return None, None
    return PdfReader, PdfWriter


def get_reportlab() -> Tuple[Tuple[float, float], Optional[Any], Optional[Any]]:
    try:
        from reportlab.lib.pagesizes import A4  # type: ignore
        from reportlab.lib.utils import ImageReader  # type: ignore
        from reportlab.pdfgen import canvas as pdf_canvas  # type: ignore
    except Exception:  # pragma: no cover
        return (595.27, 841.89), None, None
    return A4, ImageReader, pdf_canvas
