"""Utilidades de procesamiento OCR/imagen para el servicio de Telegram.

Separado de service.py para mantener la lógica de análisis de imágenes
independiente del protocolo Telegram.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class TelegramImageResult:
    description: str
    ocr_text: str
    width: int
    height: int
    mode: str


def clean_ocr_text(value: str) -> str:
    """Elimina líneas de ruido típicas del OCR (teclas de teclado, artefactos)."""
    if not value:
        return ""
    noise_words = {
        "alt",
        "ctrl",
        "gr",
        "shift",
        "enter",
        "esc",
        "tab",
        "ps",
    }
    cleaned_lines: list[str] = []
    for raw_line in value.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if len(line) == 1 and line.lower() not in {"a", "e", "i", "o", "u"}:
            continue
        lowered = line.lower()
        if lowered in noise_words:
            continue
        if lowered.count("ctrl") or lowered.count("alt gr"):
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines).strip()


def score_ocr_text(value: str) -> int:
    """Puntúa la calidad del texto OCR extraído. Mayor puntuación = mejor texto."""
    if not value:
        return 0
    # Match Unicode letters (no digits/underscore), 2+ chars per token.
    letters = re.findall(r"[^\W\d_]{2,}", value, flags=re.UNICODE)
    if not letters:
        return 0
    score_words = sum(min(len(word), 12) for word in letters)
    score_unique = len(set(word.lower() for word in letters)) * 3
    score_lines = len([ln for ln in value.splitlines() if ln.strip()]) * 2
    alpha_chars = len(re.findall(r"[^\W\d_]", value, flags=re.UNICODE))
    total_chars = max(1, len(value))
    alpha_ratio = alpha_chars / total_chars
    ratio_bonus = int(alpha_ratio * 40)
    low_ratio_penalty = 25 if alpha_ratio < 0.45 else 0
    single_char_penalty = len(re.findall(r"\b\w\b", value)) * 4
    multiline_penalty = 20 if value.count("\n") > 8 else 0
    lowered = value.lower()
    noise_penalty = 0
    for token in ("ctrl", "alt", "alt gr", "shift", "enter", "tab", "esc", "gr"):
        noise_penalty += lowered.count(token) * 12
    return max(
        0,
        score_words
        + score_unique
        + score_lines
        + ratio_bonus
        - low_ratio_penalty
        - single_char_penalty
        - multiline_penalty
        - noise_penalty,
    )

