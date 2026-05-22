from sqlalchemy import text

from app.core.db_session import engine


def ensure_signature_schema(inspector, table_names) -> None:
    # Compatibilidad para flujo de firmas multiproveedor (Signaturit + AutoFirma).
    if "tenant_signature_config" in table_names:
        cfg_columns = {col["name"] for col in inspector.get_columns("tenant_signature_config")}
        with engine.begin() as conn:
            if "autofirma_session_ttl_minutes" not in cfg_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_signature_config "
                        "ADD COLUMN autofirma_session_ttl_minutes INTEGER NOT NULL DEFAULT 10"
                    )
                )
            if "autofirma_tsa_enabled" not in cfg_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_signature_config "
                        "ADD COLUMN autofirma_tsa_enabled BOOLEAN NOT NULL DEFAULT TRUE"
                    )
                )
            if "autofirma_tsa_url" not in cfg_columns:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_signature_config "
                        "ADD COLUMN autofirma_tsa_url VARCHAR(512) NULL"
                    )
                )

    if "signature_requests" in table_names:
        req_columns = {col["name"] for col in inspector.get_columns("signature_requests")}
        with engine.begin() as conn:
            if "pdf_original_size_bytes" not in req_columns:
                conn.execute(
                    text("ALTER TABLE signature_requests ADD COLUMN pdf_original_size_bytes INTEGER NULL")
                )
            if "error_detail" not in req_columns:
                conn.execute(
                    text("ALTER TABLE signature_requests ADD COLUMN error_detail TEXT NULL")
                )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_signature_requests_expires_at ON signature_requests (expires_at)")
            )

    if "signature_evidence" in table_names:
        evidence_columns = {col["name"] for col in inspector.get_columns("signature_evidence")}
        with engine.begin() as conn:
            if "signer_ip" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN signer_ip VARCHAR(64) NULL"))
            if "signer_user_agent" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN signer_user_agent VARCHAR(1024) NULL"))
            if "device_hints" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN device_hints JSONB NULL"))
            if "cert_subject_dn" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN cert_subject_dn VARCHAR(1024) NULL"))
            if "cert_issuer_dn" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN cert_issuer_dn VARCHAR(1024) NULL"))
            if "cert_serial" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN cert_serial VARCHAR(256) NULL"))
            if "cert_sha256" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN cert_sha256 VARCHAR(64) NULL"))
            if "not_before" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN not_before TIMESTAMP NULL"))
            if "not_after" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN not_after TIMESTAMP NULL"))
            if "revocation_method" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN revocation_method VARCHAR(16) NULL"))
            if "revocation_status" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN revocation_status VARCHAR(16) NULL"))
            if "ocsp_response_b64" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN ocsp_response_b64 TEXT NULL"))
            if "crl_url_used" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN crl_url_used VARCHAR(1024) NULL"))
            if "timestamp_used" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN timestamp_used BOOLEAN NULL"))
            if "tsa_name" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN tsa_name VARCHAR(512) NULL"))
            if "tsa_url" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN tsa_url VARCHAR(512) NULL"))
            if "timestamp_token_b64" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN timestamp_token_b64 TEXT NULL"))
            if "timestamp_time" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN timestamp_time TIMESTAMP NULL"))
            if "validation_result" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN validation_result VARCHAR(32) NULL"))
            if "validation_report" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN validation_report JSONB NULL"))
            if "events" not in evidence_columns:
                conn.execute(text("ALTER TABLE signature_evidence ADD COLUMN events JSONB NULL"))
