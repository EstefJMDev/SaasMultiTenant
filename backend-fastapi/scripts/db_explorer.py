"""
Visor de BBDD (solo lectura) para inspeccionar el esquema y el contenido.

La carpeta scripts/ no esta copiada en la imagen del backend, asi que el
flujo recomendado es copiarlo al contenedor y ejecutarlo:

    docker cp backend-fastapi/scripts/db_explorer.py saas2-backend-fastapi:/tmp/db_explorer.py
    docker exec -it -e PYTHONPATH=/app saas2-backend-fastapi python /tmp/db_explorer.py <comando>

Comandos:
    tables                       Listar tablas con conteo de filas
    schema <tabla>               Columnas, PK, FK e indices
    sample <tabla> [--limit N]   Primeras N filas
    count  <tabla>               Solo el conteo
    search <texto>               Busca subcadena en nombres de tabla/columna
    query  "SELECT ..."          SELECT/WITH arbitrario (solo lectura)

Alternativa rapida: usar el helper `infra/db-explorer.ps1`.

Restricciones:
- Solo SELECT/WITH (cualquier otra sentencia se rechaza).
- Cada conexion se abre con `SET TRANSACTION READ ONLY`.
- Pensado para superadmin/owner; no expone API ni UI.
"""

from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal
from datetime import date, datetime, time
from typing import Any, Iterable
from uuid import UUID

from sqlalchemy import inspect, text
from sqlalchemy.engine import Row

from app.core.db_session import engine

# Silenciar el echo del engine (en local viene activado) para que la salida
# del visor sea solo la informacion solicitada.
engine.echo = False
engine.echo_pool = False


# ---------- helpers ----------

def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return f"{value:f}"
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return f"<{len(bytes(value))} bytes>"
    if isinstance(value, (dict, list, tuple, set)):
        try:
            return json.dumps(value, ensure_ascii=False, default=str)
        except Exception:
            return str(value)
    return str(value)


def _truncate(value: str, max_len: int = 60) -> str:
    if len(value) <= max_len:
        return value
    return value[: max_len - 1] + "…"


def _print_table(headers: list[str], rows: Iterable[Iterable[Any]], max_col: int = 60) -> None:
    str_rows = [[_truncate(_stringify(v), max_col) for v in row] for row in rows]
    widths = [len(h) for h in headers]
    for row in str_rows:
        for idx, cell in enumerate(row):
            widths[idx] = max(widths[idx], len(cell))

    def _line(cells: list[str]) -> str:
        return " | ".join(cell.ljust(widths[i]) for i, cell in enumerate(cells))

    sep = "-+-".join("-" * w for w in widths)
    print(_line(headers))
    print(sep)
    for row in str_rows:
        print(_line(row))


def _readonly_connection():
    """
    Devuelve una conexion con la transaccion marcada read-only en Postgres.
    Garantiza que ninguna sentencia (incluso un SELECT con efectos colaterales
    via funciones) pueda escribir.
    """
    conn = engine.connect()
    try:
        conn.exec_driver_sql("SET TRANSACTION READ ONLY")
    except Exception:
        # Fuera de Postgres puede no aplicar; seguimos en best-effort.
        pass
    return conn


def _assert_select_only(sql: str) -> None:
    stripped = sql.strip().rstrip(";").lstrip()
    if not stripped:
        raise SystemExit("SQL vacio.")
    head = stripped.split(None, 1)[0].lower()
    # Permitimos SELECT y WITH (CTE) ya que ambos son lectura.
    if head not in {"select", "with"}:
        raise SystemExit(
            f"Sentencia '{head.upper()}' rechazada. Este visor solo permite SELECT/WITH."
        )
    forbidden = (";",)
    if any(tok in stripped[:-1] for tok in forbidden):
        raise SystemExit("No se permiten multiples sentencias separadas por ';'.")


# ---------- comandos ----------

def cmd_tables(args: argparse.Namespace) -> None:
    insp = inspect(engine)
    schemas = [args.schema] if args.schema else insp.get_schema_names()
    rows: list[tuple[str, str, int | str]] = []
    with _readonly_connection() as conn:
        for schema in schemas:
            if schema in {"information_schema", "pg_catalog", "pg_toast"}:
                continue
            for tbl in sorted(insp.get_table_names(schema=schema)):
                count: int | str
                try:
                    result = conn.execute(
                        text(f'SELECT COUNT(*) FROM "{schema}"."{tbl}"')
                    )
                    count = result.scalar_one()
                except Exception as exc:  # noqa: BLE001
                    count = f"err: {exc.__class__.__name__}"
                rows.append((schema, tbl, count))
    _print_table(["schema", "table", "rows"], rows)


