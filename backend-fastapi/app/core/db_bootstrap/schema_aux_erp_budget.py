from sqlalchemy import text

from app.core.db_session import engine
from . import backfills


def ensure_erp_budget_schema(inspector, table_names) -> None:
    if "erp_project_budget_line" in table_names:
        budget_line_columns = {col["name"] for col in inspector.get_columns("erp_project_budget_line")}
        with engine.begin() as conn:
            if "tenant_id" not in budget_line_columns:
                conn.execute(
                    text("ALTER TABLE erp_project_budget_line ADD COLUMN tenant_id INTEGER NULL")
                )

    if "erp_project_budget_milestone" in table_names:
        budget_milestone_columns = {col["name"] for col in inspector.get_columns("erp_project_budget_milestone")}
        with engine.begin() as conn:
            if "tenant_id" not in budget_milestone_columns:
                conn.execute(
                    text("ALTER TABLE erp_project_budget_milestone ADD COLUMN tenant_id INTEGER NULL")
                )
            # Backfill tenant_id from project if missing.
            backfills.backfill_budget_milestone_tenant_id(conn)

    if "erp_budget_line_milestone" in table_names:
        budget_link_columns = {col["name"] for col in inspector.get_columns("erp_budget_line_milestone")}
        with engine.begin() as conn:
            if "tenant_id" not in budget_link_columns:
                conn.execute(
                    text("ALTER TABLE erp_budget_line_milestone ADD COLUMN tenant_id INTEGER NULL")
                )
            # Backfill tenant_id from project through budget line if missing.
            backfills.backfill_budget_line_milestone_tenant_id(conn)

    if "erp_external_collaboration" in table_names:
        collab_columns = {col["name"] for col in inspector.get_columns("erp_external_collaboration")}
        with engine.begin() as conn:
            if "tenant_id" not in collab_columns:
                conn.execute(
                    text("ALTER TABLE erp_external_collaboration ADD COLUMN tenant_id INTEGER NULL")
                )

    if "erp_simulation_project" in table_names:
        sim_columns = {col["name"] for col in inspector.get_columns("erp_simulation_project")}
        with engine.begin() as conn:
            if "threshold_percent" not in sim_columns:
                conn.execute(
                    text(
                        "ALTER TABLE erp_simulation_project "
                        "ADD COLUMN threshold_percent DECIMAL NULL"
                    )
                )
                backfills.backfill_simulation_threshold(conn)

    if "erp_project" in table_names:
        project_columns = {col["name"] for col in inspector.get_columns("erp_project")}
        with engine.begin() as conn:
            if "project_type" not in project_columns:
                conn.execute(
                    text("ALTER TABLE erp_project ADD COLUMN project_type VARCHAR(32) NULL")
                )

        backfills.backfill_project_duration_months()

    # Migraci?n sencilla a hitos din?micos: si no hay hitos de presupuesto creados,
    # creamos dos por proyecto y volcamos los valores existentes de hito1/hito2.
    if "erp_project_budget_milestone" in table_names and "erp_project_budget_line" in table_names:
        backfills.backfill_dynamic_budget_milestones()

    if "erp_timeentry_department_split" in table_names:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_timeentry_split_tenant_department "
                    "ON erp_timeentry_department_split (tenant_id, department_id)"
                )
            )
