import math
import re
from datetime import date
from typing import Any, Optional


def _looks_like_bad_supplier_name(name: Optional[str], invoice_number: Optional[str]) -> bool:
    """Check if extracted supplier name looks invalid."""
    if not name:
        return True

    up = name.upper()

    # Palabras que indican que no es un nombre de proveedor
    bad_keywords = [
        "FACTURA", "INVOICE", "NUM", "N?", "N?", "TOTAL", "IMPORTE",
        "CLIENTE", "CUSTOMER", "AMOUNT", "FECHA", "DATE"
    ]
    if any(keyword in up for keyword in bad_keywords):
        return True

    # Si contiene el n?mero de factura, probablemente no es el nombre
    if invoice_number and invoice_number.upper() in up:
        return True

    # Si tiene n?meros de 5+ d?gitos seguidos, probablemente no es nombre
    if re.search(r'\b\d{5,}\b', up):
        return True

    # Si es demasiado largo
    if len(name) > 80:
        return True

    # Si es muy corto (menos de 3 caracteres)
    if len(name.strip()) < 3:
        return True

    # Artefactos OCR frecuentes: prefijo de una sola letra ("E AENOR", "F EMPRESA", ...).
    compact = re.sub(r"\s+", " ", name.strip()).upper()
    if re.match(r"^[A-Z]\s+[A-Z0-9&.\-]{3,}$", compact):
        return True

    return False


def _looks_like_customer(name: Optional[str]) -> bool:
    """Check if name looks like customer instead of supplier."""
    if not name:
        return False
    up = name.upper()
    # A?ade aqu? nombres de clientes comunes en tu sistema
    customer_keywords = ["URDECON", "CONSTRUCCIONES"]
    return any(keyword in up for keyword in customer_keywords)


def _as_str_or_none(value: Any) -> Optional[str]:
    """Convert value to string or None."""
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _normalize_tax_id(value: Optional[str]) -> Optional[str]:
    """Normalize Spanish tax ID (NIF/CIF)."""
    if not value:
        return None
    # Eliminar espacios y caracteres especiales
    v = re.sub(r'[^A-Za-z0-9]', '', value).upper()
    # Remover prefijo ES si existe
    if v.startswith("ES"):
        v = v[2:]
    return v if v else None


def _normalize_date(value: Any) -> Optional[str]:
    """Normalize date to ISO format (YYYY-MM-DD)."""
    if isinstance(value, date):
        return value.isoformat()
    if not value:
        return None

    value_str = str(value).strip()

    # Intenta formato ISO primero (YYYY-MM-DD)
    iso_match = re.search(r'(\d{4})-(\d{2})-(\d{2})', value_str)
    if iso_match:
        y, m, d = map(int, iso_match.groups())
        try:
            return date(y, m, d).isoformat()
        except ValueError:
            pass

    # Formato europeo DD/MM/YYYY o DD-MM-YYYY
    eu_match = re.search(r'(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})', value_str)
    if eu_match:
        d, m, y = map(int, eu_match.groups())
        if y < 100:
            y += 2000
        try:
            return date(y, m, d).isoformat()
        except ValueError:
            # Si falla, intenta intercambiar d?a y mes (formato americano)
            try:
                return date(y, d, m).isoformat()
            except ValueError:
                pass

    # Formato con nombre de mes (ej: "15 de enero de 2024")
    month_names = {
        'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4,
        'mayo': 5, 'junio': 6, 'julio': 7, 'agosto': 8,
        'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12,
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12,
    }

    for month_name, month_num in month_names.items():
        if month_name in value_str.lower():
            # Buscar d?a y a?o
            day_match = re.search(r'\b(\d{1,2})\b', value_str)
            year_match = re.search(r'\b(20\d{2})\b', value_str)
            if day_match and year_match:
                try:
                    return date(int(year_match.group(1)), month_num, int(day_match.group(1))).isoformat()
                except ValueError:
                    pass

    return None


