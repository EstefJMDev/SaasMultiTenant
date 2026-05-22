from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.platform.contracts_core.models import Contract, Supplier, SupplierInvitation
from app.platform.contracts_core.schemas import (
    SignatureRequestRead,
    SignatureRequestValidate,
    SupplierDataRequestRead,
    SupplierDataSubmit,
    SupplierOnboardingSubmit,
    SupplierOnboardingValidate,
    SupplierRead,
)
from app.domains.procurement.api import submit_supplier_onboarding
from app.domains.procurement.contracts.service import sync_service
from app.core.rate_limit import enforce_rate_limit
from app.db.session import get_session


public_router = APIRouter()


@public_router.post("/contracts/sign/{token}", response_model=SignatureRequestRead)
def sign_contract_public(
    token: str,
    request: Request,
    file: Optional[UploadFile] = File(default=None),
    signer_name: Optional[str] = Form(default=None),
    signer_identifier: Optional[str] = Form(default=None),
    signer_email: Optional[str] = Form(default=None),
    signer_company: Optional[str] = Form(default=None),
    accepted_terms: bool = Form(default=False),
    signature_image: Optional[UploadFile] = File(default=None),
    session: Session = Depends(get_session),
) -> SignatureRequestRead:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="La firma local esta deshabilitada. Usa Signaturit.",
    )


@public_router.get("/contracts/sign/{token}", response_model=SignatureRequestValidate)
def validate_sign_contract_public(
    token: str,
    session: Session = Depends(get_session),
) -> SignatureRequestValidate:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="La firma local esta deshabilitada. Usa Signaturit.",
    )


@public_router.get("/contracts/sign/{token}/document")
def download_contract_public(
    token: str,
    session: Session = Depends(get_session),
) -> FileResponse:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="La firma local esta deshabilitada. Usa Signaturit.",
    )


@public_router.post("/sign/{token}", response_model=SignatureRequestRead, include_in_schema=False)
def sign_contract_public_legacy(
    token: str,
    request: Request,
    file: Optional[UploadFile] = File(default=None),
    signer_name: Optional[str] = Form(default=None),
    signer_identifier: Optional[str] = Form(default=None),
    signer_email: Optional[str] = Form(default=None),
    signer_company: Optional[str] = Form(default=None),
    accepted_terms: bool = Form(default=False),
    signature_image: Optional[UploadFile] = File(default=None),
    session: Session = Depends(get_session),
) -> SignatureRequestRead:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="La firma local esta deshabilitada. Usa Signaturit.",
    )


@public_router.get("/supplier-onboarding/{token}", response_model=SupplierOnboardingValidate)
def supplier_onboarding_validate(
    token: str,
    request: Request,
    session: Session = Depends(get_session),
) -> SupplierOnboardingValidate:
    enforce_rate_limit(request, key=f"supplier_onboarding_{token}", limit=10, window_seconds=60)
    invitation = session.exec(
        select(SupplierInvitation).where(SupplierInvitation.token == token),
    ).one_or_none()
    if not invitation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token no valido.")
    supplier = session.get(Supplier, invitation.supplier_id)
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Proveedor no encontrado.",
        )
    now_utc = datetime.now(timezone.utc)
    expires_at_utc = invitation.expires_at.astimezone(timezone.utc) if invitation.expires_at.tzinfo else invitation.expires_at.replace(tzinfo=timezone.utc)
    is_used = invitation.used_at is not None
    is_expired = expires_at_utc < now_utc
    is_valid = not is_used and not is_expired
    message: Optional[str] = None
    if is_used:
        message = "Invitacion ya utilizada."
    elif is_expired:
        message = "Invitacion caducada."
    contract = None
    onboarding_meta: dict[str, object] = {
        "required_fields": [],
        "missing_fields": [],
        "prefill": {},
    }
    if invitation.contract_id:
        candidate = session.get(Contract, invitation.contract_id)
        if candidate and getattr(candidate, "tenant_id", None) == invitation.tenant_id:
            contract = candidate
            onboarding_meta = sync_service.build_supplier_onboarding_payload(contract)

    return SupplierOnboardingValidate(
        token=invitation.token,
        supplier=SupplierRead.model_validate(supplier),
        contract_id=invitation.contract_id,
        tenant_id=invitation.tenant_id,
        contract_type=contract.type if contract else None,
        required_fields=list(onboarding_meta.get("required_fields") or []),
        missing_fields=list(onboarding_meta.get("missing_fields") or []),
        prefill=dict(onboarding_meta.get("prefill") or {}),
        is_valid=is_valid,
        is_used=is_used,
        is_expired=is_expired,
        message=message,
    )


