from pathlib import Path


def test_app_contracts_is_core_only() -> None:
    base = Path(__file__).resolve().parents[2] / "backend-fastapi" / "app" / "contracts"
    # If the legacy contracts core was removed, this guardrail should pass.
    if not base.exists():
        return
    # If the directory exists but is empty (e.g. removed from git but left on disk),
    # consider the core removed and pass.
    if base.is_dir() and not any(base.iterdir()):
        return
    # If only directories remain (e.g. templates/__pycache__), treat as removed.
    if base.is_dir() and not any(p.is_file() for p in base.iterdir()):
        return
    allowed = {
        "__init__.py",
        "models.py",
        "schemas.py",
        "permissions.py",
        "workflow.py",
    }

    files = {p.name for p in base.iterdir() if p.is_file()}

    assert files == allowed, (
        f"app/contracts must be core-only. "
        f"Expected {allowed}, found {files}"
    )
