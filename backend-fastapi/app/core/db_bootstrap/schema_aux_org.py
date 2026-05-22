from sqlalchemy import text

from app.core.db_session import engine
from . import backfills


def ensure_org_schema(inspector, table_names) -> None:
    if "department" in table_names:
        dept_columns = {col["name"] for col in inspector.get_columns("department")}
        with engine.begin() as conn:
            if "project_allocation_percentage" not in dept_columns:
                conn.execute(
                    text(
                        "ALTER TABLE department "
                        "ADD COLUMN project_allocation_percentage DECIMAL NULL"
                    )
                )
                backfills.backfill_department_allocation(conn)
            if "menu_visibility" not in dept_columns:
                conn.execute(
                    text(
                        "ALTER TABLE department "
                        "ADD COLUMN menu_visibility JSON NOT NULL DEFAULT '{}'::json"
                    )
                )
            if "can_view_worksite" not in dept_columns:
                conn.execute(text("ALTER TABLE department ADD COLUMN can_view_worksite BOOLEAN NOT NULL DEFAULT FALSE"))
            if "can_edit_worksite" not in dept_columns:
                conn.execute(text("ALTER TABLE department ADD COLUMN can_edit_worksite BOOLEAN NOT NULL DEFAULT FALSE"))
            if "can_view_provider" not in dept_columns:
                conn.execute(text("ALTER TABLE department ADD COLUMN can_view_provider BOOLEAN NOT NULL DEFAULT FALSE"))
            if "can_edit_provider" not in dept_columns:
                conn.execute(text("ALTER TABLE department ADD COLUMN can_edit_provider BOOLEAN NOT NULL DEFAULT FALSE"))

    if "position" in table_names:
        position_columns = {col["name"] for col in inspector.get_columns("position")}
        with engine.begin() as conn:
            if "can_view_worksite" not in position_columns:
                conn.execute(text("ALTER TABLE position ADD COLUMN can_view_worksite BOOLEAN NOT NULL DEFAULT FALSE"))
            if "can_edit_worksite" not in position_columns:
                conn.execute(text("ALTER TABLE position ADD COLUMN can_edit_worksite BOOLEAN NOT NULL DEFAULT FALSE"))
            if "can_view_provider" not in position_columns:
                conn.execute(text("ALTER TABLE position ADD COLUMN can_view_provider BOOLEAN NOT NULL DEFAULT FALSE"))
            if "can_edit_provider" not in position_columns:
                conn.execute(text("ALTER TABLE position ADD COLUMN can_edit_provider BOOLEAN NOT NULL DEFAULT FALSE"))

    if "work_site" in table_names:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE work_site "
                    "SET code = LEFT(REGEXP_REPLACE(COALESCE(code, ''), '[^0-9]', '', 'g'), 4)"
                )
            )
            conn.execute(text("ALTER TABLE work_site ALTER COLUMN code TYPE VARCHAR(4)"))
            conn.execute(
                text("ALTER TABLE work_site DROP CONSTRAINT IF EXISTS ck_work_site_code_4_digits")
            )
            conn.execute(
                text(
                    "ALTER TABLE work_site "
                    "ADD CONSTRAINT ck_work_site_code_4_digits "
                    "CHECK (code ~ '^[0-9]{1,4}$')"
                )
            )

    if "invoice" in table_names:
        invoice_columns = {col["name"] for col in inspector.get_columns("invoice")}
        with engine.begin() as conn:
            if "subsidizable" not in invoice_columns:
                conn.execute(
                    text("ALTER TABLE invoice ADD COLUMN subsidizable BOOLEAN NULL")
                )
            if "expense_type" not in invoice_columns:
                conn.execute(
                    text("ALTER TABLE invoice ADD COLUMN expense_type VARCHAR(128) NULL")
                )
            if "milestone_id" not in invoice_columns:
                conn.execute(
                    text("ALTER TABLE invoice ADD COLUMN milestone_id INTEGER NULL")
                )
            if "budget_milestone_id" not in invoice_columns:
                conn.execute(
                    text(
                        "ALTER TABLE invoice "
                        "ADD COLUMN budget_milestone_id INTEGER NULL"
                    )
                )

    if "notification" in table_names:
        notif_columns = {col["name"] for col in inspector.get_columns("notification")}
        with engine.begin() as conn:
            if "meta" not in notif_columns:
                conn.execute(
                    text("ALTER TABLE notification ADD COLUMN meta JSON NULL")
                )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'generic'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'ticket_assigned'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'ticket_comment'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'ticket_status'")
            )

    if "notification_log" in table_names:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'CREATED'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DUE_20'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DUE_10'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DUE_5'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DUE_1'")
            )
            conn.execute(
                text("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'DUE_DAILY'")
            )

    if "audit_log" in table_names or "auditlog" in table_names:
        audit_table = "audit_log" if "audit_log" in table_names else "auditlog"
        audit_columns = {col["name"] for col in inspector.get_columns(audit_table)}
        with engine.begin() as conn:
            if "source" not in audit_columns:
                conn.execute(
                    text(f"ALTER TABLE {audit_table} ADD COLUMN source VARCHAR(16) NULL")
                )
                backfills.backfill_audit_log_source(conn, audit_table)

    if "user" in table_names:
        user_columns = {col["name"] for col in inspector.get_columns("user")}
        with engine.begin() as conn:
            if "avatar_url" not in user_columns:
                conn.execute(
                    text('ALTER TABLE "user" ADD COLUMN avatar_url VARCHAR(512) NULL')
                )

    if "users" in table_names:
        user_columns = {col["name"] for col in inspector.get_columns("users")}
        with engine.begin() as conn:
            if "avatar_url" not in user_columns:
                conn.execute(
                    text("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL")
                )

    if "tenant_branding" in table_names:
        branding_columns = {
            col["name"] for col in inspector.get_columns("tenant_branding")
        }
        with engine.begin() as conn:
            if "company_name" not in branding_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_branding ADD COLUMN company_name VARCHAR(128) NULL"
                    )
                )
            if "company_subtitle" not in branding_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_branding ADD COLUMN company_subtitle VARCHAR(256) NULL"
                    )
                )
            if "show_company_name" not in branding_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_branding ADD COLUMN show_company_name BOOLEAN NOT NULL DEFAULT TRUE"
                    )
                )
            if "show_company_subtitle" not in branding_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_branding ADD COLUMN show_company_subtitle BOOLEAN NOT NULL DEFAULT TRUE"
                    )
                )
            if "department_emails" not in branding_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_branding ADD COLUMN department_emails JSON NULL"
                    )
                )

    # Campos de disponibilidad en perfiles de empleado.
    if "employeeprofile" in table_names:
        emp_columns = {col["name"] for col in inspector.get_columns("employeeprofile")}
        with engine.begin() as conn:
            if "available_hours" not in emp_columns:
                conn.execute(
                    text("ALTER TABLE employeeprofile ADD COLUMN available_hours DECIMAL NULL")
                )
            if "availability_percentage" not in emp_columns:
                conn.execute(
                    text(
                        "ALTER TABLE employeeprofile ADD COLUMN availability_percentage DECIMAL NULL"
                    )
                )
            if "titulacion" not in emp_columns:
                conn.execute(
                    text("ALTER TABLE employeeprofile ADD COLUMN titulacion VARCHAR(255) NULL")
                )
            if "first_name" not in emp_columns:
                conn.execute(
                    text("ALTER TABLE employeeprofile ADD COLUMN first_name VARCHAR(150) NULL")
                )
            if "last_name" not in emp_columns:
                conn.execute(
                    text("ALTER TABLE employeeprofile ADD COLUMN last_name VARCHAR(150) NULL")
                )

    if "employeedepartment" in table_names:
        emp_dept_columns = {col["name"] for col in inspector.get_columns("employeedepartment")}
        with engine.begin() as conn:
            if "allocation_percentage" not in emp_dept_columns:
                conn.execute(
                    text(
                        "ALTER TABLE employeedepartment "
                        "ADD COLUMN allocation_percentage DECIMAL NOT NULL DEFAULT 100"
                    )
                )

    if "employeeallocation" in table_names:
        alloc_columns = {col["name"] for col in inspector.get_columns("employeeallocation")}
        with engine.begin() as conn:
            if "allocation_percentage" not in alloc_columns:
                conn.execute(
                    text("ALTER TABLE employeeallocation ADD COLUMN allocation_percentage DECIMAL NULL")
                )

    if "employee_year_availability" in table_names:
        year_avail_columns = {
            col["name"] for col in inspector.get_columns("employee_year_availability")
        }
        with engine.begin() as conn:
            if "hourly_rate" not in year_avail_columns:
                conn.execute(
                    text(
                        "ALTER TABLE employee_year_availability "
                        "ADD COLUMN hourly_rate DECIMAL NULL"
                    )
                )
