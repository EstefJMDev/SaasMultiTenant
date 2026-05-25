from pathlib import Path
import json
from typing import Optional
import hmac
import hashlib
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from fastapi.responses import FileResponse
from fastapi.responses import RedirectResponse
from fastapi.responses import PlainTextResponse
from sqlmodel import Session, select

from app.api.deps import get_current_active_user
from app.core.config import settings
from app.core.email import _send_email
from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_session
from app.models.user import User
from app.core.permissions import (
    SIGNATURES_ADMIN,
    SIGNATURES_CONFIG,
    SIGNATURES_READ,
    SIGNATURES_WRITE,
)
from app.platform.tools.deps import require_perm, require_tool
from app.domains.signatures._core.autofirma.session_store import AutofirmaSessionStore
from app.domains.signatures._core.models import SignatureRequest, SignatureRequestStatus
from app.domains.signatures._core.models import SignatureProviderType
from app.domains.signatures.schemas import (
    AutofirmaClientResultPayload,
    AutofirmaPresignResponse,
    PublicSignatureStatusResponse,
    SignatureFinalizeResponse,
    SignedDownloadUrlResponse,
    SignatureRequestCreate,
    SignatureRequestRead,
    SignatureRequestReadV2,
    SignatureStartResponse,
    TenantSignatureConfigRead,
    TenantSignatureConfigUpdate,
)
from app.domains.signatures._core.public_links import verify_autofirma_public_signature
from app.core.tenancy import tenant_required_for_superadmin
from app.domains.signatures.service import (
    create_signaturit_request,
    get_signature_request,
    list_signature_requests,
    process_signaturit_webhook,
    sync_request_status,
)
from app.domains.signatures.service_v2 import (
    finalize_signature_request,
    get_or_create_tenant_signature_config,
    get_signature_artifact_v2,
    get_signature_request_v2,
    presign_autofirma,
    submit_client_result_autofirma,
    update_tenant_signature_config,
)


router = APIRouter(
    prefix="/signatures",
    tags=["signatures"],
    dependencies=[Depends(require_tool("signatures"))],
)
public_router = APIRouter()


def _is_signer_or_admin(current_user: User, signer_user_id: Optional[int], created_by_user_id: Optional[int]) -> bool:
    if current_user.is_super_admin:
        return True
    if signer_user_id and current_user.id == signer_user_id:
        return True
    if created_by_user_id and current_user.id == created_by_user_id:
        return True
    return False


def _build_download_signature(signature_request_id: str, expires_at: datetime) -> str:
    payload = f"{signature_request_id}:{int(expires_at.timestamp())}"
    return hmac.new(
        settings.signatures_secret_key.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _tenant_for_write(current_user: User, x_tenant_id: Optional[int], session: Session) -> int:
    return tenant_required_for_superadmin(current_user, x_tenant_id)


def _validate_public_autofirma_access(
    *,
    session: Session,
    signature_request_id: str,
    tenant_id: int,
    exp: int,
    sig: str,
):
    if datetime.fromtimestamp(exp, tz=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Enlace de firma expirado.")
    if not verify_autofirma_public_signature(
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
        exp=exp,
        sig=sig,
    ):
        raise HTTPException(status_code=401, detail="Firma de enlace invalida.")
    req = get_signature_request_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    if req.provider != SignatureProviderType.AUTOFIRMA:
        raise HTTPException(status_code=409, detail="La solicitud no usa AutoFirma.")
    return req


async def _extract_autofirma_storage_payload(request: Request) -> dict[str, str]:
    payload: dict[str, str] = {}
    for key, value in request.query_params.multi_items():
        if value is not None:
            payload[key] = str(value)
    content_type = (request.headers.get("content-type") or "").lower()
    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        try:
            form = await request.form()
            for key, value in form.multi_items():
                if isinstance(value, bytes):
                    payload[key] = value.decode("utf-8", errors="ignore")
                else:
                    payload[key] = str(value)
        except Exception:
            pass
    return payload


@router.post("/signaturit/requests", response_model=SignatureStartResponse, status_code=status.HTTP_201_CREATED)
def create_signaturit_signature_request_endpoint(
    payload: SignatureRequestCreate,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_WRITE)),
) -> SignatureStartResponse:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    req, signing_url = create_signaturit_request(
        session=session,
        tenant_id=tenant_id,
        contract_id=payload.contract_id,
        signer_name=payload.signer_name,
        signer_email=str(payload.signer_email),
        delivery_type=payload.delivery_type,
        signature_mode=payload.signature_mode,
        digital_certificate_name=payload.digital_certificate_name,
        created_by_id=current_user.id,
    )
    email_sent = False
    email_recipient = (req.signer_email or "").strip().lower() or None
    if email_recipient and signing_url:
        subject = "Contrato para firma"
        body = (
            "Se ha generado una solicitud de firma electronica del contrato.\n\n"
            f"Enlace de firma: {signing_url}\n\n"
            f"Contrato: CT-{req.contract_id}"
        )
        email_sent = _send_email([email_recipient], subject, body)
    return SignatureStartResponse(
        request=SignatureRequestRead.model_validate(req),
        signing_url=signing_url,
        provider_signature_id=req.provider_signature_id,
        email_sent=email_sent,
        email_recipient=email_recipient,
    )


