from __future__ import annotations

from .anchors import _anchor_map_for, _line_buckets
from .placeholders import _fill_pdf_placeholders_exact
from .replacements import (
    _legacy_line_replacements,
    _legacy_phrase_replacements,
    _manual_template_line_replacements,
)
from .service import (
    _fill_suministro_template_precise,
    _fill_template_by_anchors,
    _patch_suministro_signature_page,
)

__all__ = [
    "_anchor_map_for",
    "_line_buckets",
    "_legacy_phrase_replacements",
    "_legacy_line_replacements",
    "_manual_template_line_replacements",
    "_fill_pdf_placeholders_exact",
    "_fill_template_by_anchors",
    "_fill_suministro_template_precise",
    "_patch_suministro_signature_page",
]
