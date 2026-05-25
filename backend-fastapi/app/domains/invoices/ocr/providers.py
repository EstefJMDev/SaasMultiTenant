from __future__ import annotations

from app.ai.client import OllamaClient


def get_ollama_client() -> OllamaClient:
    return OllamaClient()
