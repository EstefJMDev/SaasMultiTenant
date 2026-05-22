from __future__ import annotations

from app.core.permissions import (
    PROCUREMENT_APPROVE,
    PROCUREMENT_CREATE,
    PROCUREMENT_EDIT,
    PROCUREMENT_READ,
    PROCUREMENT_REJECT,
)
from app.domains.procurement import repo


def resolve_contract_permission(method: str, path: str) -> str:
    method_upper = method.upper()
    normalized_path = path.lower()

    if method_upper in repo.READ_METHODS:
        return PROCUREMENT_READ
    if method_upper == "POST" and normalized_path.endswith("/contracts"):
        return PROCUREMENT_CREATE
    if any(hint in normalized_path for hint in repo.APPROVE_HINTS):
        return PROCUREMENT_APPROVE
    if any(hint in normalized_path for hint in repo.REJECT_HINTS):
        return PROCUREMENT_REJECT
    if any(hint in normalized_path for hint in repo.CREATE_HINTS):
        return PROCUREMENT_CREATE
    if any(hint in normalized_path for hint in repo.EDIT_HINTS):
        return PROCUREMENT_EDIT
    if method_upper in {"PATCH", "PUT", "DELETE"}:
        return PROCUREMENT_EDIT
    return PROCUREMENT_READ
