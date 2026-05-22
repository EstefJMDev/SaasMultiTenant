from __future__ import annotations

import ast
from pathlib import Path


FORBIDDEN_IMPORT_PREFIXES = (
    "app.api.v1.routes",
    "app.services",
)
FORBIDDEN_PERMISSION_PREFIXES = ("erp:", "hr:", "contracts:", "tickets:")
REQUIRE_FUNCS = {"require_perm", "require_permissions", "require_any_permissions"}
ALLOWLIST_DOMAIN_IMPORTS = {
    "domains/analytics/api.py",
    "domains/analytics/routers/dashboard.py",
    "domains/analytics/routers/simulations.py",
    "domains/analytics/routers/summary.py",
    "domains/invoices/api.py",
    "domains/time/api.py",
    "domains/time/repo.py",
    "domains/work/api.py",
    "domains/work/routers/external_collaborations.py",
    "domains/tickets/service.py",
}
FORBIDDEN_OCR_PRIVATE_PATTERNS = (".ocr.service._", "ocr_service._")


def _iter_py_files(root: Path) -> list[Path]:
    return [path for path in root.rglob("*.py") if path.is_file()]


def _load_ast(path: Path) -> ast.AST | None:
    try:
        return ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError:
        return None


def _collect_import_violations(domain_root: Path, app_root: Path) -> list[str]:
    violations: list[str] = []
    for path in _iter_py_files(domain_root):
        rel_path = path.relative_to(app_root).as_posix()
        if rel_path in ALLOWLIST_DOMAIN_IMPORTS:
            continue
        tree = _load_ast(path)
        if tree is None:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith(FORBIDDEN_IMPORT_PREFIXES):
                        violations.append(f"{path}:{node.lineno} -> import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if module.startswith(FORBIDDEN_IMPORT_PREFIXES):
                    violations.append(f"{path}:{node.lineno} -> from {module} import ...")
    return violations


def _extract_string_constants(node: ast.AST) -> list[str]:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        values: list[str] = []
        for elt in node.elts:
            values.extend(_extract_string_constants(elt))
        return values
    return []


def _collect_permission_string_violations(app_root: Path) -> list[str]:
    violations: list[str] = []
    for path in _iter_py_files(app_root):
        tree = _load_ast(path)
        if tree is None:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func_name = None
            if isinstance(node.func, ast.Name):
                func_name = node.func.id
            elif isinstance(node.func, ast.Attribute):
                func_name = node.func.attr
            if func_name not in REQUIRE_FUNCS:
                continue
            values: list[str] = []
            for arg in node.args:
                values.extend(_extract_string_constants(arg))
            for keyword in node.keywords:
                if keyword.value is not None:
                    values.extend(_extract_string_constants(keyword.value))
            for value in values:
                if value.startswith(FORBIDDEN_PERMISSION_PREFIXES):
                    violations.append(
                        f"{path}:{node.lineno} -> {func_name}({value!r})",
                    )
    return violations


def _collect_ocr_private_usage(app_root: Path) -> list[str]:
    ocr_root = app_root / "domains" / "invoices" / "ocr"
    violations: list[str] = []
    for path in _iter_py_files(app_root):
        try:
            path.relative_to(ocr_root)
            continue
        except ValueError:
            pass
        content = path.read_text(encoding="utf-8")
        for pattern in FORBIDDEN_OCR_PRIVATE_PATTERNS:
            if pattern in content:
                violations.append(f"{path} -> {pattern}")
                break
    return violations


def test_domains_do_not_import_legacy_routes_or_services() -> None:
    app_root = Path(__file__).resolve().parents[1] / "app"
    domain_root = app_root / "domains"
    violations = _collect_import_violations(domain_root, app_root)
    assert not violations, "Legacy imports in app/domains:\n" + "\n".join(violations)


def test_require_permissions_use_constants_not_legacy_strings() -> None:
    app_root = Path(__file__).resolve().parents[1] / "app"
    violations = _collect_permission_string_violations(app_root)
    assert not violations, "Legacy permission strings used in require_*:\n" + "\n".join(violations)


def test_ocr_service_private_helpers_not_used_externally() -> None:
    app_root = Path(__file__).resolve().parents[1] / "app"
    violations = _collect_ocr_private_usage(app_root)
    assert not violations, "Private OCR service helpers used outside OCR domain:\n" + "\n".join(violations)
