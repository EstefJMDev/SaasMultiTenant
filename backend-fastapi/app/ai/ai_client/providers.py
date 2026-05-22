import base64
import json
from typing import Any, Dict, Optional

from app.ai.errors import AIInvalidResponseError
from app.core.config import settings
from app.ai.ai_client.http import _health_check, _parse_headers, _post_generate
from app.ai.ai_client.parsers import (
    extract_json_block,
    normalize_comparative_json,
    normalize_invoice_json,
    _trim_comparative_text,
    _trim_invoice_text,
)
from app.ai.prompts import (
    COMPARATIVE_JSON_PROMPT,
    INVOICE_JSON_PROMPT,
    OCR_PROMPT,
)


class OllamaClient:
    """Cliente HTTP mínimo para Ollama remoto."""

    def __init__(self) -> None:
        self.base_url = settings.ollama_base_url.rstrip("/")
        self.default_headers = _parse_headers(settings.ollama_headers_json)

    def _post_generate(
        self,
        payload: Dict[str, Any],
        timeout: float,
        max_retries: int = 3,
    ) -> Dict[str, Any]:
        return _post_generate(
            self.base_url,
            self.default_headers,
            payload,
            timeout=timeout,
            max_retries=max_retries,
        )

    def health_check(self, timeout: float = 5.0) -> bool:
        """Check if Ollama service is available."""
        return _health_check(self.base_url, self.default_headers, timeout=timeout)

    def ocr_image_to_text(
        self,
        image_bytes: bytes,
        timeout_seconds: Optional[float] = None,
        max_retries: int = 3,
    ) -> str:
        """Extract text from image using OCR model."""
        encoded = base64.b64encode(image_bytes).decode("ascii")
        payload = {
            "model": settings.ollama_ocr_model,
            "prompt": OCR_PROMPT,
            "stream": False,
            "images": [encoded],
        }
        timeout = timeout_seconds if timeout_seconds is not None else settings.ollama_ocr_timeout_seconds
        data = self._post_generate(payload, timeout=timeout, max_retries=max_retries)
        return str(data.get("response", "")).strip()

    def invoice_text_to_json(
        self,
        text: str,
        timeout_seconds: Optional[float] = None,
        max_retries: int = 3,
    ) -> Dict[str, Any]:
        """Convert invoice text to structured JSON."""
        trimmed = _trim_invoice_text(text)
        full_text = text or ""

        payload = {
            "model": settings.ollama_json_model,
            "prompt": f"{INVOICE_JSON_PROMPT}\n\nTEXTO:\n{trimmed}\n",
            "stream": False,
        }

        timeout = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.ollama_json_timeout_seconds
        )
        data = self._post_generate(payload, timeout=timeout, max_retries=max_retries)
        response_text = str(data.get("response", "")).strip()

        json_text = extract_json_block(response_text)

        try:
            raw = json.loads(json_text)
        except json.JSONDecodeError as exc:
            raise AIInvalidResponseError(
                f"JSON inválido devuelto por el LLM: {json_text[:200]}"
            ) from exc

        return normalize_invoice_json(raw, fallback_text=full_text)

    def comparative_text_to_json(
        self,
        text: str,
        timeout_seconds: Optional[float] = None,
        max_retries: int = 1,
    ) -> Dict[str, Any]:
        """Convert comparative text to structured JSON."""
        trimmed = _trim_comparative_text(text)
        full_text = text or ""

        payload = {
            "model": settings.ollama_comparative_json_model or settings.ollama_json_model,
            "prompt": f"{COMPARATIVE_JSON_PROMPT}\n\nTEXTO:\n{trimmed}\n",
            "stream": False,
        }

        timeout = (
            timeout_seconds
            if timeout_seconds is not None
            else settings.ollama_comparative_json_timeout_seconds
        )
        data = self._post_generate(payload, timeout=timeout, max_retries=max_retries)
        response_text = str(data.get("response", "")).strip()
        json_text = extract_json_block(response_text)

        try:
            raw = json.loads(json_text)
        except json.JSONDecodeError as exc:
            raise AIInvalidResponseError(
                f"JSON inv?lido devuelto por el LLM: {json_text[:200]}"
            ) from exc

        return normalize_comparative_json(raw, fallback_text=full_text)
