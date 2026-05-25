from __future__ import annotations

import base64
from datetime import datetime, timezone
import hashlib
from typing import Any

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from fastapi import HTTPException
from sqlmodel import Session, select

from app.domains.signatures._core.models import SignatureArtifact, SignatureEvidence, SignatureRequest, SignatureRequestStatus
from app.domains.signatures._core.providers.base import SignedArtifact
from app.domains.signatures._core.storage.service import StorageService
from app.domains.signatures._core.timestamp.service import TimestampService
from app.domains.signatures._core.validation.validator import SignatureValidator
from .session_store import AutofirmaSessionStore


class AutofirmaFinalizeService:
    def __init__(
        self,
        *,
        session: Session,
        storage: StorageService,
        session_store: AutofirmaSessionStore,
        validator: SignatureValidator,
        tsa: TimestampService,
    ) -> None:
        self.session = session
        self.storage = storage
        self.session_store = session_store
        self.validator = validator
        self.tsa = tsa

    def run(self, *, req: SignatureRequest, config: dict[str, Any]) -> SignedArtifact:
        artifact = self.session.exec(
            select(SignatureArtifact).where(
                SignatureArtifact.signature_request_id == req.id,
                SignatureArtifact.tenant_id == req.tenant_id,
            )
        ).one_or_none()
        if not artifact:
            raise HTTPException(status_code=500, detail="No existe artefacto base de firma.")
        if not req.client_payload:
            raise HTTPException(status_code=400, detail="No hay client_payload.")

        original_bytes = self.storage.read_bytes(artifact.original_pdf_path)
        signature_raw = base64.b64decode(str(req.client_payload.get("signature_b64") or "").encode("ascii"), validate=False)
        signed_pdf_b64 = str(req.client_payload.get("signed_pdf_b64") or "").strip()
        cms_signature_b64 = str(req.client_payload.get("cms_signature_b64") or "").strip()

        request_dir = self.storage.request_dir(tenant_id=req.tenant_id, request_id=req.id)
        signed_pdf_path = request_dir / "signed.pdf"
        signature_container_path = request_dir / "signature.p7s"
        validation_report_path = request_dir / "validation_report.json"
        evidence_json_path = request_dir / "evidence.json"

        signed_bytes = original_bytes
        signature_container = signature_raw
        if signed_pdf_b64:
            signed_bytes = base64.b64decode(signed_pdf_b64.encode("ascii"), validate=False)
        elif signature_raw.startswith(b"%PDF"):
            signed_bytes = signature_raw
        if cms_signature_b64:
            signature_container = base64.b64decode(cms_signature_b64.encode("ascii"), validate=False)
        self.storage.write_bytes(signed_pdf_path, signed_bytes)
        self.storage.write_bytes(signature_container_path, signature_container)

        tsa_enabled = bool(config.get("autofirma_tsa_enabled", True))
        tsa_result = (
            self.tsa.request_timestamp(
                tsa_url=config.get("autofirma_tsa_url"),
                digest=hashlib.sha256(signature_container).digest(),
                username=config.get("tsa_username"),
                password=config.get("tsa_password"),
            )
            if tsa_enabled
            else self.tsa.request_timestamp(tsa_url=None, digest=b"")
        )

        report = self.validator.validate(
            original_pdf=original_bytes,
            signed_pdf=signed_bytes,
            signature_container=signature_container,
            cert_chain_b64=req.client_payload.get("cert_chain_b64") or [],
            tsa_used=tsa_result.used,
            require_strict_revocation=bool(config.get("autofirma_require_strict_revocation", False)),
        )
        report_data = dict(report.report)
        report_data["timestamp"] = self.tsa.build_evidence_fragment(tsa_result)
        validation_result = str(report_data.get("conclusion") or report.conclusion)
        cert_validation = report_data.get("certificate_validation", {})

        cert_subject_dn = None
        cert_issuer_dn = None
        cert_serial = None
        cert_sha256 = None
        not_before = None
        not_after = None
        cert_chain = req.client_payload.get("cert_chain_b64") or []
        if cert_chain:
            try:
                first_raw = base64.b64decode(str(cert_chain[0]).encode("ascii"), validate=False)
                cert = x509.load_der_x509_certificate(first_raw)
                cert_subject_dn = cert.subject.rfc4514_string()
                cert_issuer_dn = cert.issuer.rfc4514_string()
                cert_serial = format(cert.serial_number, "x")
                cert_sha256 = cert.fingerprint(hashes.SHA256()).hex()
                not_before = cert.not_valid_before_utc.isoformat()
                not_after = cert.not_valid_after_utc.isoformat()
            except Exception:
                pass
        parsed_timestamp_time = None
        if tsa_result.gen_time:
            try:
                parsed_timestamp_time = datetime.fromisoformat(tsa_result.gen_time)
            except Exception:
                parsed_timestamp_time = None

        evidence = {
            "events": [
                {"event": "PRESIGNED", "ts": req.created_at.isoformat(), "detail": None},
                {
                    "event": "CLIENT_RESULT",
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "detail": {"session_id": req.client_payload.get("session_id")},
                },
                {
                    "event": "FINALIZE",
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "detail": {"validation_result": validation_result},
                },
            ],
            "signer_ip": req.client_payload.get("ip"),
            "signer_user_agent": req.client_payload.get("user_agent"),
            "device_hints": req.client_payload.get("device_hints") or {},
            "cert_subject_dn": cert_subject_dn,
            "cert_issuer_dn": cert_issuer_dn,
            "cert_serial": cert_serial,
            "cert_sha256": cert_sha256,
            "not_before": not_before,
            "not_after": not_after,
            "revocation_method": cert_validation.get("revocation_method") or "NONE",
            "revocation_status": cert_validation.get("revocation_status") or "UNKNOWN",
            "ocsp_response_b64": cert_validation.get("ocsp_response_b64"),
            "crl_url_used": cert_validation.get("crl_url_used"),
            "timestamp_used": tsa_result.used,
            "tsa_name": tsa_result.authority,
            "tsa_url": config.get("autofirma_tsa_url"),
            "timestamp_token_b64": tsa_result.token_b64,
            "timestamp_time": tsa_result.gen_time,
        }

        self.storage.write_json(validation_report_path, report_data)
        self.storage.write_json(evidence_json_path, evidence)

        signed_sha = self.storage.sha256_bytes(signed_bytes)
        artifact.signed_pdf_path = str(signed_pdf_path)
        artifact.signature_container_path = str(signature_container_path)
        artifact.validation_report_path = str(validation_report_path)
        artifact.evidence_json_path = str(evidence_json_path)
        artifact.signed_pdf_sha256 = signed_sha
        artifact.updated_at = datetime.now(timezone.utc)
        self.session.add(artifact)

        req.signed_pdf_sha256 = signed_sha
        req.status = (
            SignatureRequestStatus.SIGNED if validation_result == "TOTAL_PASSED" else SignatureRequestStatus.FAILED
        )
        req.error_detail = None if req.status == SignatureRequestStatus.SIGNED else report.reason
        req.signed_at = datetime.now(timezone.utc) if req.status == SignatureRequestStatus.SIGNED else None
        req.updated_at = datetime.now(timezone.utc)
        self.session.add(req)

        self.session.add(
            SignatureEvidence(
                signature_request_id=req.id,
                tenant_id=req.tenant_id,
                signer_ip=req.client_payload.get("ip"),
                signer_user_agent=req.client_payload.get("user_agent"),
                device_hints=req.client_payload.get("device_hints") or {},
                cert_subject_dn=cert_subject_dn,
                cert_issuer_dn=cert_issuer_dn,
                cert_serial=cert_serial,
                cert_sha256=cert_sha256,
                not_before=datetime.fromisoformat(not_before) if not_before else None,
                not_after=datetime.fromisoformat(not_after) if not_after else None,
                revocation_method=cert_validation.get("revocation_method") or "NONE",
                revocation_status=cert_validation.get("revocation_status") or "UNKNOWN",
                ocsp_response_b64=cert_validation.get("ocsp_response_b64"),
                crl_url_used=cert_validation.get("crl_url_used"),
                timestamp_used=tsa_result.used,
                tsa_name=tsa_result.authority,
                tsa_url=config.get("autofirma_tsa_url"),
                timestamp_token_b64=tsa_result.token_b64,
                timestamp_time=parsed_timestamp_time,
                validation_result=validation_result,
                validation_report=report_data,
                events=evidence.get("events"),
                created_at=datetime.now(timezone.utc),
            )
        )
        self.session.commit()
        self.session_store.delete(signature_request_id=req.id)

        return SignedArtifact(
            signed_pdf_path=str(signed_pdf_path),
            signature_container_path=str(signature_container_path),
            validation_report_path=str(validation_report_path),
            evidence_json_path=str(evidence_json_path),
            signed_pdf_sha256=signed_sha,
        )