@public_router.post("/supplier-onboarding/{token}", response_model=SupplierRead)
def supplier_onboarding_submit(
    token: str,
    payload: SupplierOnboardingSubmit,
    request: Request,
    session: Session = Depends(get_session),
) -> SupplierRead:
    enforce_rate_limit(request, key=f"supplier_onboarding_{token}", limit=10, window_seconds=60)
    supplier = submit_supplier_onboarding(
        session=session,
        token=token,
        payload=payload.model_dump(exclude={"token"}, exclude_unset=True),
    )
    return SupplierRead.model_validate(supplier)


# ── Onboarding completo: texto + documentos en una sola llamada multipart ────

_ONBOARDING_ALLOWED_EXTENSIONS = {"pdf", "jpg", "jpeg", "png", "docx", "xlsx"}
_ONBOARDING_MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB por archivo


def _onboarding_save_files(
    files: list[UploadFile],
    *,
    tenant_id: int,
    contract_id: int,
    category: str,
) -> list[dict[str, str]]:
    from pathlib import Path
    from uuid import uuid4
    from app.domains.documents.storage import build_contract_base_path
    from app.storage.local import (
        ensure_upload_extension as _ensure_ext,
        _write_upload_with_size_limit as _write_safe,
    )

    if not files:
        return []
    if len(files) > 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"La categoria '{category}' admite como maximo 2 archivos.",
        )
    base: Path = build_contract_base_path(tenant_id, contract_id) / "onboarding" / category
    base.mkdir(parents=True, exist_ok=True)
    saved: list[dict[str, str]] = []
    for upload in files:
        ext = _ensure_ext(
            upload.filename,
            allowed_extensions=_ONBOARDING_ALLOWED_EXTENSIONS,
            detail=(
                "Formato no permitido en documentos del proveedor. "
                "Acepta: PDF, JPG, PNG, DOCX, XLSX."
            ),
        )
        unique = f"{uuid4().hex}.{ext}"
        target = base / unique
        _write_safe(upload, target, max_size_bytes=_ONBOARDING_MAX_FILE_BYTES)
        saved.append(
            {
                "original_name": upload.filename or unique,
                "stored_name": unique,
                "path": str(target),
            }
        )
    return saved