def cmd_schema(args: argparse.Namespace) -> None:
    insp = inspect(engine)
    schema, table = _split_table(args.table)
    cols = insp.get_columns(table, schema=schema)
    if not cols:
        raise SystemExit(f"Tabla '{args.table}' no encontrada.")
    pk = set((insp.get_pk_constraint(table, schema=schema) or {}).get("constrained_columns", []))
    fks = insp.get_foreign_keys(table, schema=schema)
    fk_map: dict[str, str] = {}
    for fk in fks:
        ref = fk.get("referred_table")
        ref_schema = fk.get("referred_schema")
        ref_cols = fk.get("referred_columns") or []
        for local, remote in zip(fk.get("constrained_columns") or [], ref_cols):
            target = f"{ref_schema}.{ref}.{remote}" if ref_schema else f"{ref}.{remote}"
            fk_map[local] = target

    rows = []
    for col in cols:
        rows.append(
            (
                col["name"],
                str(col["type"]),
                "NO" if not col.get("nullable", True) else "YES",
                _stringify(col.get("default")),
                "PK" if col["name"] in pk else "",
                fk_map.get(col["name"], ""),
            )
        )
    _print_table(["column", "type", "nullable", "default", "key", "fk"], rows, max_col=80)

    idxs = insp.get_indexes(table, schema=schema)
    if idxs:
        print()
        print("Indices:")
        _print_table(
            ["name", "columns", "unique"],
            [(i["name"], ",".join(i.get("column_names") or []), str(i.get("unique", False))) for i in idxs],
        )


def cmd_sample(args: argparse.Namespace) -> None:
    schema, table = _split_table(args.table)
    qualified = f'"{schema}"."{table}"' if schema else f'"{table}"'
    sql = f"SELECT * FROM {qualified} LIMIT :limit"
    with _readonly_connection() as conn:
        result = conn.execute(text(sql), {"limit": args.limit})
        rows = result.fetchall()
        headers = list(result.keys())
    if not rows:
        print("(sin filas)")
        return
    _print_table(headers, [tuple(r) for r in rows], max_col=args.max_col)


def cmd_count(args: argparse.Namespace) -> None:
    schema, table = _split_table(args.table)
    qualified = f'"{schema}"."{table}"' if schema else f'"{table}"'
    with _readonly_connection() as conn:
        count = conn.execute(text(f"SELECT COUNT(*) FROM {qualified}")).scalar_one()
    print(f"{args.table}: {count} filas")


def cmd_search(args: argparse.Namespace) -> None:
    """Busca un nombre (subcadena, case-insensitive) en tablas y columnas."""
    needle = args.text.lower()
    insp = inspect(engine)
    table_hits: list[tuple[str, str]] = []
    column_hits: list[tuple[str, str, str, str]] = []
    for schema in insp.get_schema_names():
        if schema in {"information_schema", "pg_catalog", "pg_toast"}:
            continue
        for tbl in insp.get_table_names(schema=schema):
            if needle in tbl.lower():
                table_hits.append((schema, tbl))
            for col in insp.get_columns(tbl, schema=schema):
                if needle in col["name"].lower():
                    column_hits.append((schema, tbl, col["name"], str(col["type"])))

    print(f"Tablas que contienen '{args.text}':")
    if table_hits:
        _print_table(["schema", "table"], table_hits)
    else:
        print("  (ninguna)")
    print()
    print(f"Columnas que contienen '{args.text}':")
    if column_hits:
        _print_table(["schema", "table", "column", "type"], column_hits)
    else:
        print("  (ninguna)")


def cmd_query(args: argparse.Namespace) -> None:
    _assert_select_only(args.sql)
    with _readonly_connection() as conn:
        result = conn.execute(text(args.sql))
        rows = result.fetchall()
        headers = list(result.keys())
    if not rows:
        print("(sin filas)")
        return
    _print_table(headers, [tuple(r) for r in rows], max_col=args.max_col)


# ---------- util ----------

def _split_table(qualified: str) -> tuple[str | None, str]:
    if "." in qualified:
        schema, table = qualified.split(".", 1)
        return schema, table
    return None, qualified


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="db_explorer",
        description="Visor de BBDD (solo lectura) para inspeccionar tablas y contenido.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_tables = sub.add_parser("tables", help="Listar tablas y conteo de filas")
    p_tables.add_argument("--schema", help="Limitar a un schema (por defecto: todos los no-sistema)")
    p_tables.set_defaults(func=cmd_tables)

    p_schema = sub.add_parser("schema", help="Describir columnas, PK, FK e indices de una tabla")
    p_schema.add_argument("table", help="Nombre de tabla (o schema.tabla)")
    p_schema.set_defaults(func=cmd_schema)

    p_sample = sub.add_parser("sample", help="Mostrar N filas de una tabla")
    p_sample.add_argument("table", help="Nombre de tabla (o schema.tabla)")
    p_sample.add_argument("--limit", type=int, default=20)
    p_sample.add_argument("--max-col", type=int, default=60, help="Ancho maximo por columna")
    p_sample.set_defaults(func=cmd_sample)

    p_count = sub.add_parser("count", help="Contar filas de una tabla")
    p_count.add_argument("table", help="Nombre de tabla (o schema.tabla)")
    p_count.set_defaults(func=cmd_count)

    p_search = sub.add_parser("search", help="Buscar texto en nombres de tablas y columnas")
    p_search.add_argument("text", help="Subcadena a buscar (case-insensitive)")
    p_search.set_defaults(func=cmd_search)

    p_query = sub.add_parser("query", help="Ejecutar un SELECT/WITH arbitrario (solo lectura)")
    p_query.add_argument("sql", help="Sentencia SELECT o WITH")
    p_query.add_argument("--max-col", type=int, default=60)
    p_query.set_defaults(func=cmd_query)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.func(args)
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
