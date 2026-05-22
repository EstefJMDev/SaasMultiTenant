from sqlalchemy import text


def _ensure_column(
    inspector,
    table_names,
    conn,
    *,
    table_name: str,
    table_sql_name: str,
    column_name: str,
    column_ddl: str,
) -> None:
    if table_name not in table_names:
        return
    existing = {col["name"] for col in inspector.get_columns(table_name)}
    if column_name in existing:
        return
    conn.execute(text(f"ALTER TABLE {table_sql_name} ADD COLUMN {column_name} {column_ddl}"))
