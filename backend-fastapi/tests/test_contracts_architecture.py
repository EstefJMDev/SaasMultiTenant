import ast
from pathlib import Path


def _iter_python_files(root: Path) -> list[Path]:
    return [path for path in root.rglob("*.py") if path.is_file()]


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def test_no_external_imports_from_contracts_internal() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    app_root = repo_root / "app"
    contracts_root = app_root / "contracts"
    procurement_contracts_root = app_root / "domains" / "procurement" / "contracts"
    internal_prefix = "app.platform.contracts_core._internal"
    procurement_internal_prefix = "app.domains.procurement.contracts._internal"

    offenders: list[Path] = []
    for file_path in _iter_python_files(app_root):
        if _is_within(file_path, contracts_root):
            continue
        source = file_path.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source, filename=str(file_path))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith(internal_prefix):
                        offenders.append(file_path)
                        break
                    if alias.name.startswith(procurement_internal_prefix) and not _is_within(
                        file_path, procurement_contracts_root
                    ):
                        offenders.append(file_path)
                        break
            elif isinstance(node, ast.ImportFrom):
                if node.module and node.module.startswith(internal_prefix):
                    offenders.append(file_path)
                    break
                if node.module and node.module.startswith(procurement_internal_prefix):
                    if not _is_within(file_path, procurement_contracts_root):
                        offenders.append(file_path)
                        break

    assert not offenders, (
        "Imports from contracts _internal found outside allowed boundaries: "
        + ", ".join(str(path.relative_to(repo_root)) for path in offenders)
    )