def _normalize_amount(value: Any) -> Optional[float]:
    """Normalize monetary amount to float."""
    if isinstance(value, (int, float)):
        result = float(value)
        if not math.isfinite(result) or result < 0:
            return None
        return result
    if not value:
        return None

    s = str(value).strip()

    # Eliminar s?mbolos de moneda
    s = re.sub(r'[?$??]', '', s).strip()

    # Eliminar espacios
    s = s.replace(' ', '')

    # Detectar formato europeo (1.234,56) vs americano (1,234.56)
    if ',' in s and '.' in s:
        # Tiene ambos separadores
        last_comma = s.rfind(',')
        last_dot = s.rfind('.')

        if last_comma > last_dot:
            # Formato europeo: 1.234,56 o 1.234.567,89
            s = s.replace('.', '').replace(',', '.')
        else:
            # Formato americano: 1,234.56
            s = s.replace(',', '')
    elif ',' in s:
        # Solo comas
        parts = s.split(',')
        if len(parts) == 2 and 1 <= len(parts[-1]) <= 3:
            # En comparativos aparece precio con 3 decimales: 42,250 -> 42.250
            s = s.replace(',', '.')
        else:
            # Probablemente separador de miles: 1,234
            s = s.replace(',', '')
    elif '.' in s:
        # Solo puntos
        parts = s.split('.')
        if len(parts) > 2:
            # Formato europeo con m?ltiples puntos: 1.234.567
            s = s.replace('.', '')
        elif len(parts) == 2 and len(parts[-1]) != 2:
            # Probablemente separador de miles europeo: 1.234
            s = s.replace('.', '')

    try:
        result = float(s)
        if not math.isfinite(result) or result < 0:
            return None
        return result
    except ValueError:
        return None


def _normalize_currency(value: Any, text: str) -> Optional[str]:
    """Normalize currency code."""
    if value:
        value_str = str(value).upper()
        if "EUR" in value_str or "?" in value_str:
            return "EUR"
        if "USD" in value_str or "$" in value_str:
            return "USD"
        if "GBP" in value_str or "?" in value_str:
            return "GBP"

    # Fallback: buscar en el texto
    if "?" in text or "EUR" in text.upper() or "EURO" in text.upper():
        return "EUR"
    if "$" in text or "USD" in text.upper() or "DOLLAR" in text.upper():
        return "USD"
    if "?" in text or "GBP" in text.upper() or "POUND" in text.upper():
        return "GBP"

    # Default para Espa?a
    return "EUR"


def _trim_invoice_text(text: str, max_chars: int = 9000) -> str:
    """Trim text to maximum length for LLM processing."""
    if not text:
        return ""
    return text[:max_chars]


def _trim_comparative_text(text: str, max_chars: int = 18000) -> str:
    """
    Comparativos suelen tener cabecera al inicio y totales/firmas al final.
    En vez de cortar solo por arriba, unimos inicio + final.
    """
    if not text:
        return ""
    if len(text) <= max_chars:
        return text

    half = max_chars // 2
    head = text[:half]
    tail = text[-half:]
    return f"{head}\n\n--- TRIM SPLIT ---\n\n{tail}"


def _regex_invoice_number(text: str) -> Optional[str]:
    """Extract invoice number using regex patterns."""
    # M?ltiples patrones para diferentes formatos de factura
    patterns = [
        r'\b[A-Z]{1,4}[-/]\d{4}[-/]\d+\b',  # FC-2024-001
        r'\b[A-Z]\d{1,4}[-/]\d+\b',          # A123-456
        r'\b\d{4}[-/]\d{3,}\b',              # 2024/001, 2024-123
        r'\bF[Aa]?[Cc]?[Tt]?[Uu]?[Rr]?[Aa]?\s*[Nn]?[??]?\s*:?\s*(\d+[-/]\d+)\b',  # FACTURA N?: 2024/001
        r'\b[Nn][??]?\s*(\d+[-/]\d+)\b',     # N? 2024/001
        r'\b[Nn]umber\s*:?\s*([A-Z0-9-/]+)\b',  # Number: INV-001
    ]

    for pattern in patterns:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            # Si el patr?n tiene grupo de captura, usar ese grupo
            return m.group(1) if m.lastindex else m.group(0).strip()

    return None


