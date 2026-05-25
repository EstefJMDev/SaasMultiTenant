from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import inspect

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.db_session import engine  # noqa: E402


SYSTEM_SCHEMAS = {"information_schema", "pg_catalog", "pg_toast"}


def _split_table_name(value: str) -> tuple[str | None, str]:
    if "." in value:
        schema, table = value.split(".", 1)
        return schema, table
    return None, value


def _column_payload(column: dict[str, Any], primary_keys: set[str], fk_map: dict[str, str]) -> dict[str, Any]:
    return {
        "name": column["name"],
        "type": str(column["type"]),
        "nullable": bool(column.get("nullable", True)),
        "default": str(column.get("default")) if column.get("default") is not None else None,
        "primary_key": column["name"] in primary_keys,
        "foreign_key": fk_map.get(column["name"]),
    }


def _table_payload(inspector: Any, schema: str | None, table: str) -> dict[str, Any]:
    columns = inspector.get_columns(table, schema=schema)
    pk_constraint = inspector.get_pk_constraint(table, schema=schema) or {}
    primary_keys = set(pk_constraint.get("constrained_columns") or [])
    foreign_keys = inspector.get_foreign_keys(table, schema=schema)
    fk_map: dict[str, str] = {}
    for fk in foreign_keys:
        referred_schema = fk.get("referred_schema")
        referred_table = fk.get("referred_table")
        local_columns = fk.get("constrained_columns") or []
        remote_columns = fk.get("referred_columns") or []
        for local, remote in zip(local_columns, remote_columns):
            if referred_schema:
                fk_map[local] = f"{referred_schema}.{referred_table}.{remote}"
            else:
                fk_map[local] = f"{referred_table}.{remote}"

    return {
        "schema": schema or "public",
        "table": table,
        "columns": [_column_payload(column, primary_keys, fk_map) for column in columns],
        "foreign_keys": foreign_keys,
        "indexes": inspector.get_indexes(table, schema=schema),
        "unique_constraints": inspector.get_unique_constraints(table, schema=schema),
    }


def build_snapshot(table_filter: str | None = None, include_system_schemas: bool = False) -> list[dict[str, Any]]:
    engine.echo = False
    engine.echo_pool = False
    inspector = inspect(engine)

    if table_filter:
        schema, table = _split_table_name(table_filter)
        return [_table_payload(inspector, schema, table)]

    snapshot: list[dict[str, Any]] = []
    for schema in inspector.get_schema_names():
        if not include_system_schemas and schema in SYSTEM_SCHEMAS:
            continue
        for table in sorted(inspector.get_table_names(schema=schema)):
            snapshot.append(_table_payload(inspector, schema, table))
    return snapshot


def print_text(snapshot: list[dict[str, Any]]) -> None:
    for table_data in snapshot:
        print(f"[{table_data['schema']}.{table_data['table']}]")
        print("  Columnas:")
        for column in table_data["columns"]:
            markers: list[str] = []
            if column["primary_key"]:
                markers.append("PK")
            if column["foreign_key"]:
                markers.append(f"FK->{column['foreign_key']}")
            marker_text = f" [{' | '.join(markers)}]" if markers else ""
            default_text = f" default={column['default']}" if column["default"] is not None else ""
            nullable_text = "NULL" if column["nullable"] else "NOT NULL"
            print(f"    - {column['name']}: {column['type']} {nullable_text}{default_text}{marker_text}")

        if table_data["indexes"]:
            print("  Indices:")
            for index in table_data["indexes"]:
                names = ", ".join(index.get("column_names") or [])
                print(f"    - {index.get('name')}: ({names}) unique={bool(index.get('unique', False))}")

        if table_data["unique_constraints"]:
            print("  Unique constraints:")
            for constraint in table_data["unique_constraints"]:
                names = ", ".join(constraint.get("column_names") or [])
                print(f"    - {constraint.get('name')}: ({names})")

        if table_data["foreign_keys"]:
            print("  Foreign keys:")
            for fk in table_data["foreign_keys"]:
                local = ", ".join(fk.get("constrained_columns") or [])
                remote_cols = ", ".join(fk.get("referred_columns") or [])
                remote_schema = fk.get("referred_schema")
                remote_table = fk.get("referred_table")
                target = f"{remote_schema}.{remote_table}" if remote_schema else str(remote_table)
                print(f"    - {local} -> {target} ({remote_cols})")

        print()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Inspecciona la base de datos configurada y lista tablas, columnas, FKs e indices.",
    )
    parser.add_argument("--table", help="Tabla concreta. Acepta 'tabla' o 'schema.tabla'.")
    parser.add_argument("--json", action="store_true", help="Imprime la salida en JSON.")
    parser.add_argument(
        "--include-system-schemas",
        action="store_true",
        help="Incluye information_schema y catalogos internos.",
    )
    args = parser.parse_args()

    snapshot = build_snapshot(
        table_filter=args.table,
        include_system_schemas=args.include_system_schemas,
    )

    if args.json:
        print(json.dumps(snapshot, indent=2, ensure_ascii=False))
        return 0

    print_text(snapshot)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