@router.get("/signaturit/requests/{request_id}", response_model=SignatureRequestRead)
def get_signaturit_signature_request_endpoint(
    request_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_READ)),
) -> SignatureRequestRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    req = get_signature_request(session=session, tenant_id=tenant_id, request_id=request_id)
    return SignatureRequestRead.model_validate(req)


@router.post("/signaturit/requests/{request_id}/sync", response_model=SignatureRequestRead)
def sync_signaturit_signature_request_endpoint(
    request_id: int,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_WRITE)),
) -> SignatureRequestRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    req = get_signature_request(session=session, tenant_id=tenant_id, request_id=request_id)
    req = sync_request_status(session=session, req=req)
    return SignatureRequestRead.model_validate(req)


@router.get("/signaturit/requests", response_model=list[SignatureRequestRead])
def list_signaturit_signature_requests_endpoint(
    contract_id: Optional[int] = None,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_READ)),
) -> list[SignatureRequestRead]:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    rows = list_signature_requests(session=session, tenant_id=tenant_id, contract_id=contract_id)
    return [SignatureRequestRead.model_validate(row) for row in rows]


@router.post("/{signature_request_id}/presign", response_model=AutofirmaPresignResponse)
def presign_autofirma_endpoint(
    signature_request_id: str,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> AutofirmaPresignResponse:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    req = get_signature_request_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    if not _is_signer_or_admin(current_user, req.signer_user_id, req.created_by_user_id):
        raise HTTPException(status_code=403, detail="Solo el firmante asignado puede ejecutar presign.")
    presign = presign_autofirma(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    return AutofirmaPresignResponse(
        session_id=presign.session_id,
        algorithm=presign.algorithm,
        format=presign.format,
        to_be_signed_b64=presign.to_be_signed_b64,
        protocol_url=presign.protocol_url,
        expires_at=presign.expires_at,
    )


@router.post("/{signature_request_id}/client-result", response_model=SignatureRequestReadV2)
def submit_client_result_endpoint(
    signature_request_id: str,
    payload: AutofirmaClientResultPayload,
    request: Request,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> SignatureRequestReadV2:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    enforce_rate_limit(request, key=f"signature_client_result_{signature_request_id}", limit=5, window_seconds=60)
    req = get_signature_request_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    if not _is_signer_or_admin(current_user, req.signer_user_id, req.created_by_user_id):
        raise HTTPException(status_code=403, detail="Solo el firmante asignado puede enviar el resultado.")
    body = payload.model_dump()
    body["ip"] = request.client.host if request.client else None
    body["user_agent"] = request.headers.get("user-agent")
    submit_client_result_autofirma(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
        client_payload=body,
    )
    # Flujo server-controlled: validar y finalizar inmediatamente.
    finalize_signature_request(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    req = get_signature_request_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    return SignatureRequestReadV2.model_validate(req)


@router.post("/{signature_request_id}/finalize", response_model=SignatureFinalizeResponse)
def finalize_signature_request_endpoint(
    signature_request_id: str,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_WRITE)),
) -> SignatureFinalizeResponse:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    artifact = finalize_signature_request(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    req = get_signature_request_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    return SignatureFinalizeResponse(
        status=req.status.value if hasattr(req.status, "value") else str(req.status),
        signed_pdf_path=artifact.signed_pdf_path,
        validation_report_path=artifact.validation_report_path,
        evidence_json_path=artifact.evidence_json_path,
    )


@router.get("/config", response_model=TenantSignatureConfigRead)
def get_tenant_signature_config_endpoint(
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_CONFIG)),
) -> TenantSignatureConfigRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    cfg = get_or_create_tenant_signature_config(session, tenant_id)
    return TenantSignatureConfigRead.model_validate(cfg)


@router.put("/config", response_model=TenantSignatureConfigRead)
def update_tenant_signature_config_endpoint(
    payload: TenantSignatureConfigUpdate,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_CONFIG)),
) -> TenantSignatureConfigRead:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    cfg = update_tenant_signature_config(
        session=session,
        tenant_id=tenant_id,
        updates=payload.model_dump(),
        updated_by_id=current_user.id,
    )
    return TenantSignatureConfigRead.model_validate(cfg)


