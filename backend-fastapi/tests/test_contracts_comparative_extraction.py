from app.ai.client import normalize_comparative_json
from app.domains.invoices.ocr.service import (
    extract_comparative_fallback,
    provider_name_from_comparative,
    supplier_name_from_filename,
)


def test_supplier_name_from_filename_is_generic_and_clean() -> None:
    assert supplier_name_from_filename("20250425_COPERTAIN.pdf") == "COPERTAIN"
    assert supplier_name_from_filename("OFERTA_ACEROS-DEL-SUR_2025.pdf") == "ACEROS DEL SUR 2025"
    assert supplier_name_from_filename("DOCUMENTO.pdf") is None


def test_provider_name_from_comparative_prefers_real_name() -> None:
    payload = {
        "providers": [
            {"name": "Proveedor"},
            {"name": " ACEROS DEL SUR S.L. "},
        ]
    }
    assert provider_name_from_comparative(payload) == "ACEROS DEL SUR S.L."


def test_normalize_comparative_json_accepts_field_variants() -> None:
    raw = {
        "providers": ["NORTE CUBIERTAS S.L."],
        "lines": [
            {
                "cod": "01.01",
                "med": "1.029,60",
                "ud": "Ud.",
                "partida": "Panel sandwich 60 mm",
                "precio": "48,90",
                "importe_total": "50.347,44",
            }
        ],
    }
    normalized = normalize_comparative_json(raw)
    assert normalized["providers"][0]["name"] == "NORTE CUBIERTAS S.L."
    line = normalized["lines"][0]
    assert line["cod_capitulo"] == "01.01"
    assert line["cantidad"] == 1029.6
    assert line["unidad"] == "Ud."
    assert "Panel sandwich" in (line["descripcion"] or "")
    assert line["prices"][0]["precio_unitario"] == 48.9
    assert line["prices"][0]["importe"] == 50347.44


def test_extract_comparative_fallback_parses_generic_offer_text() -> None:
    text = """
    ACEROS DEL SUR S.L.
    OFERTA
    Med. Ud. Descripcion Precio Importe
    Cubierta panel tipo sándwich para nave industrial
    1.029,60 Ud. Panel sandwich con remates y fijaciones 48,90 50.347,44
    Canalón prelacado
    173,40 Ud. Canalón con ganchos 31,250 5.418,75
    """
    payload = extract_comparative_fallback(text)
    assert isinstance(payload, dict)
    assert len(payload.get("lines") or []) >= 2
    first = payload["lines"][0]
    assert first["cantidad"] == 1029.6
    assert first["unidad"] in ("Ud", "Ud.", "UD", "UD.")
    assert first["prices"][0]["precio_unitario"] == 48.9
    assert first["prices"][0]["importe"] == 50347.44
    assert payload.get("totales", {}).get("total_ofertado_proveedor") is not None
