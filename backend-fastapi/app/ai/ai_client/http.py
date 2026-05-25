import json
import time
from typing import Any, Dict, Optional

import httpx

from app.ai.errors import AIInvalidResponseError, AIUnavailableError


def _parse_headers(headers_json: Optional[str]) -> Dict[str, str]:
    if not headers_json:
        return {}
    try:
        parsed = json.loads(headers_json)
    except json.JSONDecodeError as exc:
        raise AIInvalidResponseError("OLLAMA_HEADERS_JSON inv?lido") from exc
    if not isinstance(parsed, dict):
        raise AIInvalidResponseError("OLLAMA_HEADERS_JSON debe ser un objeto JSON")
    return {str(k): str(v) for k, v in parsed.items()}


def _post_generate(
    base_url: str,
    default_headers: Dict[str, str],
    payload: Dict[str, Any],
    *,
    timeout: float,
    max_retries: int = 3,
) -> Dict[str, Any]:
    url = f"{base_url}/api/generate"

    for attempt in range(max_retries):
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(url, json=payload, headers=default_headers)
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException as exc:
            if attempt == max_retries - 1:
                raise AIUnavailableError(
                    f"Timeout con Ollama despu?s de {max_retries} intentos"
                ) from exc
            time.sleep(1)
            continue
        except httpx.ConnectError as exc:
            raise AIUnavailableError(f"Error de conexi?n con Ollama: {exc}") from exc
        except httpx.HTTPError as exc:
            raise AIUnavailableError(f"Error HTTP con Ollama: {exc}") from exc

    return None


def _health_check(base_url: str, default_headers: Dict[str, str], timeout: float = 5.0) -> bool:
    url = f"{base_url}/api/tags"
    try:
        with httpx.Client(timeout=timeout) as client:
            client.get(url, headers=default_headers).raise_for_status()
        return True
    except httpx.HTTPError:
        return False