@router.get("/{signature_request_id}", response_model=SignatureRequestReadV2)
def get_signature_request_v2_endpoint(
    signature_request_id: str,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_READ)),
) -> SignatureRequestReadV2:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    req = get_signature_request_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    return SignatureRequestReadV2.model_validate(req)


@router.get("/{signature_request_id}/download")
def download_signed_pdf_endpoint(
    signature_request_id: str,
    exp: Optional[int] = Query(default=None),
    sig: Optional[str] = Query(default=None),
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_READ)),
):
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    req = get_signature_request_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    if req.status != SignatureRequestStatus.SIGNED:
        raise HTTPException(status_code=409, detail="El firmado aun no esta disponible.")
    artifact = get_signature_artifact_v2(
        session=session,
        signature_request_id=req.id,
        tenant_id=tenant_id,
    )
    if not artifact.signed_pdf_path:
        raise HTTPException(status_code=404, detail="No existe PDF firmado.")
    # Optional temporary URL signature validation.
    if exp is not None and sig:
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="URL de descarga expirada.")
        expected = _build_download_signature(signature_request_id, expires_at)
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status_code=401, detail="Firma de URL invalida.")
    return FileResponse(
        artifact.signed_pdf_path,
        media_type="application/pdf",
        filename=f"contract_{req.contract_id}_signed.pdf",
    )


@router.get("/{signature_request_id}/download-url", response_model=SignedDownloadUrlResponse)
def get_signed_pdf_download_url_endpoint(
    signature_request_id: str,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_READ)),
) -> SignedDownloadUrlResponse:
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    req = get_signature_request_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    if req.status != SignatureRequestStatus.SIGNED:
        raise HTTPException(status_code=409, detail="El firmado aun no esta disponible.")
    ttl_seconds = max(10, int(settings.signature_download_url_ttl_seconds or 60))
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    sig = _build_download_signature(signature_request_id, expires_at)
    return SignedDownloadUrlResponse(
        url=f"/api/v1/signatures/{signature_request_id}/download?exp={int(expires_at.timestamp())}&sig={sig}",
        expires_at=expires_at,
    )