def _regex_due_date(text: str) -> Optional[str]:
    """Extract due date using regex."""
    # Buscar "vencimiento" o "due date" seguido de fecha
    patterns = [
        r'[Vv]encimiento\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        r'[Dd]ue\s+[Dd]ate\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        r'[Ff]echa\s+[Vv]encimiento\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
    ]

    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            return m.group(1)

    # Fallback: buscar cualquier fecha despu?s de mencionar vencimiento
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if 'vencimiento' in line.lower() or 'due date' in line.lower():
            # Buscar fecha en esta l?nea o las siguientes 2 l?neas
            for j in range(i, min(i + 3, len(lines))):
                date_match = re.search(r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b', lines[j])
                if date_match:
                    return date_match.group(1)

    return None


def _regex_total_amount(text: str) -> Optional[float]:
    """Extract total invoice amount from OCR text using robust label-first patterns."""
    if not text:
        return None

    patterns = [
        r"\bTOTAL\s+(?:FACTURA|A\s+PAGAR|PAGAR|DOCUMENTO)\b[^\n]{0,80}?([0-9][0-9\.,\s]{1,}[0-9])",
        r"\bIMPORTE\s+(?:TOTAL|FACTURA)\b[^\n]{0,80}?([0-9][0-9\.,\s]{1,}[0-9])",
        r"\bLIQUIDO\s+(?:FACTURA|TOTAL)\b[^\n]{0,80}?([0-9][0-9\.,\s]{1,}[0-9])",
        r"\bTOTAL\b[^\n]{0,80}?([0-9][0-9\.,\s]{1,}[0-9])",
    ]

    # 1) Prefer labelled totals.
    labelled_values: list[float] = []
    for pattern in patterns:
        for match in re.findall(pattern, text, flags=re.IGNORECASE):
            amount = _normalize_amount(match)
            if amount is not None and amount > 0:
                labelled_values.append(amount)
    if labelled_values:
        return max(labelled_values)

    # 2) Fallback: take the largest money-like token in text.
    generic_values: list[float] = []
    for token in re.findall(r"\b[0-9][0-9\.,\s]{1,}[0-9]\b", text):
        amount = _normalize_amount(token)
        if amount is not None and amount > 0:
            generic_values.append(amount)
    if generic_values:
        return max(generic_values)
    return None


def _find_supplier_name_by_tax_id(text: str, tax_id: str) -> Optional[str]:
    """Find supplier name near the tax ID in text."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    for i, line in enumerate(lines):
        # Buscar l?nea que contenga el tax_id (sin espacios)
        if tax_id in line.replace(" ", "").replace("-", ""):
            # Mirar l?neas anteriores (el nombre suele estar arriba)
            for offset in range(1, min(4, i + 1)):
                candidate = lines[i - offset]
                # Filtrar l?neas que parecen ser nombres v?lidos
                if (
                    len(candidate) > 3
                    and not re.search(r'^\d+$', candidate)  # No solo n?meros
                    and not any(kw in candidate.upper() for kw in ['FACTURA', 'CIF', 'NIF', 'TAX'])
                ):
                    return candidate

    return None


def _find_supplier_name_in_header(text: str) -> Optional[str]:
    """Find supplier name in document header (first lines)."""
    # Buscar en las primeras 30 l?neas
    for line in text.splitlines()[:30]:
        line = line.strip()
        # Buscar l?neas con S.L., S.A., S.L.U., etc.
        if re.search(r'\b(S\.?L\.?|S\.?A\.?|S\.?L\.?U\.?|LTD|LLC|INC)\b', line, re.IGNORECASE):
            # Verificar que tenga longitud razonable
            if 3 < len(line) < 80:
                return line

    return None
