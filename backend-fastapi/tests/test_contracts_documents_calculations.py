from decimal import Decimal

from app.domains.documents.service import (
    _compute_rc_insurance_amount,
    _contract_field_map,
    _human_duration_between,
    _number_to_words_upper,
    _price_to_words_upper,
)
from app.platform.contracts_core.models import Contract, ContractStatus, ContractType


def test_price_to_words_upper_formats_euros_and_cents() -> None:
    assert (
        _price_to_words_upper("1234,56")
        == "MIL DOSCIENTOS TREINTA Y CUATRO EUROS CON CINCUENTA Y SEIS CENTIMOS"
    )
    assert _price_to_words_upper(None) == "N/A"


def test_number_to_words_upper_for_workers() -> None:
    assert _number_to_words_upper(21) == "VEINTIUNO"
    assert _number_to_words_upper("") == "N/A"


def test_rc_insurance_amount_uses_expected_steps() -> None:
    assert _compute_rc_insurance_amount("99.999,99") == "100.000,00"
    assert _compute_rc_insurance_amount("100.000,01") == "500.000,00"
    assert _compute_rc_insurance_amount("1.200.000,00") == "1.500.000,00"


def test_human_duration_between_dates() -> None:
    assert _human_duration_between("2024-01-10", "2025-02-15") == "1 ano, 1 mes y 5 dias"
    assert _human_duration_between("2024-03-01", "2024-03-01") == "0 dias"


def test_contract_field_map_autocompletes_price_workers_duration_and_insurance() -> None:
    contract = Contract(
        tenant_id=1,
        created_by_id=1,
        type=ContractType.SERVICIO,
        status=ContractStatus.DRAFT,
        total_amount=Decimal("1200000.00"),
        contract_data={
            "schedule": {"start_date": "2024-01-10", "end_date": "2025-02-15"},
            "economic": {"total_execution_price": "1.200.000,00"},
            "resources": {"workers_count": 7},
            "additional": {},
        },
    )

    fields = _contract_field_map(contract)

    assert fields["precio_let"] == "UN MILLON DOSCIENTOS MIL EUROS CON CERO CENTIMOS"
    assert fields["num_trab_let"] == "SIETE"
    assert fields["duracion_contrato"] == "1 ano, 1 mes y 5 dias"
    assert fields["seguro_responsabilidad_civil"] == "1.500.000,00"