@public_router.post("/supplier-onboarding/{token}/complete", response_model=SupplierRead)
def supplier_onboarding_complete(
    token: str,
    request: Request,
    razon_social: str = Form(""),
    nombre_gerente: str = Form(""),
    nif_gerente: str = Form(""),
    direccion_empresa: str = Form(""),
    tipo_escritura: str = Form(""),
    fecha_escritura: str = Form(""),
    nombre_notario: str = Form(""),
    num_protocolo: str = Form(""),
    escritura_poderes: list[UploadFile] = File(default_factory=list),
    dni_firmante: list[UploadFile] = File(default_factory=list),
    rea: list[UploadFile] = File(default_factory=list),
    cert_hacienda: list[UploadFile] = File(default_factory=list),
    cert_ss: list[UploadFile] = File(default_factory=list),
    session: Session = Depends(get_session),
) -> SupplierRead:
    enforce_rate_limit(request, key=f"supplier_onboarding_{token}", limit=10, window_seconds=60)

    invitation = session.exec(
        select(SupplierInvitation).where(SupplierInvitation.token == token),
    ).one_or_none()
    if not invitation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token no valido.")
    if invitation.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitacion ya utilizada.")
    expires_at_utc = (
        invitation.expires_at.astimezone(timezone.utc)
        if invitation.expires_at.tzinfo
        else invitation.expires_at.replace(tzinfo=timezone.utc)
    )
    if expires_at_utc < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitacion caducada.")

    contract = (
        session.get(Contract, invitation.contract_id) if invitation.contract_id else None
    )
    if not contract:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La invitacion no esta asociada a un contrato.",
        )

    contract_type_value = getattr(contract.type, "value", contract.type)
    is_sub = str(contract_type_value) == "SUBCONTRATACION"

    # Validar texto obligatorio segun tipo
    missing: list[str] = []
    if not razon_social.strip():
        missing.append("Razon social")
    if not nombre_gerente.strip():
        missing.append("Nombre persona firmante/representante")
    if not nif_gerente.strip():
        missing.append("NIF persona firmante/representante")
    if not direccion_empresa.strip():
        missing.append("Direccion de la empresa")
    if is_sub:
        if not tipo_escritura.strip():
            missing.append("Tipo de escritura")
        if not fecha_escritura.strip():
            missing.append("Fecha de escritura")
        if not nombre_notario.strip():
            missing.append("Nombre del notario")
        if not num_protocolo.strip():
            missing.append("Numero de protocolo")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Faltan campos obligatorios: {', '.join(missing)}.",
        )

    # Validar documentos requeridos: al menos 1 por categoria aplicable
    if is_sub:
        required_categories = {
            "escritura_poderes": escritura_poderes,
            "dni_firmante": dni_firmante,
            "rea": rea,
            "cert_hacienda": cert_hacienda,
            "cert_ss": cert_ss,
        }
    else:
        required_categories = {
            "escritura_poderes": escritura_poderes,
            "dni_firmante": dni_firmante,
        }

    docs_missing = [cat for cat, files in required_categories.items() if not files]
    if docs_missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Faltan documentos obligatorios (minimo 1 archivo por categoria): "
                f"{', '.join(docs_missing)}."
            ),
        )

    # Guardar archivos en disco
    saved_docs: dict[str, list[dict[str, str]]] = {}
    for category, files in required_categories.items():
        saved_docs[category] = _onboarding_save_files(
            files,
            tenant_id=contract.tenant_id,
            contract_id=contract.id,
            category=category,
        )

    # Persistir referencias en contract.contract_data
    contract_data = dict(contract.contract_data or {})
    onboarding_docs = dict(contract_data.get("onboarding_docs") or {})
    onboarding_docs.update(saved_docs)
    contract_data["onboarding_docs"] = onboarding_docs
    contract.contract_data = contract_data
    session.add(contract)
    session.commit()

    # Reusar el flujo existente para texto + transicion workflow
    text_payload = {
        "razon_social": razon_social,
        "nombre_gerente": nombre_gerente,
        "nif_gerente": nif_gerente,
        "direccion_empresa": direccion_empresa,
        "tipo_escritura": tipo_escritura,
        "fecha_escritura": fecha_escritura,
        "nombre_notario": nombre_notario,
        "num_protocolo": num_protocolo,
    }
    supplier = submit_supplier_onboarding(
        session=session,
        token=token,
        payload=text_payload,
    )
    return SupplierRead.model_validate(supplier)


# ── FASE 6B — Supplier data completion (sin autenticación) ────────────────────

@public_router.get("/supplier/complete/{token}", response_model=SupplierDataRequestRead)
def supplier_data_get(
    token: str,
    request: Request,
    session: Session = Depends(get_session),
) -> SupplierDataRequestRead:
    """
    Proveedor accede al enlace para ver qué campos debe completar.
    Endpoint público, sin autenticación.
    """
    enforce_rate_limit(request, key=f"supplier_data_{token}", limit=20, window_seconds=60)
    from app.domains.procurement.contracts.supplier_request_service import (
        get_supplier_request_or_error,
    )
    req = get_supplier_request_or_error(session, token=token)
    contract = session.get(Contract, req.contract_id)
    data = SupplierDataRequestRead.model_validate(req)
    if contract:
        data.contract_type = contract.type.value if contract.type else None
    return data


