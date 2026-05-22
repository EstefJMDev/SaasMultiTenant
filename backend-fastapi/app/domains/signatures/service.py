from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.platform.contracts_core.models import Contract, ContractDocument, ContractDocumentType, ContractStatus
from app.core.config import settings
from app.domains.signatures._core.models import SignatureProviderEvent, SignatureProviderRequest
from app.domains.signatures._core.signaturit_client import SignaturitClient
from app.storage.local import build_contract_base_path


def _require_signaturit_config() -> None:
    if not settings.signaturit_api_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integracion Signaturit no configurada (falta token).",
        )


def _contract_or_404(session: Session, *, tenant_id: int, contract_id: int) -> Contract:
    contract = session.exec(
        select(Contract).where(Contract.id == contract_id, Contract.tenant_id == tenant_id)
    ).one_or_none()
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contrato no encontrado.")
    return contract


def _contract_pdf_or_404(session: Session, *, tenant_id: int, contract_id: int) -> Path:
    doc = session.exec(
        select(ContractDocument).where(
            ContractDocument.tenant_id == tenant_id,
            ContractDocument.contract_id == contract_id,
            ContractDocument.doc_type == ContractDocumentType.CONTRACT,
        ).order_by(ContractDocument.created_at.desc())
    ).first()
    if not doc or not doc.path:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No existe documento CONTRACT para firmar.",
        )
    path = Path(doc.path)
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El PDF del contrato no existe en almacenamiento.",
        )
    return path


def _events_url() -> str | None:
    candidate: str | None = None
    if settings.signaturit_events_url:
        candidate = settings.signaturit_events_url
    elif settings.public_api_base_url:
        candidate = f"{settings.public_api_base_url.rstrip('/')}/public/signaturit/events"

    if not candidate:
        return None

    parsed = urlparse(candidate)
    host = (parsed.hostname or "").lower()
    # En local (localhost/loopback) Signaturit rechaza el callback.
    if host in {"localhost", "127.0.0.1", "::1"}:
        return None
    # Signaturit exige callback publico por HTTPS.
    if parsed.scheme.lower() != "https":
        return None
    return candidate


