from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_CEILING
from typing import Any, Optional


def _to_decimal(value: Any) -> Optional[Decimal]:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return None
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    compact = raw.replace(" ", "")
    if "," in compact and "." in compact:
        if compact.rfind(",") > compact.rfind("."):
            normalized = compact.replace(".", "").replace(",", ".")
        else:
            normalized = compact.replace(",", "")
    elif "," in compact:
        normalized = compact.replace(".", "").replace(",", ".")
    else:
        normalized = compact.replace(",", "")
    try:
        return Decimal(normalized)
    except (InvalidOperation, ValueError):
        return None


def compute_subcontract_insurance_amount(value: Any) -> Optional[Decimal]:
    amount = _to_decimal(value)
    if amount is None:
        return None
    amount = abs(amount)
    if amount <= Decimal("100000"):
        return Decimal("100000.00")
    blocks = (amount / Decimal("500000")).to_integral_value(rounding=ROUND_CEILING)
    return (blocks * Decimal("500000")).quantize(Decimal("0.01"))


def normalize_insurance_amount(value: Any) -> Optional[Decimal]:
    amount = _to_decimal(value)
    if amount is None:
        return None
    return abs(amount).quantize(Decimal("0.01"))


def format_insurance_amount_es(value: Any) -> str:
    amount = _to_decimal(value)
    if amount is None:
        return ""
    quantized = abs(amount).quantize(Decimal("0.01"))
    rendered = f"{quantized:,.2f}"
    return rendered.replace(",", "X").replace(".", ",").replace("X", ".")
