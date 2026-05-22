"""RBAC seed shim. Delegates to app.platform.rbac_seed."""

from __future__ import annotations

from app.platform.rbac_seed import BASE_PERMISSIONS, ROLE_PERMISSIONS, run_seed, seed_rbac

__all__ = [
    "BASE_PERMISSIONS",
    "ROLE_PERMISSIONS",
    "seed_rbac",
    "run_seed",
]


if __name__ == "__main__":
    run_seed()
