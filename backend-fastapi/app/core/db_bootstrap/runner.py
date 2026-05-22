from sqlalchemy import inspect
from sqlmodel import SQLModel

from app.core.db_session import engine
from .enums import _ensure_enum_values
from .schema_legacy import _ensure_aux_columns, _ensure_legacy_columns
from .seeds_contracts import (
    _ensure_contract_approval_step_order,
    _seed_contract_workflow,
    _seed_default_departments,
    _seed_positions,
    _seed_universal_contract_templates,
)
from .sequences import _sync_sequences


def init_db() -> None:
    """
    Crea todas las tablas definidas en los modelos SQLModel.

    Nota: en un entorno real se recomienda usar Alembic para migraciones,
    pero esto permite levantar el entorno local r?pidamente.
    """

    from app.db import base  # noqa: F401  Import para registrar modelos

    SQLModel.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())

    _ensure_contract_approval_step_order(inspector, table_names)
    _ensure_legacy_columns(inspector, table_names)
    _ensure_aux_columns(inspector, table_names)
    _sync_sequences(inspector, table_names)
    _ensure_enum_values(inspector, table_names)
    _seed_contract_workflow(inspector, table_names)
    _seed_default_departments(inspector, table_names)
    _seed_positions(inspector, table_names)
    _seed_universal_contract_templates(inspector, table_names)
