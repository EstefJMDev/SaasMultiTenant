from __future__ import annotations

import re
from pathlib import Path


LEGACY_PREFIXES = ("erp:", "hr:", "contracts:")
REQUIRE_CALL_PATTERN = re.compile(
    r"require_(?:perm|permissions|any_permissions).*?(erp:|hr:|contracts:)",
    re.DOTALL,
)


def test_domains_do_not_use_legacy_permissions() -> None:
    base_dir = Path(__file__).resolve().parents[1] / "app" / "domains"
    matches: list[str] = []

    for path in base_dir.rglob("*.py"):
        content = path.read_text(encoding="utf-8")
        for match in REQUIRE_CALL_PATTERN.finditer(content):
            line_no = content.count("\n", 0, match.start()) + 1
            snippet = content[match.start() : match.end()].splitlines()[0][:120]
            matches.append(f"{path}:{line_no} -> {snippet}")

    assert not matches, "Legacy permissions found in app/domains:\n" + "\n".join(matches)
