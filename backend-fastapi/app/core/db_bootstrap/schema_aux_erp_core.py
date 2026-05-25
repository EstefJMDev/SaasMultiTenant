from sqlalchemy import text

from app.core.db_session import engine


def ensure_erp_core_schema(inspector, table_names) -> None:
    # Columns auxiliares para asignaciones y tracking en actividades/subactividades.
    if "erp_activity" in table_names:
        activity_columns = {col["name"] for col in inspector.get_columns("erp_activity")}
        with engine.begin() as conn:
            if "tenant_id" not in activity_columns:
                conn.execute(
                  text("ALTER TABLE erp_activity ADD COLUMN tenant_id INTEGER NULL")
                )
            if "assigned_to_id" not in activity_columns:
                conn.execute(
                  text("ALTER TABLE erp_activity ADD COLUMN assigned_to_id INTEGER NULL")
                )

    if "erp_subactivity" in table_names:
        sub_columns = {col["name"] for col in inspector.get_columns("erp_subactivity")}
        with engine.begin() as conn:
            if "tenant_id" not in sub_columns:
                conn.execute(
                  text("ALTER TABLE erp_subactivity ADD COLUMN tenant_id INTEGER NULL")
                )
            if "assigned_to_id" not in sub_columns:
                conn.execute(
                  text("ALTER TABLE erp_subactivity ADD COLUMN assigned_to_id INTEGER NULL")
                )

    if "erp_timesession" in table_names:
        ts_info = inspector.get_columns("erp_timesession")
        ts_columns = {col["name"] for col in ts_info}
        ts_nullable_by_col = {col["name"]: bool(col.get("nullable", True)) for col in ts_info}
        with engine.begin() as conn:
            if "tenant_id" not in ts_columns:
                conn.execute(
                    text("ALTER TABLE erp_timesession ADD COLUMN tenant_id INTEGER NULL")
                )
            if "activity_id" not in ts_columns:
                conn.execute(
                    text("ALTER TABLE erp_timesession ADD COLUMN activity_id INTEGER NULL")
                )
            if "subactivity_id" not in ts_columns:
                conn.execute(
                    text("ALTER TABLE erp_timesession ADD COLUMN subactivity_id INTEGER NULL")
                )
            if "task_id" in ts_columns and not ts_nullable_by_col.get("task_id", True):
                # Permite sesiones de tracking sin tarea asociada.
                conn.execute(
                    text("ALTER TABLE erp_timesession ALTER COLUMN task_id DROP NOT NULL")
                )

    if "erp_timeentry" in table_names:
        te_columns = {col["name"] for col in inspector.get_columns("erp_timeentry")}
        with engine.begin() as conn:
            if "tenant_id" not in te_columns:
                conn.execute(
                    text("ALTER TABLE erp_timeentry ADD COLUMN tenant_id INTEGER NULL")
                )
            if "activity_id" not in te_columns:
                conn.execute(
                    text("ALTER TABLE erp_timeentry ADD COLUMN activity_id INTEGER NULL")
                )
            if "subactivity_id" not in te_columns:
                conn.execute(
                    text("ALTER TABLE erp_timeentry ADD COLUMN subactivity_id INTEGER NULL")
                )
            if "task_id" in te_columns:
                # Asegura que la columna acepte NULL para entradas no ligadas a tareas.
                conn.execute(
                    text("ALTER TABLE erp_timeentry ALTER COLUMN task_id DROP NOT NULL")
                )

    if "erp_task_template" in table_names:
        tmpl_columns = {col["name"] for col in inspector.get_columns("erp_task_template")}
        with engine.begin() as conn:
            if "tenant_id" not in tmpl_columns:
                conn.execute(
                    text("ALTER TABLE erp_task_template ADD COLUMN tenant_id INTEGER NULL")
                )

    if "erp_milestone" in table_names:
        milestone_columns = {col["name"] for col in inspector.get_columns("erp_milestone")}
        with engine.begin() as conn:
            if "tenant_id" not in milestone_columns:
                conn.execute(
                    text("ALTER TABLE erp_milestone ADD COLUMN tenant_id INTEGER NULL")
                )

    if "erp_deliverable" in table_names:
        deliverable_columns = {col["name"] for col in inspector.get_columns("erp_deliverable")}
        with engine.begin() as conn:
            if "tenant_id" not in deliverable_columns:
                conn.execute(
                    text("ALTER TABLE erp_deliverable ADD COLUMN tenant_id INTEGER NULL")
                )
