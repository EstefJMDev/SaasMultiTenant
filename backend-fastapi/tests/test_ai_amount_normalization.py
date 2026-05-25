from app.ai.client import _normalize_amount


def test_normalize_amount_spanish_with_three_decimals() -> None:
    assert _normalize_amount("42,250") == 42.25
    assert _normalize_amount("21,900") == 21.9
    assert _normalize_amount("16,000") == 16.0


def test_normalize_amount_spanish_mixed_separators() -> None:
    assert _normalize_amount("43.500,60") == 43500.6
    assert _normalize_amount("3.797,46") == 3797.46
    assert _normalize_amount("9.027,20") == 9027.2
