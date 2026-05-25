from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from redis import Redis
from sqlmodel import Session, select

from app.core.config import settings
from app.domains.signatures._core.models import (
    SignatureArtifact,
    SignatureEvidence,
    SignatureRequest,
    SignatureRequestStatus,
)
from app.domains.signatures._core.provider_adapters.base import PresignPayload, SignatureProvider, SignedArtifact
from app.domains.signatures._core.security import decrypt_json, encrypt_json
from app.domains.signatures._core.storage.service import StorageService
from app.domains.signatures._core.timestamp.service import TimestampService
from app.domains.signatures._core.validation.validator import SignatureValidator


class AutofirmaProvider(SignatureProvider):
    def __init__(self, *, session: Session) -> None:
        self.session = session
        self.storage = StorageService()
        self.redis = Redis.from_url(settings.redis_url, decode_responses=True)
        self.validator = SignatureValidator()
        self.tsa = TimestampService()

    def _load_request(self, signature_request_id: UUID) -> SignatureRequest:
        req = self.session.get(SignatureRequest, signature_request_id)
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud de firma no encontrada.")
        return req

    def _redis_key(self, signature_request_id: UUID) -> str:
        return f"autofirma:presign:{signature_request_id}"

    def create_signature_request(
        self,
        *,
        signature_request_id: UUID,
        tenant_id: int,
        contract_id: int,
        signer_name: str,
        signer_email: str,
        provider_config: dict[str, Any],
        created_by_user_id: int | None,
    ) -> dict[str, Any]:
        return {
            "provider": "AUTOFIRMA",
            "message": "Solicitud preparada para presign local.",
            "signature_request_id": str(signature_request_id),
        }

    def presign(
        self,
        *,
        signature_request_id: UUID,
        provider_config: dict[str, Any],
    ) -> PresignPayload:
        req = self._load_request(signature_request_id)
        if req.provider.value != "AUTOFIRMA":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud no es AUTOFIRMA.")
        if req.status in {SignatureRequestStatus.SIGNED, SignatureRequestStatus.FAILED}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Solicitud ya finalizada.")

        artifact = self.session.exec(
            select(SignatureArtifact).where(SignatureArtifact.signature_request_id == req.id)
        ).one_or_none()
        if not artifact:
            raise HTTPException(status_code=500, detail="No existe artefacto base de firma.")
        original_bytes = open(artifact.original_pdf_path, "rb").read()
        digest = hashlib.sha256(original_bytes).digest()
        to_be_signed_b64 = base64.b64encode(digest).decode("ascii")

        ttl_seconds = int(provider_config.get("autofirma_presign_ttl_seconds") or 900)
        session_id = secrets.token_urlsafe(24)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)

        payload = {
            "session_id": session_id,
            "signature_request_id": str(req.id),
            "tenant_id": req.tenant_id,
            "contract_id": req.contract_id,
            "original_pdf_path": artifact.original_pdf_path,
            "original_pdf_sha256": req.pdf_original_sha256,
            "to_be_signed_b64": to_be_signed_b64,
            "algorithm": "SHA256withRSA",
            "expires_at": expires_at.isoformat(),
        }
        self.redis.setex(self._redis_key(req.id), ttl_seconds, encrypt_json(payload))

        req.status = SignatureRequestStatus.PRESIGN_READY
        req.presign_session_id = session_id
        req.expires_at = expires_at.replace(tzinfo=None)
        req.updated_at = datetime.now(timezone.utc)
        self.session.add(req)

        evidence = SignatureEvidence(
            signature_request_id=req.id,
            tenant_id=req.tenant_id,
            events={
                "event": "PRESIGN_GENERATED",
                "session_id": session_id,
                "expires_at": expires_at.isoformat(),
            },
        )
        self.session.add(evidence)
        self.session.commit()

        protocol_url = (
            f"afirma://sign?op=sign&format=CAdES&algorithm=SHA256withRSA&"
            f"dat={to_be_signed_b64}&session={session_id}&sig_req={req.id}"
        )
        return PresignPayload(
            session_id=session_id,
            algorithm="SHA256withRSA",
            to_be_signed_b64=to_be_signed_b64,
            expires_at=expires_at.replace(tzinfo=None),
            protocol_url=protocol_url,
        )

    def submit_client_signature(
        self,
        *,
        signature_request_id: UUID,
        client_payload: dict[str, Any],
        provider_config: dict[str, Any],
    ) -> None:
        req = self._load_request(signature_request_id)
        if req.provider.value != "AUTOFIRMA":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud no es AUTOFIRMA.")
        if req.status not in {SignatureRequestStatus.PRESIGN_READY, SignatureRequestStatus.CLIENT_RESULT_RECEIVED}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Estado invalido para client-result.")

        encrypted = self.redis.get(self._redis_key(req.id))
        if not encrypted:
            req.status = SignatureRequestStatus.EXPIRED
            req.updated_at = datetime.now(timezone.utc)
            self.session.add(req)
            self.session.commit()
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Sesion presign expirada.")
        presign_data = decrypt_json(encrypted)
        if client_payload.get("session_id") != presign_data.get("session_id"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="session_id invalido.")

        signature_b64 = (client_payload.get("signature_b64") or "").strip()
        if not signature_b64:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Falta signature_b64.")
        cert_chain = client_payload.get("cert_chain_b64") or []
        if not isinstance(cert_chain, list):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cert_chain_b64 invalido.")

        req.client_payload = {
            "session_id": client_payload.get("session_id"),
            "signature_b64": signature_b64,
            "cert_chain_b64": cert_chain,
            "device_hints": client_payload.get("device_hints") or {},
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }
        req.status = SignatureRequestStatus.CLIENT_RESULT_RECEIVED
        req.updated_at = datetime.now(timezone.utc)
        self.session.add(req)
        self.session.commit()

    def finalize(
        self,
        *,
        signature_request_id: UUID,
        provider_config: dict[str, Any],
    ) -> SignedArtifact:
        req = self._load_request(signature_request_id)
        if req.provider.value != "AUTOFIRMA":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud no es AUTOFIRMA.")
        if req.status not in {
            SignatureRequestStatus.CLIENT_RESULT_RECEIVED,
            SignatureRequestStatus.VALIDATING,
        }:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Estado invalido para finalize.")
        if not req.client_payload:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay client_payload.")

        artifact = self.session.exec(
            select(SignatureArtifact).where(SignatureArtifact.signature_request_id == req.id)
        ).one_or_none()
        if not artifact:
            raise HTTPException(status_code=500, detail="No existe artefacto base de firma.")
        original_bytes = open(artifact.original_pdf_path, "rb").read()
        signature_raw = base64.b64decode(req.client_payload.get("signature_b64", ""), validate=False)

        request_dir = self.storage.request_dir(
            tenant_id=req.tenant_id,
            contract_id=req.contract_id,
            request_id=req.id,
        )
        signed_pdf_path = request_dir / "signed.pdf"
        signature_container_path = request_dir / "signature.p7s"
        validation_report_path = request_dir / "validation_report.json"
        evidence_json_path = request_dir / "evidence.json"

        signed_bytes = original_bytes
        self.storage.write_bytes(signed_pdf_path, signed_bytes)
        self.storage.write_bytes(signature_container_path, signature_raw)

        tsa_result = self.tsa.request_timestamp(
            tsa_url=provider_config.get("tsa_url"),
            digest=hashlib.sha256(signature_raw).digest(),
            username=provider_config.get("tsa_username"),
            password=provider_config.get("tsa_password"),
        ) if provider_config.get("tsa_enabled") else self.tsa.request_timestamp(tsa_url=None, digest=b"")

        report = self.validator.validate(
            original_pdf=original_bytes,
            signed_pdf=signed_bytes,
            signature_container=signature_raw,
            cert_chain_b64=req.client_payload.get("cert_chain_b64") or [],
            tsa_used=tsa_result.used,
        )
        report_data = dict(report.report)
        report_data["timestamp"] = self.tsa.build_evidence_fragment(tsa_result)

        evidence = {
            "events": [
                {"event": "PRESIGN_GENERATED", "at": req.created_at.isoformat()},
                {"event": "CLIENT_RESULT_RECEIVED", "at": req.updated_at.isoformat()},
                {"event": "SIGNED_COMPLETE", "at": datetime.now(timezone.utc).isoformat()},
            ],
            "cert_chain_count": len(req.client_payload.get("cert_chain_b64") or []),
            "client_device_hints": req.client_payload.get("device_hints") or {},
            "session_id": req.client_payload.get("session_id"),
            **self.tsa.build_evidence_fragment(tsa_result),
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
            SignatureRequestStatus.SIGNED
            if report.conclusion == "TOTAL_PASSED"
            or (
                report.conclusion == "INDETERMINATE"
                and bool(provider_config.get("indeterminate_as_success"))
            )
            else SignatureRequestStatus.FAILED
        )
        req.failure_reason = None if req.status == SignatureRequestStatus.SIGNED else report.reason
        req.signed_at = datetime.now(timezone.utc) if req.status == SignatureRequestStatus.SIGNED else None
        req.updated_at = datetime.now(timezone.utc)
        self.session.add(req)

        self.session.add(
            SignatureEvidence(
                signature_request_id=req.id,
                tenant_id=req.tenant_id,
                cert_subject=None,
                cert_issuer=None,
                cert_serial=None,
                cert_sha256=None,
                trust_chain_ok=report_data.get("certificate_validation", {}).get("trust_chain_ok"),
                revocation_ok=report_data.get("certificate_validation", {}).get("revocation_ok"),
                tsl_source_used=report_data.get("tsl", {}).get("source"),
                tsl_sequence=report_data.get("tsl", {}).get("sequence_number"),
                timestamp_used=tsa_result.used,
                timestamp_authority=tsa_result.authority,
                events=evidence,
            )
        )
        self.session.commit()
        self.redis.delete(self._redis_key(req.id))

        return SignedArtifact(
            signed_pdf_path=str(signed_pdf_path),
            signature_container_path=str(signature_container_path),
            validation_report_path=str(validation_report_path),
            evidence_json_path=str(evidence_json_path),
            signed_pdf_sha256=signed_sha,
        )

    def get_status(
        self,
        *,
        signature_request_id: UUID,
    ) -> str:
        req = self._load_request(signature_request_id)
        return req.status.value

