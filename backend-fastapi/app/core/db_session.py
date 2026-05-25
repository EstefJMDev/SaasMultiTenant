from typing import Iterator, Optional

from sqlalchemy import text
from sqlmodel import Session, create_engine

from app.core.config import settings


def _is_sqlite(url: str) -> bool:
    return url.strip().lower().startswith("sqlite")


engine_options = {
    "echo": settings.debug,
    "future": True,
}

if not _is_sqlite(settings.database_url):
    engine_options.update(
        {
            "pool_size": settings.db_pool_size,
            "max_overflow": settings.db_max_overflow,
            "pool_pre_ping": settings.db_pool_pre_ping,
            "pool_recycle": settings.db_pool_recycle,
        }
    )


# Engine global para SQLModel / SQLAlchemy.
engine = create_engine(
    settings.database_url,
    **engine_options,
)


def get_session() -> Iterator[Session]:
    """
    Proveedor de sesiones de base de datos para FastAPI.

    FastAPI reconoce esta función generadora y se encarga
    de abrir y cerrar la sesión alrededor de cada petición.
    """

    with Session(engine) as session:
        try:
            yield session
            if session.in_transaction():
                session.commit()
        except Exception:
            if session.in_transaction():
                session.rollback()
            raise


def get_tenant_session(tenant_id: Optional[int]) -> Iterator[Session]:
    """
    Sesión con RLS activado para el tenant dado.

    Usa SET LOCAL para que el valor sea transaction-scoped:
    se resetea automáticamente en commit/rollback, seguro
    con connection pooling.

    Uso en endpoints:
        def get_db_tenant(
            tenant_id: int = Depends(...),
            session: Session = Depends(get_db),
        ) -> Iterator[Session]:
            yield from get_tenant_session(tenant_id)

    En SQLite (tests) no hay RLS; el SET se omite.
    """
    with Session(engine) as session:
        try:
            if tenant_id is not None and not _is_sqlite(str(engine.url)):
                session.execute(
                    text("SET LOCAL app.current_tenant_id = :tid"),
                    {"tid": str(tenant_id)},
                )
            yield session
            if session.in_transaction():
                session.commit()
        except Exception:
            if session.in_transaction():
                session.rollback()
            raise
