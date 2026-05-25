"""
Canonical DB access surface for application code.

Use:
- `app.core.db_session` for engine/session internals.
- `app.core.db_bootstrap` package for init/bootstrap.

This module keeps convenient aliases (`get_db`, `get_session`, `engine`, `init_db`)
to avoid broad import churn.
"""

from typing import Iterator

from sqlmodel import Session

from app.core.db_bootstrap.runner import init_db
from app.core.db_session import engine, get_session, get_tenant_session


def get_db() -> Iterator[Session]:
    """
    Alias de sesion para el nuevo layout `app.core`.aa
    """

    yield from get_session()


__all__ = ["Session", "engine", "get_db", "get_session", "get_tenant_session", "init_db"]
