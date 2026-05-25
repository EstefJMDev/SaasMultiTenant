import importlib


def test_procurement_service_removed() -> None:
    try:
        importlib.import_module("app.domains.procurement.service")
        assert False, "app.domains.procurement.service should not exist (removed)."
    except ModuleNotFoundError:
        assert True
