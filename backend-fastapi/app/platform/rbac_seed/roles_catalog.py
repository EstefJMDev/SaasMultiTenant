from __future__ import annotations

from typing import Dict, Iterable

from app.platform.rbac_seed.permissions_catalog import BASE_PERMISSION_KEYS


ROLE_PERMISSIONS: Dict[str, Iterable[str]] = {
    "super_admin": BASE_PERMISSION_KEYS,
    "tenant_admin": {
        "users:read",
        "users:create",
        "users:delete",
        "users:update",
        "tools:read",
        "tools:launch",
        "tools:configure",
        "audit:read",
    },
    "support": {
        "users:read",
        "tools:read",
        "tools:launch",
    },
    "user": {
        "tools:read",
        "tools:launch",
    },
}
