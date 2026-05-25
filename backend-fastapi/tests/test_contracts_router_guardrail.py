import importlib.util


def test_no_contracts_router_modules() -> None:
    forbidden = [
        "app.platform.contracts_core.router",
        "app.platform.contracts_core.public_router",
        "app.platform.contracts_core.contracts_router",
        "app.platform.contracts_core.comparatives_router",
        "app.platform.contracts_core.sync_router",
    ]
    for mod in forbidden:
        assert importlib.util.find_spec(mod) is None, f"{mod} should not exist"

