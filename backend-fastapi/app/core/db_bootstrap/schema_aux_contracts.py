from sqlalchemy import text

from app.core.db_session import engine


def ensure_contracts_schema(inspector, table_names) -> None:
    if "contract" in table_names:
        contract_columns = {col["name"] for col in inspector.get_columns("contract")}
        with engine.begin() as conn:
            if "comparative_status" not in contract_columns:
                conn.execute(
                    text(
                        "ALTER TABLE contract "
                        "ADD COLUMN comparative_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'"
                    )
                )
            if "title" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN title VARCHAR(255) NULL")
                )
            if "description" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN description TEXT NULL")
                )
            if "selected_offer_id" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN selected_offer_id INTEGER NULL")
                )
            if "template_id" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN template_id INTEGER NULL")
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_contract_template_id "
                        "ON contract(template_id)"
                    )
                )
            if "assigned_admin_user_id" not in contract_columns:
                conn.execute(
                    text(
                        "ALTER TABLE contract "
                        "ADD COLUMN assigned_admin_user_id INTEGER NULL"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_contract_assigned_admin_user_id "
                        "ON contract(assigned_admin_user_id)"
                    )
                )
            if "supplier_name" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_name VARCHAR(255) NULL")
                )
            if "supplier_tax_id" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_tax_id VARCHAR(64) NULL")
                )
            if "supplier_email" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_email VARCHAR(255) NULL")
                )
            if "supplier_phone" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_phone VARCHAR(64) NULL")
                )
            if "supplier_address" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_address VARCHAR(255) NULL")
                )
            if "supplier_city" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_city VARCHAR(128) NULL")
                )
            if "supplier_postal_code" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_postal_code VARCHAR(32) NULL")
                )
            if "supplier_country" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_country VARCHAR(64) NULL")
                )
            if "supplier_contact_name" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_contact_name VARCHAR(255) NULL")
                )
            if "supplier_bank_iban" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_bank_iban VARCHAR(64) NULL")
                )
            if "supplier_bank_bic" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_bank_bic VARCHAR(32) NULL")
                )
            if "supplier_id" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN supplier_id INTEGER NULL")
                )
            if "total_amount" not in contract_columns:
                conn.execute(
                    text(
                        "ALTER TABLE contract "
                        "ADD COLUMN total_amount NUMERIC(14, 2) NULL"
                    )
                )
            if "currency" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN currency VARCHAR(16) NULL")
                )
            if "comparative_data" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN comparative_data JSONB NULL")
                )
            if "contract_data" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN contract_data JSONB NULL")
                )
            if "ocr_data" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN ocr_data JSONB NULL")
                )
            if "submitted_at" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN submitted_at TIMESTAMP NULL")
                )
            if "approved_at" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN approved_at TIMESTAMP NULL")
                )
            if "signed_at" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN signed_at TIMESTAMP NULL")
                )
            if "rejected_reason" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN rejected_reason TEXT NULL")
                )
            if "rejected_by_id" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN rejected_by_id INTEGER NULL")
                )
            if "rejected_at" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN rejected_at TIMESTAMP NULL")
                )
            if "rejected_to_status" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN rejected_to_status VARCHAR(32) NULL")
                )
            if "deleted_at" not in contract_columns:
                conn.execute(
                    text("ALTER TABLE contract ADD COLUMN deleted_at TIMESTAMP NULL")
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_contract_deleted_at "
                        "ON contract(deleted_at)"
                    )
                )

    if "contract_offer" in table_names:
        offer_columns = {col["name"] for col in inspector.get_columns("contract_offer")}
        with engine.begin() as conn:
            if "supplier_name" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN supplier_name VARCHAR(255) NULL")
                )
            if "supplier_tax_id" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN supplier_tax_id VARCHAR(64) NULL")
                )
            if "supplier_email" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN supplier_email VARCHAR(255) NULL")
                )
            if "supplier_phone" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN supplier_phone VARCHAR(64) NULL")
                )
            if "total_amount" not in offer_columns:
                conn.execute(
                    text(
                        "ALTER TABLE contract_offer "
                        "ADD COLUMN total_amount NUMERIC(14, 2) NULL"
                    )
                )
            if "currency" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN currency VARCHAR(16) NULL")
                )
            if "notes" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN notes TEXT NULL")
                )
            if "file_path" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN file_path VARCHAR(512) NULL")
                )
            if "original_filename" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN original_filename VARCHAR(255) NULL")
                )
            if "extracted_text" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN extracted_text TEXT NULL")
                )
            if "extraction_raw_json" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN extraction_raw_json JSONB NULL")
                )
            if "extraction_meta" not in offer_columns:
                conn.execute(
                    text("ALTER TABLE contract_offer ADD COLUMN extraction_meta JSONB NULL")
                )

    if "supplier" in table_names:
        supplier_columns = {col["name"] for col in inspector.get_columns("supplier")}
        with engine.begin() as conn:
            if "city" not in supplier_columns:
                conn.execute(
                    text("ALTER TABLE supplier ADD COLUMN city VARCHAR(128) NULL")
                )
            if "postal_code" not in supplier_columns:
                conn.execute(
                    text("ALTER TABLE supplier ADD COLUMN postal_code VARCHAR(32) NULL")
                )
            if "country" not in supplier_columns:
                conn.execute(
                    text("ALTER TABLE supplier ADD COLUMN country VARCHAR(64) NULL")
                )
            if "contact_name" not in supplier_columns:
                conn.execute(
                    text("ALTER TABLE supplier ADD COLUMN contact_name VARCHAR(255) NULL")
                )
            if "bank_iban" not in supplier_columns:
                conn.execute(
                    text("ALTER TABLE supplier ADD COLUMN bank_iban VARCHAR(64) NULL")
                )
            if "bank_bic" not in supplier_columns:
                conn.execute(
                    text("ALTER TABLE supplier ADD COLUMN bank_bic VARCHAR(32) NULL")
                )
