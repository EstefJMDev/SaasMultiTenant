from sqlalchemy import text

from app.core.db_session import engine


def _sync_sequences(inspector, table_names):
    # Re-sincroniza secuencias serial para evitar `duplicate key` en entornos
    # restaurados desde dumps donde el setval no se ejecut?.
    with engine.begin() as conn:
        for table in (
            "contract",
            "contract_offer",
            "contract_document",
            "contract_event",
            "contract_notification_log",
            "supplier",
            "supplier_invitation",
            "signature_request",
            "signature_provider_request",
            "signature_provider_event",
        ):
            if table not in table_names:
                continue
            conn.execute(
                text(
                    f"""
                    SELECT setval(
                        pg_get_serial_sequence('{table}', 'id'),
                        COALESCE((SELECT MAX(id) FROM {table}), 0) + 1,
                        false
                    )
                    """
                )
            )
