from __future__ import annotations

from app.domains.documents.pdf_extract.anchors import _anchor_map_for, _line_buckets
from app.domains.documents.pdf_extract.placeholders import _fill_pdf_placeholders_exact
from app.domains.documents.pdf_extract.replacements import (
    _legacy_line_replacements,
    _legacy_phrase_replacements,
    _manual_template_line_replacements,
)
from app.domains.documents.pdf_extract.service import (
    _fill_template_by_anchors,
    _patch_suministro_signature_page,
)
from app.domains.documents.pdf_extract.suministro import _fill_suministro_template_precise

__all__ = [
    "_fill_pdf_placeholders_exact",
    "_fill_suministro_template_precise",
    "_fill_template_by_anchors",
    "_patch_suministro_signature_page",
    "_anchor_map_for",
    "_line_buckets",
    "_legacy_phrase_replacements",
    "_legacy_line_replacements",
    "_manual_template_line_replacements",
]