@router.get("/{signature_request_id}/evidence")
def get_signature_evidence_endpoint(
    signature_request_id: str,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_ADMIN)),
):
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    artifact = get_signature_artifact_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    if not artifact.evidence_json_path:
        raise HTTPException(status_code=404, detail="Evidencia no disponible.")
    path = Path(artifact.evidence_json_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Evidencia no disponible.")
    return JSONResponse(json.loads(path.read_text(encoding="utf-8")))


@router.get("/{signature_request_id}/validation-report")
def get_signature_validation_report_endpoint(
    signature_request_id: str,
    x_tenant_id: Optional[int] = Header(default=None, alias="X-Tenant-Id"),
    session: Session = Depends(get_session),
    current_user: User = Depends(require_perm(SIGNATURES_ADMIN)),
):
    tenant_id = _tenant_for_write(current_user, x_tenant_id, session)
    artifact = get_signature_artifact_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    if not artifact.validation_report_path:
        raise HTTPException(status_code=404, detail="Reporte no disponible.")
    path = Path(artifact.validation_report_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Reporte no disponible.")
    return JSONResponse(json.loads(path.read_text(encoding="utf-8")))


def _validate_webhook_secret(token: Optional[str], header_token: Optional[str]) -> None:
    expected = settings.signaturit_webhook_token
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook de Signaturit no configurado (falta signaturit_webhook_token).",
        )

    provided = token or header_token
    if not provided or not hmac.compare_digest(str(provided), str(expected)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Webhook token invalido.",
        )


@public_router.post("/signaturit/events")
async def signaturit_events_webhook(
    request: Request,
    token: Optional[str] = None,
    x_webhook_token: Optional[str] = Header(default=None, alias="X-Webhook-Token"),
    session: Session = Depends(get_session),
) -> JSONResponse:
    _validate_webhook_secret(token=token, header_token=x_webhook_token)
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payload JSON invalido.",
        )
    process_signaturit_webhook(session=session, payload=payload if isinstance(payload, dict) else {})
    return JSONResponse({"ok": True})


