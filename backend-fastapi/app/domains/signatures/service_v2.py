from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.core.config import settings
from app.core.email import _send_email
from app.platform.contracts_core.models import Contract, ContractDocument, ContractDocumentType
from app.models.user import User
from app.domains.signatures._core.factory import SignatureProviderFactory
from app.domains.signatures._core.models import (
    SignatureArtifact,
    SignatureProviderType,
    SignatureRequest,
    SignatureRequestStatus,
    TenantSignatureConfig,
)
from app.domains.signatures._core.public_links import build_autofirma_public_url
from app.domains.signatures._core.providers.base import PresignPayload, SignedArtifact
from app.domains.signatures._core.storage.service import StorageService


def get_or_create_tenant_signature_config(session: Session, tenant_id: int) -> TenantSignatureConfig:
    cfg = session.exec(
        select(TenantSignatureConfig).where(TenantSignatureConfig.tenant_id == tenant_id)
    ).one_or_none()
    if cfg:
        if not cfg.autofirma_session_ttl_minutes or cfg.autofirma_session_ttl_minutes <= 0:
            cfg.autofirma_session_ttl_minutes = max(1, int((cfg.autofirma_presign_ttl_seconds or 600) / 60))
            session.add(cfg)
            session.commit()
            session.refresh(cfg)
        return cfg
    cfg = TenantSignatureConfig(tenant_id=tenant_id)
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return cfg


def update_tenant_signature_config(
    session: Session,
    *,
    tenant_id: int,
    updates: dict[str, Any],
    updated_by_id: int | None,
) -> TenantSignatureConfig:
    cfg = get_or_create_tenant_signature_config(session, tenant_id)
    for key, value in updates.items():
        if value is None:
            continue
        if not hasattr(cfg, key):
            continue
        setattr(cfg, key, value)
    cfg.updated_by_id = updated_by_id
    cfg.updated_at = datetime.now(timezone.utc)
    # Sync legacy fields with new config.
    cfg.autofirma_presign_ttl_seconds = int(max(1, cfg.autofirma_session_ttl_minutes) * 60)
    cfg.tsa_enabled = cfg.autofirma_tsa_enabled
    cfg.tsa_url = cfg.autofirma_tsa_url
    session.add(cfg)
    session.commit()
    session.refresh(cfg)
    return cfg


def _contract_or_404(session: Session, *, contract_id: int, tenant_id: int) -> Contract:
    contract = session.exec(
        select(Contract).where(Contract.id == contract_id, Contract.tenant_id == tenant_id)
    ).one_or_none()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contrato no encontrado.")
    return contract


def _contract_pdf_or_404(session: Session, *, contract_id: int, tenant_id: int) -> Path:
    doc = session.exec(
        select(ContractDocument)
        .where(
            ContractDocument.contract_id == contract_id,
            ContractDocument.tenant_id == tenant_id,
            ContractDocument.doc_type == ContractDocumentType.CONTRACT,
        )
        .order_by(ContractDocument.created_at.desc())
    ).first()
    if not doc or not doc.path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No existe PDF de contrato para iniciar firma.",
        )
    path = Path(doc.path)
    if path.exists():
        return path

    # Recuperacion para rutas legacy (p.ej. '/data/contracts/...') cuando cambia el entorno.
    candidates: list[Path] = []
    configured_base = Path(settings.contracts_storage_path)
    posix_marker = "/data/contracts/"
    raw_path = str(doc.path)
    if posix_marker in raw_path:
        suffix = raw_path.split(posix_marker, 1)[1]
        candidates.append(configured_base / Path(suffix))
        candidates.append(Path.cwd() / configured_base / Path(suffix))
    # Ruta esperada actual por contrato.
    candidates.extend(
        sorted(
            (configured_base / f"tenant_{tenant_id}" / f"contract_{contract_id}" / "documents" / "contract").glob("*.pdf"),
            key=lambda p: p.stat().st_mtime if p.exists() else 0.0,
            reverse=True,
        )
    )
    # Variante relativa desde raiz del backend.
    backend_base = Path(__file__).resolve().parents[2]
    candidates.extend(
        sorted(
            (backend_base / configured_base / f"tenant_{tenant_id}" / f"contract_{contract_id}" / "documents" / "contract").glob("*.pdf"),
            key=lambda p: p.stat().st_mtime if p.exists() else 0.0,
            reverse=True,
        )
    )

    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate.resolve()) if candidate.exists() else str(candidate)
        if key in seen:
            continue
        seen.add(key)
        if candidate.exists() and candidate.is_file():
            doc.path = str(candidate)
            session.add(doc)
            session.commit()
            return candidate

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="El PDF original no existe en almacenamiento. Regenera el contrato y crea una solicitud nueva.",
    )


