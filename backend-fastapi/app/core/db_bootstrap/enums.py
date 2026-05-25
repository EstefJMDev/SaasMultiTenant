from sqlalchemy import text

from app.core.db_session import engine


def _ensure_enum_values(inspector, table_names):
    # Compatibilidad de enums en entornos sin Alembic.
    # Algunos despliegues legacy no incluyen los valores nuevos de contratos.
    with engine.begin() as conn:
        for value in [
            "DRAFT",
            "PENDING_SUPPLIER",
            "PENDING_JEFE_OBRA",
            "PENDING_GERENCIA",
            "PENDING_DEPARTAMENTOS",
            "PENDING_ADMIN",
            "PENDING_COMPRAS",
            "PENDING_JURIDICO",
            "IN_SIGNATURE",
            "SIGNED",
            "REJECTED",
        ]:
            conn.execute(
                text(f"ALTER TYPE contractstatus ADD VALUE IF NOT EXISTS '{value}'")
            )
        for value in [
            "COMPARATIVE_CREATED",
            "COMPARATIVE_PENDING_APPROVAL",
            "COMPARATIVE_APPROVED",
            "COMPARATIVE_REJECTED",
            "DOCS_GENERATED",
            "GERENCIA_REJECTED",
            "SENT_TO_GERENCIA",
            "SUPPLIER_PENDING",
            "SUPPLIER_COMPLETED",
            "GERENCIA_PENDING",
            "GERENCIA_APPROVED",
            "DEPT_APPROVED",
            "DEPT_REJECTED",
            "ALL_APPROVED",
            "SIGNATURE_SENT",
            "SIGNED",
            "REJECTED",
            "COMPARATIVE_PENDING_WARNING",
            "COMPARATIVE_AUTO_APPROVED",
        ]:
            conn.execute(
                text(
                    f"ALTER TYPE contractnotificationevent ADD VALUE IF NOT EXISTS '{value}'"
                )
            )
        for value in [
            "PENDING",
            "PRESIGNED",
            "PENDING_CLIENT",
            "VALIDATING",
            "SIGNED",
            "FAILED",
            "EXPIRED",
        ]:
            conn.execute(
                text(
                    f"ALTER TYPE signaturerequeststatus ADD VALUE IF NOT EXISTS '{value}'"
                )
            )
