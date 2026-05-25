from typing import Any, Dict

from app.core.config import settings
from app.ai.ai_client.parsers import (
    extract_json_block,
    normalize_comparative_json,
    normalize_invoice_json,
    _as_str_or_none,
    _find_supplier_name_by_tax_id,
    _find_supplier_name_in_header,
    _looks_like_bad_supplier_name,
    _looks_like_customer,
    _normalize_amount,
    _normalize_currency,
    _normalize_date,
    _normalize_tax_id,
    _regex_due_date,
    _regex_invoice_number,
    _trim_comparative_text,
    _trim_invoice_text,
)
from app.ai.prompts import PROMPT_VERSION
from app.ai.ai_client.providers import OllamaClient


def build_extraction_meta() -> Dict[str, Any]:
    """Build metadata about the extraction process."""
    return {
        "prompt_version": PROMPT_VERSION,
        "ocr_model": settings.ollama_ocr_model,
        "json_model": settings.ollama_json_model,
        "comparative_json_model": settings.ollama_comparative_json_model,
    }


__all__ = [
    "OllamaClient",
    "extract_json_block",
    "build_extraction_meta",
    "normalize_invoice_json",
    "normalize_comparative_json",
    "_looks_like_bad_supplier_name",
    "_looks_like_customer",
    "_as_str_or_none",
    "_normalize_tax_id",
    "_normalize_date",
    "_normalize_amount",
    "_normalize_currency",
    "_trim_invoice_text",
    "_trim_comparative_text",
    "_regex_invoice_number",
    "_regex_due_date",
    "_find_supplier_name_by_tax_id",
    "_find_supplier_name_in_header",
]
