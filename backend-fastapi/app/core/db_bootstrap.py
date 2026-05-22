"""DB bootstrap shim. Delegates to app.core.db_bootstrap.runner."""

from __future__ import annotations

from app.core.db_bootstrap import init_db

__all__ = ["init_db"]
