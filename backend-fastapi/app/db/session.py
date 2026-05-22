"""
Backward-compat import shim.

Prefer importing from `app.core.db` / `app.core.db_session` in new code.
"""

from app.core.db_bootstrap.runner import init_db  # noqa: F401
from app.core.db_session import engine, get_session  # noqa: F401

__all__ = ["engine", "get_session", "init_db"]