def _save_provider_event(
    session: Session,
    *,
    request_id: int,
    event_type: str,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    session.add(
        SignatureProviderEvent(
            signature_request_id=request_id,
            event_type=event_type,
            payload=payload or {},
        )
    )


def _extract_signaturit_ids(provider_response: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    signature_id = provider_response.get("id")
    document_id = None
    signing_url = provider_response.get("url")

    documents = provider_response.get("documents")
    if isinstance(documents, list) and documents:
        first_doc = documents[0] if isinstance(documents[0], dict) else {}
        document_id = first_doc.get("id")
        if not signing_url:
            signing_url = first_doc.get("url")

    if not signing_url and signature_id and document_id:
        is_sandbox = "sandbox" in settings.signaturit_base_url.lower()
        app_base = "https://app.sandbox.signaturit.com" if is_sandbox else "https://app.signaturit.com"
        signing_url = f"{app_base}/document/{signature_id}/{document_id}"
    return (
        str(signature_id) if signature_id is not None else None,
        str(document_id) if document_id is not None else None,
        str(signing_url) if signing_url else None,
    )


def create_signaturit_request(
    session: Session,
    *,
    tenant_id: int,
    contract_id: int,
    signer_name: str,
    signer_email: str,
    delivery_type: str,
    signature_mode: str = "biometric",
    digital_certificate_name: str | None = None,
    created_by_id: int | None,
) -> tuple[SignatureProviderRequest, str | None]:
    _require_signaturit_config()
    configured_mode = (settings.signaturit_default_signature_mode or "").strip().lower()
    requested_mode = (signature_mode or "").strip().lower()
    if configured_mode in {"biometric", "certificate"}:
        signature_mode = configured_mode
    elif requested_mode in {"biometric", "certificate"}:
        signature_mode = requested_mode
    else:
        signature_mode = "biometric"
    contract = _contract_or_404(session, tenant_id=tenant_id, contract_id=contract_id)
    contract_pdf = _contract_pdf_or_404(session, tenant_id=tenant_id, contract_id=contract_id)

    client = SignaturitClient()
    payload = {
        "contract_id": contract_id,
        "tenant_id": tenant_id,
        "requested_by": created_by_id,
        "signature_mode": signature_mode,
    }
    if digital_certificate_name:
        payload["digital_certificate_name"] = digital_certificate_name
    try:
        provider_response = client.create_signature(
            file_path=contract_pdf,
            signer_name=signer_name,
            signer_email=signer_email,
            events_url=_events_url(),
            delivery_type=delivery_type,
            signature_mode=signature_mode,
            digital_certificate_name=digital_certificate_name,
            metadata=payload,
        )
    except httpx.HTTPStatusError as exc:
        provider_detail = exc.response.text.strip()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Signaturit rechazo la solicitud ({exc.response.status_code}): {provider_detail[:500]}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo conectar con Signaturit: {exc}",
        ) from exc
    provider_signature_id, provider_document_id, signing_url = _extract_signaturit_ids(provider_response)

    req = SignatureProviderRequest(
        tenant_id=tenant_id,
        contract_id=contract_id,
        created_by_id=created_by_id,
        provider="signaturit",
        status=str(provider_response.get("status") or "created"),
        provider_signature_id=provider_signature_id,
        provider_document_id=provider_document_id,
        signer_name=signer_name,
        signer_email=signer_email,
        source_pdf_path=str(contract_pdf),
        request_payload=payload,
        provider_response=provider_response,
        meta_json={"signing_url": signing_url} if signing_url else {},
        updated_at=datetime.now(timezone.utc),
    )
    session.add(req)
    session.commit()
    session.refresh(req)

    _save_provider_event(
        session,
        request_id=req.id,
        event_type="request.created",
        payload=provider_response,
    )

    contract.status = ContractStatus.IN_SIGNATURE
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    session.commit()
    session.refresh(req)
    return req, signing_url


def get_signature_request(
    session: Session,
    *,
    tenant_id: int,
    request_id: int,
) -> SignatureProviderRequest:
    req = session.exec(
        select(SignatureProviderRequest).where(
            SignatureProviderRequest.id == request_id,
            SignatureProviderRequest.tenant_id == tenant_id,
        )
    ).one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud de firma no encontrada.")
    return req


def list_signature_requests(
    session: Session,
    *,
    tenant_id: int,
    contract_id: int | None = None,
) -> list[SignatureProviderRequest]:
    statement = select(SignatureProviderRequest).where(SignatureProviderRequest.tenant_id == tenant_id)
    if contract_id is not None:
        statement = statement.where(SignatureProviderRequest.contract_id == contract_id)
    statement = statement.order_by(SignatureProviderRequest.created_at.desc())
    return session.exec(statement).all()


def _persist_signed_documents(
    session: Session,
    *,
    req: SignatureProviderRequest,
    signed_bytes: bytes,
    audit_trail_bytes: bytes | None,
) -> None:
    base = build_contract_base_path(req.tenant_id, req.contract_id) / "signed"
    base.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    signed_path = base / f"signaturit_signed_{stamp}.pdf"
    signed_path.write_bytes(signed_bytes)

    audit_path: Path | None = None
    if audit_trail_bytes:
        audit_path = base / f"signaturit_audit_{stamp}.pdf"
        audit_path.write_bytes(audit_trail_bytes)

    req.signed_pdf_path = str(signed_path)
    req.audit_trail_path = str(audit_path) if audit_path else req.audit_trail_path
    req.updated_at = datetime.now(timezone.utc)

    existing_signed_doc = session.exec(
        select(ContractDocument).where(
            ContractDocument.tenant_id == req.tenant_id,
            ContractDocument.contract_id == req.contract_id,
            ContractDocument.doc_type == ContractDocumentType.SIGNED,
        )
    ).first()
    if existing_signed_doc:
        existing_signed_doc.path = str(signed_path)
        session.add(existing_signed_doc)
    else:
        session.add(
            ContractDocument(
                tenant_id=req.tenant_id,
                contract_id=req.contract_id,
                doc_type=ContractDocumentType.SIGNED,
                path=str(signed_path),
                created_by_id=req.created_by_id,
            )
        )


def sync_request_status(
    session: Session,
    *,
    req: SignatureProviderRequest,
) -> SignatureProviderRequest:
    _require_signaturit_config()
    if not req.provider_signature_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La solicitud no tiene provider_signature_id.",
        )

    client = SignaturitClient()
    try:
        details = client.get_signature(req.provider_signature_id)
    except httpx.HTTPStatusError as exc:
        provider_detail = exc.response.text.strip()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Signaturit devolvio error al consultar firma ({exc.response.status_code}): {provider_detail[:500]}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo conectar con Signaturit al consultar firma: {exc}",
        ) from exc
    provider_status = str(details.get("status") or req.status or "unknown")
    req.status = provider_status
    req.provider_response = details
    req.updated_at = datetime.now(timezone.utc)
    _save_provider_event(
        session,
        request_id=req.id,
        event_type="request.synced",
        payload={"status": provider_status},
    )

    if provider_status.lower() in {"completed", "signed"} and req.provider_document_id:
        try:
            signed_bytes = client.download_signed(
                signature_id=req.provider_signature_id,
                document_id=req.provider_document_id,
            )
        except httpx.HTTPStatusError as exc:
            provider_detail = exc.response.text.strip()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Signaturit devolvio error al descargar firmado ({exc.response.status_code}): {provider_detail[:500]}",
            ) from exc
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"No se pudo conectar con Signaturit al descargar firmado: {exc}",
            ) from exc
        audit_bytes: bytes | None = None
        try:
            client.generate_audit_trail(req.provider_signature_id)
            audit_bytes = client.download_audit_trail(
                signature_id=req.provider_signature_id,
                document_id=req.provider_document_id,
            )
        except Exception:
            audit_bytes = None

        _persist_signed_documents(
            session,
            req=req,
            signed_bytes=signed_bytes,
            audit_trail_bytes=audit_bytes,
        )
        req.completed_at = req.completed_at or datetime.now(timezone.utc)

        contract = _contract_or_404(session, tenant_id=req.tenant_id, contract_id=req.contract_id)
        contract.status = ContractStatus.SIGNED
        contract.signed_at = contract.signed_at or datetime.now(timezone.utc)
        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)

    session.add(req)
    session.commit()
    session.refresh(req)
    return req


def process_signaturit_webhook(session: Session, payload: dict[str, Any]) -> None:
    doc = payload.get("document") if isinstance(payload, dict) else None
    if not isinstance(doc, dict):
        return

    signature_id = str(doc.get("id") or "")
    if not signature_id:
        return

    req = session.exec(
        select(SignatureProviderRequest).where(
            SignatureProviderRequest.provider == "signaturit",
            SignatureProviderRequest.provider_signature_id == signature_id,
        )
    ).first()
    if not req:
        # Webhook de documento/sesion no enlazado: lo registramos solo en BD si existe solicitud por documento.
        req = session.exec(
            select(SignatureProviderRequest).where(
                SignatureProviderRequest.provider == "signaturit",
                SignatureProviderRequest.provider_document_id == signature_id,
            )
        ).first()
    if not req:
        return

    event_type = str(payload.get("type") or "webhook.received")
    _save_provider_event(session, request_id=req.id, event_type=event_type, payload=payload)

    # Intentamos sincronizar estado real tras cada webhook.
    try:
        sync_request_status(session, req=req)
    except Exception:
        req.updated_at = datetime.now(timezone.utc)
        session.add(req)
        session.commit()


