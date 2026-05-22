from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.core.config import settings


def _public_contract_document_path(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    if path.startswith("/static/"):
        return path
    try:
        raw = Path(path)
        base = Path(settings.contracts_storage_path)
        relative = raw.relative_to(base)
        relative_str = str(relative).replace("\\", "/")
        return f"/static/contracts/{relative_str}"
    except Exception:
        return path