@public_router.post("/supplier/complete/{token}")
def supplier_data_submit(
    token: str,
    payload: dict[str, Any],
    request: Request,
    session: Session = Depends(get_session),
) -> dict:
    """
    Proveedor envía los datos faltantes.
    Endpoint público, sin autenticación.
    Tras el envío: valida, guarda en BD, dispara FASE 6A automáticamente.
    """
    enforce_rate_limit(request, key=f"supplier_data_{token}", limit=10, window_seconds=60)
    from app.domains.procurement.contracts.supplier_request_service import submit_supplier_data
    contract = submit_supplier_data(session, token=token, submitted_data=payload)
    return {
        "status": "completed",
        "contract_status": contract.status.value,
        "message": "Datos recibidos. El contrato se generará en breve.",
    }


_ALLOWED_DOC_SLOTS = {
    "escritura_poderes",
    "dni_firmante",
    "rea_actualizado",
    "certificado_hacienda",
    "certificado_ss",
}
_MAX_FILES_PER_SLOT = 2
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@public_router.post("/supplier/complete/{token}/documents")
async def supplier_documents_upload(
    token: str,
    request: Request,
    doc_slot: str = Form(...),
    files: list[UploadFile] = File(...),
    session: Session = Depends(get_session),
) -> dict:
    """
    Proveedor sube documentos requeridos (máx. 2 archivos por slot).
    Endpoint público, sin autenticación.
    """
    import re
    from pathlib import Path
    from app.domains.procurement.contracts.supplier_request_service import get_supplier_request_or_error
    from app.domains.documents.storage import ensure_parent_dir

    enforce_rate_limit(request, key=f"supplier_docs_{token}", limit=20, window_seconds=60)

    slot = str(doc_slot or "").strip().lower()
    if slot not in _ALLOWED_DOC_SLOTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Slot no válido: {slot}")
    if len(files) > _MAX_FILES_PER_SLOT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Máximo {_MAX_FILES_PER_SLOT} archivos por campo.")

    req = get_supplier_request_or_error(session, token=token)
    contract = session.get(Contract, req.contract_id)
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contrato no encontrado.")

    from app.core.config import settings
    base = Path(settings.contracts_storage_path) / f"tenant_{contract.tenant_id}" / f"contract_{contract.id}" / "supplier_docs" / slot
    ensure_parent_dir(base / "placeholder")

    saved: list[str] = []
    for upload in files:
        content = await upload.read()
        if len(content) > _MAX_FILE_SIZE:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Archivo demasiado grande (máx. 10 MB).")
        safe_name = re.sub(r"[^\w.\-]", "_", upload.filename or "archivo")
        dest = base / safe_name
        dest.write_bytes(content)
        saved.append(safe_name)

    return {"status": "ok", "slot": slot, "saved": saved}


# ── FASE 8 — Viafirma webhook (sin autenticación, verificar provider_reference) ──

@public_router.post("/viafirma/webhook")
def viafirma_webhook(
    payload: dict[str, Any],
    session: Session = Depends(get_session),
) -> dict:
    """
    Viafirma llama a este endpoint cuando la firma se completa.
    Payload esperado: { provider_reference, signer_name, signer_email,
                        signed_at (ISO), evidence_url, signed_document_url }
    Transición: SENT_FOR_SIGNATURE → SIGNED.
    """
    from datetime import datetime, timezone
    from app.domains.procurement.contracts.viafirma_adapter import complete_signature_from_webhook

    provider_reference = payload.get("provider_reference") or payload.get("reference")
    if not provider_reference:
        from fastapi import HTTPException, status as http_status
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="provider_reference requerido.",
        )

    signed_at_raw = payload.get("signed_at")
    signed_at: Optional[datetime] = None
    if signed_at_raw:
        try:
            signed_at = datetime.fromisoformat(str(signed_at_raw).replace("Z", "+00:00"))
        except ValueError:
            signed_at = None

    contract = complete_signature_from_webhook(
        session,
        provider_reference=str(provider_reference),
        signer_name=payload.get("signer_name"),
        signer_email=payload.get("signer_email"),
        signed_at=signed_at,
        evidence_url=payload.get("evidence_url"),
        signed_document_url=payload.get("signed_document_url"),
    )
    return {"status": "ok", "contract_id": contract.id, "contract_status": contract.status.value}