@public_router.get("/autofirma-sign", include_in_schema=False)
def public_autofirma_sign_redirect(
    sr: str = Query(...),
    tenant: int = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
):
    frontend_base = (settings.frontend_base_url or "").strip().rstrip("/")
    if not frontend_base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="FRONTEND_BASE_URL no configurado.",
        )
    route = f"public/autofirma-sign?sr={sr}&tenant={tenant}&exp={exp}&sig={sig}"
    if "#/" in frontend_base:
        prefix, _ = frontend_base.split("#/", 1)
        target = f"{prefix.rstrip('/')}/#/{route}"
    else:
        target = f"{frontend_base.rstrip('/')}/#/{route}"
    return RedirectResponse(url=target, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@public_router.api_route("/autofirma/storage", methods=["GET", "POST"], include_in_schema=False)
async def public_autofirma_storage_endpoint(
    request: Request,
    session: Session = Depends(get_session),
):
    """
    Endpoint de compatibilidad para AutoFirma Desktop (storage servlet).
    Maneja lectura del dato a firmar y recepción de firma para finalizar flujo.
    """
    enforce_rate_limit(request, key="public_autofirma_storage", limit=30, window_seconds=60)
    payload = await _extract_autofirma_storage_payload(request)
    op = (payload.get("op") or payload.get("operation") or "").strip().lower()
    session_id = (
        payload.get("id")
        or payload.get("session")
        or payload.get("session_id")
        or ""
    ).strip()
    if not session_id:
        return PlainTextResponse("ERROR: missing session id", status_code=400)
    try:
        session_id = str(UUID(session_id))
    except ValueError:
        return PlainTextResponse("ERROR: invalid session id", status_code=400)
    enforce_rate_limit(request, key=f"public_autofirma_storage:{session_id}", limit=10, window_seconds=60)

    req = session.exec(
        select(SignatureRequest).where(SignatureRequest.presign_session_id == session_id)
    ).one_or_none()
    if not req:
        return PlainTextResponse("ERROR: session not found", status_code=404)

    session_store = AutofirmaSessionStore()
    presign_data = session_store.load(signature_request_id=req.id)
    if not presign_data:
        return PlainTextResponse("ERROR: session expired", status_code=410)

    signature_b64 = (
        payload.get("signature")
        or payload.get("sign")
        or payload.get("firma")
        or payload.get("dat")
        or payload.get("result")
        or ""
    ).strip()

    # Operacion de lectura (AutoFirma puede solicitar el contenido por id).
    if op in {"get", "load", "retrieve", "prefetch"} or (not signature_b64 and op != "put"):
        to_be_signed = str(presign_data.get("to_be_signed_b64") or "")
        if not to_be_signed:
            return PlainTextResponse("ERROR: no data", status_code=404)
        return PlainTextResponse(to_be_signed)

    if not signature_b64:
        return PlainTextResponse("ERROR: missing signature", status_code=400)

    try:
        submit_client_result_autofirma(
            session=session,
            signature_request_id=str(req.id),
            tenant_id=req.tenant_id,
            client_payload={
                "session_id": session_id,
                "signature_b64": signature_b64,
                "cert_chain_b64": [],
                "device_hints": {"source": "autofirma_storage_servlet"},
                "ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
            },
        )
        finalize_signature_request(
            session=session,
            signature_request_id=str(req.id),
            tenant_id=req.tenant_id,
        )
    except Exception:
        return PlainTextResponse("ERROR", status_code=500)

    return PlainTextResponse("OK")


@public_router.post("/signatures/{signature_request_id}/presign", response_model=AutofirmaPresignResponse)
def public_presign_autofirma_endpoint(
    signature_request_id: str,
    tenant_id: int = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
    session: Session = Depends(get_session),
) -> AutofirmaPresignResponse:
    _validate_public_autofirma_access(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
        exp=exp,
        sig=sig,
    )
    presign = presign_autofirma(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    return AutofirmaPresignResponse(
        session_id=presign.session_id,
        algorithm=presign.algorithm,
        format=presign.format,
        to_be_signed_b64=presign.to_be_signed_b64,
        protocol_url=presign.protocol_url,
        expires_at=presign.expires_at,
    )


@public_router.post("/signatures/{signature_request_id}/client-result", response_model=PublicSignatureStatusResponse)
def public_submit_client_result_endpoint(
    signature_request_id: str,
    payload: AutofirmaClientResultPayload,
    request: Request,
    tenant_id: int = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
    session: Session = Depends(get_session),
) -> PublicSignatureStatusResponse:
    req = _validate_public_autofirma_access(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
        exp=exp,
        sig=sig,
    )
    enforce_rate_limit(request, key=f"public_signature_client_result_{signature_request_id}", limit=5, window_seconds=60)
    body = payload.model_dump()
    body["ip"] = request.client.host if request.client else None
    body["user_agent"] = request.headers.get("user-agent")
    submit_client_result_autofirma(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
        client_payload=body,
    )
    finalize_signature_request(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    req = get_signature_request_v2(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
    )
    return PublicSignatureStatusResponse(
        id=req.id,
        status=req.status.value if hasattr(req.status, "value") else str(req.status),
        expires_at=req.expires_at,
        signed_at=req.signed_at,
        failure_reason=req.failure_reason,
    )


@public_router.get("/signatures/{signature_request_id}", response_model=PublicSignatureStatusResponse)
def public_signature_status_endpoint(
    signature_request_id: str,
    tenant_id: int = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
    session: Session = Depends(get_session),
) -> PublicSignatureStatusResponse:
    req = _validate_public_autofirma_access(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
        exp=exp,
        sig=sig,
    )
    return PublicSignatureStatusResponse(
        id=req.id,
        status=req.status.value if hasattr(req.status, "value") else str(req.status),
        expires_at=req.expires_at,
        signed_at=req.signed_at,
        failure_reason=req.failure_reason,
    )


@public_router.get("/signatures/{signature_request_id}/document")
def public_signature_document_endpoint(
    signature_request_id: str,
    tenant_id: int = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
    session: Session = Depends(get_session),
):
    req = _validate_public_autofirma_access(
        session=session,
        signature_request_id=signature_request_id,
        tenant_id=tenant_id,
        exp=exp,
        sig=sig,
    )
    artifact = get_signature_artifact_v2(
        session=session,
        signature_request_id=req.id,
        tenant_id=tenant_id,
    )
    path = Path(artifact.original_pdf_path)
    if not artifact.original_pdf_path or not path.exists():
        raise HTTPException(status_code=404, detail="Documento original no disponible.")
    return FileResponse(
        str(path),
        media_type="application/pdf",
        filename=f"contract_{req.contract_id}_original.pdf",
        content_disposition_type="inline",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

