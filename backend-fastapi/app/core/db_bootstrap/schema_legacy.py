from .schema_aux_contracts import ensure_contracts_schema
from .schema_aux_erp_budget import ensure_erp_budget_schema
from .schema_aux_comparativos import ensure_comparativos_schema
from .schema_aux_erp_core import ensure_erp_core_schema
from .schema_aux_org import ensure_org_schema
from .schema_aux_signatures import ensure_signature_schema
from .utils import _ensure_column
from app.core.db_session import engine


def _ensure_legacy_columns(inspector, table_names):
    # Compatibilidad de columnas en instalaciones legacy sin migraciones.
    with engine.begin() as conn:
        # Tabla de usuarios.
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="user",
            table_sql_name='"user"',
            column_name="tenant_id",
            column_ddl="INTEGER NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="user",
            table_sql_name='"user"',
            column_name="role_id",
            column_ddl="INTEGER NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="user",
            table_sql_name='"user"',
            column_name="mfa_enabled",
            column_ddl="BOOLEAN NOT NULL DEFAULT FALSE",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="user",
            table_sql_name='"user"',
            column_name="mfa_secret",
            column_ddl="VARCHAR(255) NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="user",
            table_sql_name='"user"',
            column_name="language",
            column_ddl="VARCHAR(10) NOT NULL DEFAULT 'en'",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="user",
            table_sql_name='"user"',
            column_name="avatar_url",
            column_ddl="VARCHAR(1024) NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="user",
            table_sql_name='"user"',
            column_name="created_at",
            column_ddl="TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="user",
            table_sql_name='"user"',
            column_name="last_login_at",
            column_ddl="TIMESTAMP NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="user",
            table_sql_name='"user"',
            column_name="last_seen_at",
            column_ddl="TIMESTAMP NULL",
        )

        # Firma multiproveedor.
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="signature_requests",
            table_sql_name="signature_requests",
            column_name="provider_request_id",
            column_ddl="INTEGER NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="signature_requests",
            table_sql_name="signature_requests",
            column_name="presign_session_id",
            column_ddl="VARCHAR(128) NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="signature_requests",
            table_sql_name="signature_requests",
            column_name="contract_version",
            column_ddl="VARCHAR(128) NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="signature_requests",
            table_sql_name="signature_requests",
            column_name="pdf_original_size_bytes",
            column_ddl="INTEGER NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="signature_requests",
            table_sql_name="signature_requests",
            column_name="signed_pdf_sha256",
            column_ddl="VARCHAR(64) NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="signature_requests",
            table_sql_name="signature_requests",
            column_name="provider_payload",
            column_ddl="JSONB NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="signature_requests",
            table_sql_name="signature_requests",
            column_name="client_payload",
            column_ddl="JSONB NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="signature_requests",
            table_sql_name="signature_requests",
            column_name="failure_reason",
            column_ddl="VARCHAR(1024) NULL",
        )
        _ensure_column(
            inspector,
            table_names,
            conn,
            table_name="signature_requests",
            table_sql_name="signature_requests",
            column_name="error_detail",
            column_ddl="VARCHAR(2048) NULL",
        )


def _ensure_aux_columns(inspector, table_names):
    ensure_comparativos_schema(inspector, table_names)
    ensure_erp_core_schema(inspector, table_names)
    ensure_erp_budget_schema(inspector, table_names)
    ensure_contracts_schema(inspector, table_names)
    ensure_org_schema(inspector, table_names)
    ensure_signature_schema(inspector, table_names)