def _provider_config_dict(cfg: TenantSignatureConfig) -> dict[str, Any]:
    ttl_minutes = cfg.autofirma_session_ttl_minutes
    if ttl_minutes is None or ttl_minutes <= 0:
        ttl_minutes = max(1, int((cfg.autofirma_presign_ttl_seconds or 600) / 60))
    return {
        "allow_signaturit": cfg.allow_signaturit,
        "allow_autofirma": cfg.allow_autofirma,
        "autofirma_session_ttl_minutes": ttl_minutes,
        "autofirma_presign_ttl_seconds": cfg.autofirma_presign_ttl_seconds,
        "autofirma_tsa_enabled": cfg.autofirma_tsa_enabled,
        "autofirma_tsa_url": cfg.autofirma_tsa_url,
        "tsa_enabled": cfg.tsa_enabled,
        "tsa_url": cfg.tsa_url,
        "tsa_username": cfg.tsa_username,
        "tsa_password": cfg.tsa_password,
        "indeterminate_as_success": cfg.indeterminate_as_success,
    }


def create_signature_request_v2(
    session: Session,
    *,
    tenant_id: int,
    contract_id: int,
    provider: SignatureProviderType | None,
    signer_name: str | None,
    signer_email: str | None,
    created_by: User,
    signer_user_id: int | None = None,
) -> tuple[SignatureRequest, dict[str, Any]]:
    cfg = get_or_create_tenant_signature_config(session, tenant_id)
    selected_provider = provider or cfg.signature_provider_default
    if (
        selected_provider == SignatureProviderType.AUTOFIRMA
        and not cfg.allow_autofirma
        and not created_by.is_super_admin
    ):
        raise HTTPException(status_code=403, detail="AUTOFIRMA no habilitado para este tenant.")
    if selected_provider == SignatureProviderType.SIGNATURIT and not cfg.allow_signaturit:
        raise HTTPException(status_code=403, detail="Signaturit no habilitado para este tenant.")

    contract = _contract_or_404(session, contract_id=contract_id, tenant_id=tenant_id)
    pdf_path = _contract_pdf_or_404(session, contract_id=contract.id, tenant_id=tenant_id)
    original_bytes = pdf_path.read_bytes()
    storage = StorageService()
    snapshot_sha = storage.sha256_bytes(original_bytes)
    snapshot_id = f"contract-{contract.id}-{snapshot_sha[:16]}"

    signer_user = None
    if signer_user_id:
        signer_user = session.get(User, signer_user_id)
        if not signer_user:
            raise HTTPException(status_code=404, detail="signer_user_id no encontrado.")
        if not created_by.is_super_admin and signer_user.tenant_id != tenant_id:
            raise HTTPException(status_code=403, detail="El firmante no pertenece al tenant.")
    effective_signer_name = (signer_name or "").strip() or (signer_user.full_name if signer_user else "")
    effective_signer_email = (signer_email or "").strip().lower() or (signer_user.email.lower() if signer_user else "")

    request_ttl_hours = max(1, int(settings.signature_request_ttl_hours or 168))
    req = SignatureRequest(
        tenant_id=tenant_id,
        contract_id=contract.id,
        provider=selected_provider,
        status=SignatureRequestStatus.PENDING,
        created_by_user_id=created_by.id,
        signer_user_id=signer_user_id,
        signer_name=effective_signer_name or None,
        signer_email=effective_signer_email or None,
        contract_snapshot_id=snapshot_id,
        contract_version=contract.updated_at.isoformat() if contract.updated_at else None,
        pdf_original_sha256=snapshot_sha,
        pdf_original_size_bytes=len(original_bytes),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=request_ttl_hours),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(req)
    session.commit()
    session.refresh(req)

    request_dir = storage.request_dir(tenant_id=tenant_id, request_id=req.id)
    original_copy_path = request_dir / "original.pdf"
    storage.write_bytes(original_copy_path, original_bytes)
    artifact = SignatureArtifact(
        signature_request_id=req.id,
        tenant_id=tenant_id,
        contract_id=contract.id,
        original_pdf_path=str(original_copy_path),
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    session.add(artifact)
    session.commit()

    provider_impl = SignatureProviderFactory(session=session).get(selected_provider)
    provider_payload = provider_impl.create_signature_request(
        signature_request_id=req.id,
        contract_id=contract.id,
        signer_id=signer_user_id,
        tenant_id=tenant_id,
        created_by=created_by.id,
        config=_provider_config_dict(cfg),
        signer_name=req.signer_name,
        signer_email=req.signer_email,
    )
    # Si el proveedor devuelve URL de firma (Signaturit), enviamos tambien por email.
    if isinstance(provider_payload, dict):
        signing_url = provider_payload.get("signing_url")
        recipient = (req.signer_email or "").strip().lower()
        email_sent = False
        if req.provider == SignatureProviderType.AUTOFIRMA and recipient and req.expires_at:
            signing_url = build_autofirma_public_url(
                signature_request_id=req.id,
                tenant_id=tenant_id,
                expires_at=req.expires_at,
            )
            provider_payload["public_signing_url"] = signing_url
        if signing_url and recipient:
            subject = "Contrato para firma"
            body = (
                "Se ha generado una solicitud de firma electronica del contrato.\n\n"
                f"Enlace de firma: {signing_url}\n\n"
                f"Contrato: CT-{contract.id}"
            )
            email_sent = _send_email([recipient], subject, body)
        provider_payload["email_sent"] = bool(email_sent)
        provider_payload["email_recipient"] = recipient or None
    req.provider_payload = provider_payload
    if isinstance(provider_payload, dict):
        legacy_id = provider_payload.get("legacy_request_id")
        if isinstance(legacy_id, int):
            req.provider_request_id = legacy_id
    req.updated_at = datetime.now(timezone.utc)
    session.add(req)
    session.commit()
    session.refresh(req)
    return req, provider_payload


def _as_uuid(signature_request_id: UUID | str) -> UUID:
    if isinstance(signature_request_id, UUID):
        return signature_request_id
    try:
        return UUID(str(signature_request_id))
    except Exception as exc:
        raise HTTPException(status_code=400, detail="signature_request_id invalido.") from exc


def presign_autofirma(
    session: Session,
    *,
    signature_request_id: UUID | str,
    tenant_id: int,
) -> PresignPayload:
    req_id = _as_uuid(signature_request_id)
    req = session.get(SignatureRequest, req_id)
    if not req or req.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    cfg = get_or_create_tenant_signature_config(session, tenant_id)
    provider_impl = SignatureProviderFactory(session=session).get(req.provider)
    return provider_impl.presign(
        signature_request_id=req.id,
        config=_provider_config_dict(cfg),
    )


def submit_client_result_autofirma(
    session: Session,
    *,
    signature_request_id: UUID | str,
    tenant_id: int,
    client_payload: dict[str, Any],
) -> None:
    req_id = _as_uuid(signature_request_id)
    req = session.get(SignatureRequest, req_id)
    if not req or req.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    cfg = get_or_create_tenant_signature_config(session, tenant_id)
    provider_impl = SignatureProviderFactory(session=session).get(req.provider)
    provider_impl.submit_client_result(
        signature_request_id=req.id,
        payload=client_payload,
        config=_provider_config_dict(cfg),
    )


def finalize_signature_request(
    session: Session,
    *,
    signature_request_id: UUID | str,
    tenant_id: int,
) -> SignedArtifact:
    req_id = _as_uuid(signature_request_id)
    req = session.get(SignatureRequest, req_id)
    if not req or req.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    cfg = get_or_create_tenant_signature_config(session, tenant_id)
    provider_impl = SignatureProviderFactory(session=session).get(req.provider)
    return provider_impl.finalize(
        signature_request_id=req.id,
        config=_provider_config_dict(cfg),
    )


def get_signature_request_v2(
    session: Session,
    *,
    signature_request_id: UUID | str,
    tenant_id: int,
) -> SignatureRequest:
    req_id = _as_uuid(signature_request_id)
    req = session.get(SignatureRequest, req_id)
    if not req or req.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada.")
    return req


def get_signature_artifact_v2(
    session: Session,
    *,
    signature_request_id: UUID | str,
    tenant_id: int,
) -> SignatureArtifact:
    req_id = _as_uuid(signature_request_id)
    artifact = session.exec(
        select(SignatureArtifact).where(
            SignatureArtifact.signature_request_id == req_id,
            SignatureArtifact.tenant_id == tenant_id,
        )
    ).one_or_none()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artefacto de firma no encontrado.")
    return artifact


