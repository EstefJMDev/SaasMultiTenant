from sqlalchemy import text

from app.core.db_session import engine


_TENANT_BACKFILL_BY_TABLE = {
    "comparativo_hitos": (
        "UPDATE comparativo_hitos h "
        "SET tenant_id = c.tenant_id "
        "FROM comparativos c "
        "WHERE h.comparativo_id = c.id AND h.tenant_id IS NULL"
    ),
    "comparativo_aprobaciones": (
        "UPDATE comparativo_aprobaciones a "
        "SET tenant_id = c.tenant_id "
        "FROM comparativos c "
        "WHERE a.comparativo_id = c.id AND a.tenant_id IS NULL"
    ),
    "comparativo_historial_flujo": (
        "UPDATE comparativo_historial_flujo h "
        "SET tenant_id = c.tenant_id "
        "FROM comparativos c "
        "WHERE h.comparativo_id = c.id AND h.tenant_id IS NULL"
    ),
    "comparativo_oferta_adjudicada": (
        "UPDATE comparativo_oferta_adjudicada o "
        "SET tenant_id = c.tenant_id "
        "FROM comparativos c "
        "WHERE o.comparativo_id = c.id AND o.tenant_id IS NULL"
    ),
    "comparativo_oferta_adjudicada_partidas": (
        "UPDATE comparativo_oferta_adjudicada_partidas p "
        "SET tenant_id = c.tenant_id "
        "FROM comparativo_oferta_adjudicada o "
        "JOIN comparativos c ON c.id = o.comparativo_id "
        "WHERE p.comparativo_oferta_adjudicada_id = o.id "
        "AND p.tenant_id IS NULL"
    ),
    "comparativo_oferta_descartada": (
        "UPDATE comparativo_oferta_descartada o "
        "SET tenant_id = c.tenant_id "
        "FROM comparativos c "
        "WHERE o.comparativo_id = c.id AND o.tenant_id IS NULL"
    ),
    "comparativo_oferta_descartada_partidas": (
        "UPDATE comparativo_oferta_descartada_partidas p "
        "SET tenant_id = c.tenant_id "
        "FROM comparativo_oferta_descartada o "
        "JOIN comparativos c ON c.id = o.comparativo_id "
        "WHERE p.comparativo_oferta_descartada_id = o.id "
        "AND p.tenant_id IS NULL"
    ),
    "contrato_datos_proveedor": (
        "UPDATE contrato_datos_proveedor d "
        "SET tenant_id = c.tenant_id "
        "FROM contratos c "
        "WHERE d.contrato_id = c.id AND d.tenant_id IS NULL"
    ),
    "contrato_hitos": (
        "UPDATE contrato_hitos h "
        "SET tenant_id = c.tenant_id "
        "FROM contratos c "
        "WHERE h.contrato_id = c.id AND h.tenant_id IS NULL"
    ),
    "contrato_historial_flujo": (
        "UPDATE contrato_historial_flujo h "
        "SET tenant_id = c.tenant_id "
        "FROM contratos c "
        "WHERE h.contrato_id = c.id AND h.tenant_id IS NULL"
    ),
}


def _has_tenant_fk(inspector, table_name: str) -> bool:
    for fk in inspector.get_foreign_keys(table_name):
        if (fk.get("constrained_columns") or []) == ["tenant_id"] and fk.get(
            "referred_table"
        ) == "tenant":
            return True
    return False


def _has_tenant_index(inspector, table_name: str) -> bool:
    for idx in inspector.get_indexes(table_name):
        if (idx.get("column_names") or []) == ["tenant_id"]:
            return True
    return False


def ensure_comparativos_schema(inspector, table_names) -> None:
    targets = [
        table_name
        for table_name in _TENANT_BACKFILL_BY_TABLE
        if table_name in table_names
    ]
    if not targets:
        return

    fk_state = {table: _has_tenant_fk(inspector, table) for table in targets}
    idx_state = {table: _has_tenant_index(inspector, table) for table in targets}

    with engine.begin() as conn:
        for table_name in targets:
            columns = inspector.get_columns(table_name)
            column_names = {col["name"] for col in columns}
            tenant_col = next((col for col in columns if col["name"] == "tenant_id"), None)
            tenant_is_nullable = True if tenant_col is None else bool(tenant_col["nullable"])

            if "tenant_id" not in column_names:
                conn.execute(
                    text(
                        f"ALTER TABLE {table_name} "
                        "ADD COLUMN tenant_id INTEGER NULL"
                    )
                )

            conn.execute(text(_TENANT_BACKFILL_BY_TABLE[table_name]))

            null_count = conn.execute(
                text(f"SELECT COUNT(*) FROM {table_name} WHERE tenant_id IS NULL")
            ).scalar_one()
            if null_count:
                raise RuntimeError(
                    f"No se pudo completar tenant_id en {table_name}: "
                    f"{null_count} filas quedan con tenant_id NULL."
                )

            if tenant_col is None or tenant_is_nullable:
                conn.execute(
                    text(f"ALTER TABLE {table_name} ALTER COLUMN tenant_id SET NOT NULL")
                )

            if not fk_state[table_name]:
                constraint_name = f"fk_{table_name}_tenant_id_tenant"
                conn.execute(
                    text(
                        f"ALTER TABLE {table_name} "
                        f"ADD CONSTRAINT {constraint_name} "
                        "FOREIGN KEY (tenant_id) REFERENCES tenant(id)"
                    )
                )

            if not idx_state[table_name]:
                conn.execute(
                    text(
                        f"CREATE INDEX IF NOT EXISTS ix_{table_name}_tenant_id "
                        f"ON {table_name}(tenant_id)"
                    )
                )

        if "contratos" in table_names:
            contratos_columns = {col["name"] for col in inspector.get_columns("contratos")}
            if "datos_contractuales_json" not in contratos_columns:
                conn.execute(
                    text(
                        "ALTER TABLE public.contratos "
                        "ADD COLUMN IF NOT EXISTS datos_contractuales_json JSONB NULL"
                    )
                )
