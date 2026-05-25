from __future__ import annotations

import re
import unicodedata
from typing import Optional


def _looks_like_customer_entity(value: Optional[str]) -> bool:
    if not value:
        return False
    up = value.upper()
    customer_markers = [
        "CLIENTE",
        "URDECON",
        "CONSTRUCCIONES URDECON",
    ]
    return any(marker in up for marker in customer_markers)


def _clean_supplier_name_candidate(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip(" .:-")
    cleaned = re.split(r"\b(N[ÂºO]\b|CIF\b|VAT\b|TEL[Ã‰E]FONO\b|TLF\b)", cleaned, maxsplit=1, flags=re.IGNORECASE)[0]
    cleaned = cleaned.strip(" .:-/")
    up_cleaned = cleaned.upper()
    if up_cleaned.startswith("DATOS DEL "):
        return None
    if up_cleaned in {"EMISOR", "PROVEEDOR", "CLIENTE", "DATOS", "DATOS DEL CUENTE"}:
        return None
    if not cleaned or _looks_like_customer_entity(cleaned):
        return None
    if len(cleaned) < 3:
        return None
    return cleaned


def _normalize_tax_id(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9]", "", value).upper()
    return cleaned or None


def _find_first_email(text: str) -> Optional[str]:
    match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
    return match.group(0) if match else None


def _find_first_phone(text: str) -> Optional[str]:
    match = re.search(r"(?:\+?\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,12}\d", text)
    if not match:
        return None
    return re.sub(r"\s+", " ", match.group(0)).strip()


def _extract_supplier_phone_fallback(text: str) -> Optional[str]:
    labeled = re.search(
        r"\b(?:TEL(?:[Ã‰E]FONO)?|TFNO|TLF)\b[^\d+]*(\+?\d[\d\s\.-]{7,}\d)",
        text,
        flags=re.IGNORECASE,
    )
    candidate = labeled.group(1) if labeled else _find_first_phone(text)
    if not candidate:
        return None
    digits = re.sub(r"\D", "", candidate)
    if digits.startswith("34") and len(digits) == 11:
        if digits[2] in {"6", "7", "8", "9"}:
            return candidate
        return None
    if len(digits) == 9 and digits[0] in {"6", "7", "8", "9"}:
        return candidate
    return None


def _find_spanish_tax_id(text: str) -> Optional[str]:
    # Formatos habituales: B12345678, 12345678Z, ESB12345678
    patterns = [
        r"\bES\s*([A-Z]\d{8})\b",
        r"\b([A-Z]\d{8})\b",
        r"\b(\d{8}[A-Z])\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            normalized = _normalize_tax_id(match.group(1))
            if normalized:
                return normalized
    return None


def _parse_amount_token(raw: Optional[str]) -> Optional[float]:
    if not raw:
        return None
    token = str(raw).strip().replace(" ", "")
    if not token:
        return None
    token = re.sub(r"[^0-9,.\-]", "", token)
    if not token:
        return None

    comma = token.rfind(",")
    dot = token.rfind(".")

    if comma != -1 and dot != -1:
        if comma > dot:
            token = token.replace(".", "").replace(",", ".")
        else:
            token = token.replace(",", "")
    elif comma != -1:
        token = token.replace(".", "").replace(",", ".")
    else:
        parts = token.split(".")
        if len(parts) > 2:
            token = "".join(parts[:-1]) + "." + parts[-1]

    try:
        return float(token)
    except ValueError:
        return None


def _extract_total_amount_fallback(text: str) -> Optional[float]:
    patterns = [
        "([0-9][0-9\\.,]{2,}[0-9])\\s*(?:â¬|€)",
        r"(?i)TOTAL\b[^\n]*\n[^\n]*([0-9][0-9\.,]{2,}[0-9])",
        r"TOTAL\s+FACTURA[^\n]*?([0-9][0-9\.,\s]{1,}[0-9])",
        r"IMPORTE\s+TOTAL[^\n]*?([0-9][0-9\.,\s]{1,}[0-9])",
        r"TOTAL\s+A\s+PAGAR[^\n]*?([0-9][0-9\.,\s]{1,}[0-9])",
        r"L[IÃ]QUIDO\s+FACTURA[^\n]*?([0-9][0-9\.,\s]{1,}[0-9])",
        r"TOTAL\s+OFERTADO\s+PROVEEDOR(?:\s*\(A\))?[^\n]*?([0-9][0-9\.,\s]{1,}[0-9])",
        r"TOTAL\s+OFERTA\s+PROVEEDOR[^\n]*?([0-9][0-9\.,\s]{1,}[0-9])",
        r"TOTAL\s+CAP[IÃ]TULO(?:\s+OFERTA)?[^\n]*?([0-9][0-9\.,\s]{1,}[0-9])",
        r"PRESUPUESTO\s+SIN\s+IVA(?:\.|:)?\s*(?:EUROS\.?)?\s*([0-9][0-9\.,\s]{1,}[0-9])",
        r"TOTAL\s+CAP[IÃ]TULO[^\n]*?([0-9][0-9\.,\s]{1,}[0-9])",
        r"TOTAL(?:\s+GENERAL)?[^\n]*?([0-9][0-9\.,\s]{1,}[0-9])",
        r"EUROS\.?\s*([0-9][0-9\.,\s]{1,}[0-9])",
    ]
    best: Optional[float] = None
    for pattern in patterns:
        matches = re.findall(pattern, text, flags=re.IGNORECASE)
        if not matches:
            continue
        for candidate in reversed(matches):
            amount = _parse_amount_token(candidate)
            if amount is not None and amount > 0:
                if best is None or amount > best:
                    best = amount
    return best


def _extract_supplier_name_fallback(text: str) -> Optional[str]:
    candidates = [
        r"CONFORME\s+([A-Z0-9ÃÃ‰ÃÃ“ÃšÃ‘ ,.&\-]{4,})",
        r"ACEPTADO\s+([A-Z0-9ÃÃ‰ÃÃ“ÃšÃ‘ ,.&\-]{4,})",
        r"PROVEEDOR\s+PROPUESTO\s*/\s*ACEPTADO\s+([A-Z0-9ÃÃ‰ÃÃ“ÃšÃ‘ ,.&\-]{4,})",
    ]
    for pattern in candidates:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        value = _clean_supplier_name_candidate(match.group(1))
        if value:
            return value
    return None


def _extract_supplier_name_from_labels(text: str) -> Optional[str]:
    patterns = [
        r"\bPROVEEDOR\b\s*[:\-]\s*([^\n]{3,80})",
        r"\bEMISOR\b\s*[:\-]\s*([^\n]{3,80})",
        r"\bRAZ[OÃ“]N\s+SOCIAL\b\s*(?:/|:|-)?\s*([^\n]{3,120})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        value = _clean_supplier_name_candidate(match.group(1))
        if value:
            return value
    return None


def _extract_supplier_name_from_header(text: str) -> Optional[str]:
    header_lines = [re.sub(r"\s+", " ", ln).strip(" .:-") for ln in text.splitlines()[:12]]
    company_hint = re.compile(
        r"\b(S\.?A\.?|S\.?L\.?|SOCIEDAD|CONSTRUCCIONES|SERVICIOS|INVERSIONES|GRUPO|FUNDACI[OÃ“]N|CENTRO|TECNOL[OÃ“]GICO)\b",
        flags=re.IGNORECASE,
    )
    cut_markers = re.compile(
        r"(C/|CALLE|AVDA|AVENIDA|POL\.|POLIGONO|P\.I\.|TEL|TLF|FAX|WWW\.|HTTP|@)",
        flags=re.IGNORECASE,
    )
    for line in header_lines:
        if len(line) < 4:
            continue
        if "FACTURA" in line.upper():
            continue
        if _looks_like_customer_entity(line):
            continue
        candidate = line
        cut = cut_markers.search(candidate)
        if cut:
            candidate = candidate[: cut.start()].strip(" .:-,")
        if not candidate:
            continue
        if re.search(r"\d{3,}", candidate):
            continue
        cleaned = _clean_supplier_name_candidate(candidate)
        if not cleaned:
            continue
        if company_hint.search(line):
            return cleaned
        token_count = len(cleaned.split())
        if token_count <= 4 and cleaned.upper() == cleaned and len(cleaned) >= 6:
            return cleaned
    return None


def _extract_issue_date_fallback(text: str) -> Optional[str]:
    patterns = [
        r"\bFECHA\s*[:\-]?\s*(\d{2}[/-]\d{2}[/-]\d{2,4})\b",
        r"\bF\.\s*EMISI[OÃ“]N\s*[:\-]?\s*(\d{2}[/-]\d{2}[/-]\d{2,4})\b",
        r"\bFECHA\s+FACTURA\s*[:\-]?\s*(\d{2}[/-]\d{2}[/-]\d{2,4})\b",
        r"(?m)^\s*[A-Z0-9][A-Z0-9\-/]{4,}\s+(\d{2}[/-]\d{2}[/-]\d{2,4})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            raw = match.group(1)
            m = re.match(r"(\d{2})[/-](\d{2})[/-](\d{2,4})$", raw)
            if not m:
                return raw
            day, month, year = m.groups()
            if len(year) == 2:
                year = f"20{year}"
            return f"{day}/{month}/{year}"
    any_date = re.search(r"\b(\d{2}[/-]\d{2}[/-]\d{2,4})\b", text)
    if not any_date:
        return None
    raw = any_date.group(1)
    m = re.match(r"(\d{2})[/-](\d{2})[/-](\d{2,4})$", raw)
    if not m:
        return raw
    day, month, year = m.groups()
    if len(year) == 2:
        year = f"20{year}"
    return f"{day}/{month}/{year}"


def _extract_due_date_fallback(text: str) -> Optional[str]:
    patterns = [
        r"\bVENCIM(?:IENTO|IENTOS?)\b[\s\S]{0,80}?(\d{2}[/-]\d{2}[/-]\d{2,4})\b",
        r"\bFECHA\s+VENCIMIENTO\b[\s\S]{0,80}?(\d{2}[/-]\d{2}[/-]\d{2,4})\b",
        r"\bDETALLE\s+DE\s+VENCIMIENTOS\b[\s\S]{0,120}?(\d{2}[/-]\d{2}[/-]\d{2,4})\b",
        r"(\d{2}[/-]\d{2}[/-]\d{2,4})\s*[\r\n]+\s*FECHA\s+VENCIMIENTO\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            raw = match.group(1)
            m = re.match(r"(\d{2})[/-](\d{2})[/-](\d{2,4})$", raw)
            if not m:
                return raw
            day, month, year = m.groups()
            if len(year) == 2:
                year = f"20{year}"
            return f"{day}/{month}/{year}"
    return None


def _extract_invoice_number_fallback(text: str) -> Optional[str]:
    forbidden_tokens = {"FECHA", "DATE", "INVOICE", "FACTURA", "CLIENTE", "CUSTOMER"}
    patterns = [
        r"\bN[ÂºOÂ°]\s*FACTURA\s*[:\-]?\s*([^\n]{2,40})",
        r"\bFACTURA\s*N[ÂºOÂ°]?\s*[:\-]?\s*([^\n]{2,40})",
        r"\bFACTURA\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-/]{2,30})\b",
        r"(?m)^\s*([A-Z]\d{1,3}-\d{2}-\d{3,6})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        raw = re.sub(r"\s+", " ", match.group(1)).strip(" .:-")
        compact = re.search(
            r"\b([A-Z]{0,4}\s*[-/]?\s*\d{2,10}[A-Z0-9/-]*)\b",
            raw,
            flags=re.IGNORECASE,
        )
        if compact:
            candidate = re.sub(r"\s+", " ", compact.group(1)).strip().upper()
            if candidate in forbidden_tokens:
                continue
            return candidate
        if raw:
            candidate = raw[:30].upper()
            if candidate in forbidden_tokens:
                continue
            return candidate
    return None


def _extract_supplier_tax_id_fallback(text: str) -> Optional[str]:
    def _first_tax_id_token(value: str) -> Optional[str]:
        compact = re.sub(r"[^A-Za-z0-9]", "", value.upper())
        candidates = re.findall(r"(?:ES)?[A-Z]\d{8}|\d{8}[A-Z]", compact, flags=re.IGNORECASE)
        for token in candidates:
            normalized = _normalize_tax_id(token)
            if normalized:
                return normalized
        return None

    # Preferencia por etiquetas del emisor/proveedor.
    labelled_patterns = [
        r"\bC\.?\s*I\.?\s*F\.?\s*[:]\s*([A-Z0-9\-. ]{8,16})",
        r"\bRAZ[OÃ“]N\s+SOCIAL[^\n]{0,140}?\bCIF\s*([A-Z0-9\-. ]{8,40})",
        r"\bEMISOR[^\n]{0,120}?\b(?:CIF|NIF)\s*[:\-]?\s*([A-Z0-9\-. ]{8,16})",
        r"\bPROVEEDOR[^\n]{0,120}?\b(?:CIF|NIF)\s*[:\-]?\s*([A-Z0-9\-. ]{8,16})",
    ]
    customer_markers = ("CLIENTE", "EMPRESA", "CONSTRUCCIONES URDECON", "URDECON")
    for pattern in labelled_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            start, end = match.span()
            context = text[max(0, start - 80): min(len(text), end + 120)].upper()
            if any(marker in context for marker in customer_markers):
                continue
            value = _first_tax_id_token(match.group(1))
            if value:
                return value

    # Fallback genÃ©rico, evitando contexto de cliente.
    generic = re.finditer(r"\b(?:ES\s*)?([A-Z]\d{8}|\d{8}[A-Z])\b", text, flags=re.IGNORECASE)
    for match in generic:
        start, end = match.span()
        context = text[max(0, start - 80): min(len(text), end + 80)].upper()
        if any(marker in context for marker in customer_markers):
            continue
        value = _normalize_tax_id(match.group(1))
        if value:
            return value
    return None

def _supplier_name_from_filename(filename: Optional[str]) -> Optional[str]:
    if not filename:
        return None
    base = re.sub(r"\.[^.]+$", "", filename)
    cleaned = re.sub(r"[_\-]+", " ", base)
    # Limpia prefijos habituales no informativos (fecha, "oferta", etc.).
    cleaned = re.sub(r"^\s*\d{6,8}\s+", "", cleaned)
    cleaned = re.sub(r"^\s*(OFERTA|PRESUPUESTO|COMPARATIVO|DOC|DOCUMENTO)\s+", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+(OFERTA|PRESUPUESTO|COMPARATIVO)\s*$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return None
    # Evita usar nombres claramente no informativos.
    up = cleaned.upper()
    if up in {"OFERTA", "COMPARATIVO", "DOCUMENTO", "PDF"}:
        return None
    return cleaned


def _provider_name_from_comparative(payload: Optional[dict]) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    providers = payload.get("providers")
    if not isinstance(providers, list):
        return None
    for provider in providers:
        if not isinstance(provider, dict):
            continue
        name = str(provider.get("name") or "").strip()
        if not name:
            continue
        up = name.upper()
        if up in {"PROVEEDOR", "SUPPLIER", "OFERTA", "COMPARATIVO"}:
            continue
        return name
    return None


def _extract_invoice_fallback(text: str) -> dict:
    upper = text.upper()
    amount = _extract_total_amount_fallback(text)
    currency = "EUR" if ("â‚¬" in text or "EURO" in upper or "EUR" in upper) else None
    supplier_name = (
        _extract_supplier_name_from_labels(text)
        or _extract_supplier_name_from_header(text)
        or _extract_supplier_name_fallback(text)
    )
    if _looks_like_customer_entity(supplier_name):
        supplier_name = None
    supplier_tax_id = _extract_supplier_tax_id_fallback(text)
    supplier_email = _find_first_email(text)
    supplier_phone = _extract_supplier_phone_fallback(text)
    invoice_number = _extract_invoice_number_fallback(text)
    issue_date = _extract_issue_date_fallback(text)
    due_date = _extract_due_date_fallback(text)
    if due_date is None:
        due_match = re.search(r"\bTRANSFERENCIA\b[\s\S]{0,30}?(\d{2}[/-]\d{2}[/-]\d{2,4})\b", text, flags=re.IGNORECASE)
        if due_match:
            d = due_match.group(1)
            m = re.match(r"(\d{2})[/-](\d{2})[/-](\d{2,4})$", d)
            if m:
                day, month, year = m.groups()
                if len(year) == 2:
                    year = f"20{year}"
                due_date = f"{day}/{month}/{year}"
    return {
        "supplier_name": supplier_name,
        "supplier_tax_id": supplier_tax_id,
        "supplier_email": supplier_email,
        "supplier_phone": supplier_phone,
        "invoice_number": invoice_number,
        "issue_date": issue_date,
        "due_date": due_date,
        "total_amount": amount,
        "currency": currency,
        "concept": None,
    }


def _clean_description(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    text = re.sub(r"^(?:\W+|\d+\s+)", "", text).strip()
    cut_markers = [
        "Criterio de mediciÃ³n",
        "Criterio de medicion",
        "Incluye:",
        "Incluido:",
        "Observaciones:",
        "OBSERVACIONES",
    ]
    for marker in cut_markers:
        idx = text.lower().find(marker.lower())
        if idx != -1:
            text = text[:idx].strip()
    parts = [p.strip() for p in re.split(r"\.\s+", text) if p.strip()]
    if parts:
        text = parts[0]
    text = text[:160].strip()
    return text or None


def _extract_comparative_fallback(text: str) -> dict:
    def _normalize_name_token(value: str) -> str:
        normalized = unicodedata.normalize("NFKD", value)
        normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
        return re.sub(r"\s+", " ", normalized).strip()

    def _extract_provider_name() -> Optional[str]:
        skip_patterns = (
            "COMPARATIVO",
            "OFERTA",
            "PRECIO",
            "IMPORTE",
            "MED",
            "UD",
            "DESCRIP",
            "TLF",
            "TELEF",
            "COD",
            "OBRA",
            "CAPITULO",
        )
        for raw_line in text.splitlines()[:80]:
            line = re.sub(r"\s+", " ", raw_line).strip(" .:-")
            if len(line) < 3:
                continue
            upper_line = _normalize_name_token(line).upper()
            if any(token in upper_line for token in skip_patterns):
                continue
            if not re.search(r"[A-ZÃÃ‰ÃÃ“ÃšÃ‘]", line, flags=re.IGNORECASE):
                continue
            if re.fullmatch(r"[0-9\.,]+", line):
                continue
            return line
        return None

    def _extract_lines(provider_name: Optional[str]) -> list[dict]:
        lines: list[dict] = []
        pending_description_parts: list[str] = []
        unit_re = re.compile(r"^(?P<unit>[A-Za-z]{1,6}\.?|m2|m3|mÂ²|mÂ³|kg|uds?|ml|cm|mm|m|l|h)\b\.?", re.IGNORECASE)
        # PatrÃ³n estricto para lÃ­neas de comparativo/presupuesto:
        # "... <cantidad> <precio_unitario> <importe>" con decimales europeos.
        amount_token = r"-?\d{1,3}(?:[\.,]\d{3})*(?:[\.,]\d{1,3})?|-?\d+(?:[\.,]\d{1,3})?"
        numeric_triplet_re = re.compile(
            rf"(?P<qty>{amount_token})"
            r"(?:\s*[\]\)\|]\s*|\s+)"
            r"(?P<middle>.*?)"
            rf"(?P<price>{amount_token})\s+"
            rf"(?P<total>{amount_token})"
        )
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            match = numeric_triplet_re.search(line)
            if not match:
                pending_description_parts.append(line)
                continue
            qty = _parse_amount_token(match.group("qty"))
            price = _parse_amount_token(match.group("price"))
            total = _parse_amount_token(match.group("total"))
            if qty is None or total is None:
                continue
            middle = match.group("middle") or ""
            unit = None
            middle_clean = middle.strip()
            unit_match = unit_re.match(middle_clean)
            if unit_match:
                unit = unit_match.group("unit")
                middle_clean = middle_clean[unit_match.end() :].strip()

            description = _clean_description(" ".join(pending_description_parts))
            pending_description_parts = []
            if not description:
                description = _clean_description(middle_clean)
            if not description:
                continue
            lines.append(
                {
                    "descripcion": description,
                    "cantidad": qty,
                    "unidad": unit,
                    "prices": [
                        {
                            "proveedor": provider_name,
                            "precio_unitario": price,
                            "importe": total,
                        }
                    ],
                    "precio_unitario": price,
                    "importe": total,
                    "proveedor": provider_name,
                }
            )
        return lines

    provider_name = _extract_provider_name()
    lines = _extract_lines(provider_name)

    totales = {
        "total_ofertado_proveedor": _extract_total_amount_fallback(text),
        "forma_pago": None,
        "garantias": None,
        "plazos": None,
    }
    if totales["total_ofertado_proveedor"] is None and lines:
        computed_total = 0.0
        has_amounts = False
        for line in lines:
            amount = line.get("importe")
            if amount is None and isinstance(line.get("prices"), list) and line["prices"]:
                amount = line["prices"][0].get("importe")
            if isinstance(amount, (int, float)):
                computed_total += float(amount)
                has_amounts = True
        if has_amounts:
            totales["total_ofertado_proveedor"] = computed_total
    return {
        "providers": [{"name": provider_name}] if provider_name else [],
        "lines": lines,
        "totales": totales,
    }


def _attach_provider_to_comparative(payload: dict, provider_name: Optional[str]) -> dict:
    if not isinstance(payload, dict):
        return payload
    if not provider_name:
        return payload
    providers = payload.get("providers")
    if not isinstance(providers, list):
        providers = []
    if not any(
        isinstance(item, dict) and str(item.get("name") or "").strip() == provider_name
        for item in providers
    ):
        providers.append({"name": provider_name})
    payload["providers"] = providers
    return payload


def _looks_like_comparative_text(text: str) -> bool:
    if not text:
        return False
    upper = text.upper()
    keywords = (
        "COMPARATIVO",
        "OFERTA",
        "PRESUPUESTO",
        "CAPITULO",
        "MED",
        "IMPORTE",
        "DESCRIP",
        "UNIDAD",
        "UD",
        "SUBTOTAL",
    )
    hits = sum(1 for key in keywords if key in upper)
    return hits >= 2


def _has_comparative_lines(payload: Optional[dict]) -> bool:
    if not isinstance(payload, dict):
        return False
    lines = payload.get("lines")
    return isinstance(lines, list) and len(lines) > 0


_MANUAL_PROTECTED_TOP_KEYS = {"obra_numero", "obra_nombre", "jefe_obra"}
_MANUAL_PROTECTED_HEADER_KEYS = {"obra_num", "obra_nombre", "jefe_obra"}


def _is_truthy_value(value) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return bool(value)


def _merge_comparative_data(existing: Optional[dict], incoming: dict) -> dict:
    if not isinstance(existing, dict):
        existing = {}
    merged = dict(existing)
    for key, value in incoming.items():
        if value is None:
            continue
        if key == "lines":
            if isinstance(value, list) and value:
                merged[key] = value
            continue
        if key == "providers":
            if isinstance(value, list) and value:
                merged[key] = value
            continue
        if key == "totales":
            merged_totales = dict(merged.get("totales") or {})
            if isinstance(value, dict):
                for total_key, total_value in value.items():
                    if total_value is not None:
                        merged_totales[total_key] = total_value
            merged["totales"] = merged_totales
            continue
        if key == "header" and isinstance(value, dict):
            # Deep-merge del header. Obra/jefe rellenados manualmente nunca
            # se pisan con lo que extraiga el OCR.
            existing_header = dict(merged.get("header") or {})
            for h_key, h_value in value.items():
                if h_value is None:
                    continue
                if (
                    h_key in _MANUAL_PROTECTED_HEADER_KEYS
                    and _is_truthy_value(existing_header.get(h_key))
                ):
                    continue
                existing_header[h_key] = h_value
            merged["header"] = existing_header
            continue
        if (
            key in _MANUAL_PROTECTED_TOP_KEYS
            and _is_truthy_value(merged.get(key))
        ):
            # Valor manual ya presente: no lo sobrescribimos con OCR.
            continue
        merged[key] = value
    return merged


def _parse_spanish_address(raw: Optional[str]) -> dict:
    if not raw:
        return {"address": None, "city": None, "postal_code": None, "country": None}

    text = " ".join(raw.replace("\n", " ").split())
    postal_match = re.search(r"\b(\d{5})\b", text)
    postal_code = postal_match.group(1) if postal_match else None

    country = None
    if re.search(r"\b(ESPANA|ESPAÃ‘A|SPAIN)\b", text, re.IGNORECASE):
        country = "EspaÃ±a"

    city = None
    address = text

    if postal_code:
        parts = re.split(r"\b" + re.escape(postal_code) + r"\b", text, maxsplit=1)
        left = parts[0].strip(" ,;-")
        right = parts[1].strip(" ,;-") if len(parts) > 1 else ""
        address = left if left else text
        if right:
            city = right.split(",")[0].strip()
    else:
        parts = [p.strip() for p in text.split(",") if p.strip()]
        if len(parts) >= 2:
            address = ", ".join(parts[:-1])
            city = parts[-1]

    if not country:
        country = "EspaÃ±a"

    return {
        "address": address or None,
        "city": city or None,
        "postal_code": postal_code,
        "country": country,
    }
