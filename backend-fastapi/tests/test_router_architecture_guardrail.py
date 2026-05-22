from __future__ import annotations

from pathlib import Path


ALLOWLIST = {
    "api/v1/router.py",
    "domains/router.py",
    "platform/router.py",
}


def test_no_legacy_routers_outside_domains_platform() -> None:
    app_root = Path(__file__).resolve().parents[1] / "app"
    for py in app_root.rglob("*.py"):
        rel = py.relative_to(app_root).as_posix()
        if rel in ALLOWLIST:
            continue
        if rel.startswith("domains/") or rel.startswith("platform/"):
            continue
        content = py.read_text(encoding="utf-8")
        assert "APIRouter(" not in content, f"Router fuera de domains/platform: {rel}"
