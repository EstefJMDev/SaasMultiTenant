from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_CEILING
import re
import unicodedata
from typing import Any


def _format_amount(value: Any) -> str:
    amount = _to_decimal(value)
    if amount is None:
        return "-"
    return f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _to_decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            return None
        cleaned = cleaned.replace("EUR", "").replace("?", "").replace(" ", "")
        if "," in cleaned and "." in cleaned:
            if cleaned.rfind(",") > cleaned.rfind("."):
                cleaned = cleaned.replace(".", "").replace(",", ".")
            else:
                cleaned = cleaned.replace(",", "")
        elif "," in cleaned:
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
        try:
            return Decimal(cleaned)
        except (InvalidOperation, ValueError):
            return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    number = _to_decimal(value)
    if number is None:
        return None
    try:
        return int(number)
    except Exception:
        return None


def _parse_date_value(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        token = value.strip()
        if not token:
            return None
        token = token.split("T")[0]
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                return datetime.strptime(token, fmt).date()
            except ValueError:
                continue
    return None


def _add_years(base: date, years: int) -> date:
    target_year = base.year + years
    day = min(base.day, monthrange(target_year, base.month)[1])
    return date(target_year, base.month, day)


def _add_months(base: date, months: int) -> date:
    target_month = base.month - 1 + months
    year = base.year + target_month // 12
    month = target_month % 12 + 1
    day = min(base.day, monthrange(year, month)[1])
    return date(year, month, day)


def _human_duration_between(start_value: Any, end_value: Any) -> str:
    start = _parse_date_value(start_value)
    end = _parse_date_value(end_value)
    if start is None or end is None:
        return ""
    if end < start:
        start, end = end, start

    years = end.year - start.year
    anchor = _add_years(start, years)
    if anchor > end:
        years -= 1
        anchor = _add_years(start, years)

    months = 0
    while _add_months(anchor, months + 1) <= end:
        months += 1
    anchor = _add_months(anchor, months)

    days = (end - anchor).days

    chunks: list[str] = []
    if years:
        chunks.append(f"{years} {'ano' if years == 1 else 'anos'}")
    if months:
        chunks.append(f"{months} {'mes' if months == 1 else 'meses'}")
    if days:
        chunks.append(f"{days} {'dia' if days == 1 else 'dias'}")
    if not chunks:
        return "0 dias"
    if len(chunks) == 1:
        return chunks[0]
    if len(chunks) == 2:
        return f"{chunks[0]} y {chunks[1]}"
    return f"{chunks[0]}, {chunks[1]} y {chunks[2]}"


_UNITS_0_29: dict[int, str] = {
    0: "CERO",
    1: "UNO",
    2: "DOS",
    3: "TRES",
    4: "CUATRO",
    5: "CINCO",
    6: "SEIS",
    7: "SIETE",
    8: "OCHO",
    9: "NUEVE",
    10: "DIEZ",
    11: "ONCE",
    12: "DOCE",
    13: "TRECE",
    14: "CATORCE",
    15: "QUINCE",
    16: "DIECISEIS",
    17: "DIECISIETE",
    18: "DIECIOCHO",
    19: "DIECINUEVE",
    20: "VEINTE",
    21: "VEINTIUNO",
    22: "VEINTIDOS",
    23: "VEINTITRES",
    24: "VEINTICUATRO",
    25: "VEINTICINCO",
    26: "VEINTISEIS",
    27: "VEINTISIETE",
    28: "VEINTIOCHO",
    29: "VEINTINUEVE",
}

_TENS: dict[int, str] = {
    30: "TREINTA",
    40: "CUARENTA",
    50: "CINCUENTA",
    60: "SESENTA",
    70: "SETENTA",
    80: "OCHENTA",
    90: "NOVENTA",
}

_HUNDREDS: dict[int, str] = {
    100: "CIEN",
    200: "DOSCIENTOS",
    300: "TRESCIENTOS",
    400: "CUATROCIENTOS",
    500: "QUINIENTOS",
    600: "SEISCIENTOS",
    700: "SETECIENTOS",
    800: "OCHOCIENTOS",
    900: "NOVECIENTOS",
}


def _apocopate_uno(text: str) -> str:
    if text.endswith(" VEINTIUNO"):
        return f"{text[:-9]} VEINTIUN"
    if text.endswith(" Y UNO"):
        return f"{text[:-5]} Y UN"
    if text.endswith(" UNO"):
        return f"{text[:-4]} UN"
    if text == "UNO":
        return "UN"
    if text == "VEINTIUNO":
        return "VEINTIUN"
    return text


def _int_to_words_under_1000(number: int) -> str:
    if number < 30:
        return _UNITS_0_29[number]
    if number < 100:
        tens = (number // 10) * 10
        remainder = number % 10
        if remainder == 0:
            return _TENS[tens]
        return f"{_TENS[tens]} Y {_UNITS_0_29[remainder]}"
    if number == 100:
        return "CIEN"
    hundreds = (number // 100) * 100
    remainder = number % 100
    if hundreds == 100:
        prefix = "CIENTO"
    else:
        prefix = _HUNDREDS[hundreds]
    if remainder == 0:
        return prefix
    return f"{prefix} {_int_to_words_under_1000(remainder)}"


def _int_to_words_es(number: int) -> str:
    if number == 0:
        return "CERO"
    if number < 0:
        return f"MENOS {_int_to_words_es(abs(number))}"

    scales = [
        (1_000_000_000, "MIL MILLONES", "MIL MILLONES"),
        (1_000_000, "MILLON", "MILLONES"),
        (1_000, "MIL", "MIL"),
    ]

    remainder = number
    parts: list[str] = []
    for scale_value, singular, plural in scales:
        chunk = remainder // scale_value
        if chunk == 0:
            continue
        remainder %= scale_value
        if scale_value == 1_000:
            if chunk == 1:
                parts.append("MIL")
            else:
                parts.append(f"{_int_to_words_under_1000(chunk)} MIL")
            continue
        if chunk == 1:
            parts.append(f"UN {singular}")
        else:
            parts.append(f"{_int_to_words_es(chunk)} {plural}")

    if remainder:
        parts.append(_int_to_words_under_1000(remainder))
    return " ".join(parts).strip()


def _price_to_words_upper(value: Any) -> str:
    number = _to_decimal(value)
    if number is None:
        return "N/A"
    number = abs(number).quantize(Decimal("0.01"))
    integer_part = int(number)
    cents_part = int((number - Decimal(integer_part)) * 100)
    euros_words = _apocopate_uno(_int_to_words_es(integer_part))
    cents_words = _apocopate_uno(_int_to_words_es(cents_part))
    return f"{euros_words} EUROS CON {cents_words} CENTIMOS"


def _number_to_words_upper(value: Any) -> str:
    integer = _to_int(value)
    if integer is None:
        return "N/A"
    return _int_to_words_es(abs(integer))


def _compute_rc_insurance_amount(value: Any) -> str:
    number = _to_decimal(value)
    if number is None:
        return "N/A"
    number = abs(number)
    if number <= Decimal("100000"):
        coverage = Decimal("100000")
    else:
        blocks = (number / Decimal("500000")).to_integral_value(rounding=ROUND_CEILING)
        coverage = blocks * Decimal("500000")
    return _format_amount(coverage)


def _normalize_field_name(value: str) -> str:
    txt = unicodedata.normalize("NFKD", value or "")
    txt = "".join(ch for ch in txt if not unicodedata.combining(ch))
    txt = txt.lower().strip()
    txt = re.sub(r"[^a-z0-9]+", "_", txt)
    return txt.strip("_")
