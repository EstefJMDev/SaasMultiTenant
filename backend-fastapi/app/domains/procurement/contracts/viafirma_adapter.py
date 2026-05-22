"""
FASE 8 — Adaptador de firma digital Viafirma.

Interfaz lista para integración real. Implementación actual: MOCK.
Cuando tengas las credenciales/API de Viafirma, reemplaza ViafirmaMockProvider
por ViafirmaProvider con llamadas reales a la API.

Flujo:
  FULLY_APPROVED
    → POST /{id}/send-for-signature  (crea ViafirmaSignatureRequest, envía a Viafirma)
    → status: SENT_FOR_SIGNATURE

  Viafirma llama al webhook cuando firma completada
    → POST /public/viafirma/webhook
    → status: SIGNED + registra fecha_firma, firmante, referencia, url_evidencia

Registro de firma: tabla signature_provider_request (ya existe en BD).
"""
from __future__ import annotations

import logging
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.platform.contracts_core.models import (
    Contract,
    ContractStatus,
)
from app.domains.procurement.contracts import crud as contract_crud
from app.domains.signatures._core.models import (
    SignatureProviderRequest,
)
from app.models.user import User

logger = logging.getLogger("app.procurement.viafirma")


# ── Data classes ───────────────────────────────────────────────────────────────

@dataclass
class ViafirmaSignatureRequest:
    """Resultado de crear una solicitud en Viafirma."""
    provider_reference: str       # ID o referencia asignada por Viafirma
    signing_url: Optional[str]    # URL donde el firmante completa la firma
    message: str


@dataclass
class ViafirmaSignatureResult:
    """Resultado recibido desde Viafirma tras firma completada."""
    provider_reference: str
    signer_name: Optional[str]
    signer_email: Optional[str]
    signed_at: datetime
    evidence_url: Optional[str]
    signed_document_url: Optional[str]


# ── Abstract interface (reemplazar con implementación real) ────────────────────

class ViafirmaProviderBase(ABC):
    @abstractmethod
    def send_for_signature(
        self,
        *,
        contract_id: int,
        document_path: str,
        signer_name: Optional[str],
        signer_email: Optional[str],
        reference: str,
        config: dict[str, Any],
    ) -> ViafirmaSignatureRequest:
        """Envía el documento a Viafirma para firma. Devuelve referencia + URL."""
        raise NotImplementedError

    @abstractmethod
    def get_status(self, *, provider_reference: str) -> str:
        """Consulta estado en Viafirma: pending | completed | rejected | expired."""
        raise NotImplementedError


# ── Mock implementation ────────────────────────────────────────────────────────

class ViafirmaMockProvider(ViafirmaProviderBase):
    """
    Mock para desarrollo/staging.
    Simula envío exitoso y devuelve una URL ficticia.
    TODO: reemplazar con ViafirmaProvider real cuando se tengan credenciales.
    """

    def send_for_signature(
        self,
        *,
        contract_id: int,
        document_path: str,
        signer_name: Optional[str],
        signer_email: Optional[str],
        reference: str,
        config: dict[str, Any],
    ) -> ViafirmaSignatureRequest:
        mock_ref = f"VF-MOCK-{reference[:8].upper()}"
        logger.info(
            "[MOCK] Viafirma: enviando contrato %s a firma. ref=%s signer=%s <%s>",
            contract_id,
            mock_ref,
            signer_name,
            signer_email,
        )
        return ViafirmaSignatureRequest(
            provider_reference=mock_ref,
            signing_url=f"https://viafirma.example.com/sign/{mock_ref}",
            message="[MOCK] Solicitud de firma creada correctamente.",
        )

    def get_status(self, *, provider_reference: str) -> str:
        return "pending"


# Factory — cambiar por ViafirmaProvider real cuando proceda
def get_viafirma_provider() -> ViafirmaProviderBase:
    return ViafirmaMockProvider()


# ── Service functions ──────────────────────────────────────────────────────────

def send_contract_for_signature(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    """
    FASE 8 — Envía el contrato a Viafirma para firma digital.
    Transición: FULLY_APPROVED → SENT_FOR_SIGNATURE.
    """
    from app.platform.contracts_core.permissions import ensure_tenant_access
    from app.domains.procurement.contracts.workflow_service import _user_is_admin

    ensure_tenant_access(user, tenant_id)
    if not _user_is_admin(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Administración puede enviar contratos a firma.",
        )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.status != ContractStatus.FULLY_APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El contrato debe estar en FULLY_APPROVED para enviarlo a firma (actual: {contract.status.value}).",
        )

    # Get signed document path
    from app.platform.contracts_core.models import ContractDocument, ContractDocumentType
    doc = session.exec(
        select(ContractDocument).where(
            ContractDocument.tenant_id == tenant_id,
            ContractDocument.contract_id == contract_id,
            ContractDocument.doc_type == ContractDocumentType.CONTRACT,
        )
    ).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El contrato no tiene documento generado. Ejecuta primero la generación del documento.",
        )

    signer_name = (
        (contract.supplier_contact_name or "").strip()
        or (contract.supplier_name or "").strip()
        or "Representante proveedor"
    )
    signer_email = (contract.supplier_email or "").strip() or None
    reference = str(uuid.uuid4())

    provider = get_viafirma_provider()
    result = provider.send_for_signature(
        contract_id=contract_id,
        document_path=doc.path,
        signer_name=signer_name,
        signer_email=signer_email,
        reference=reference,
        config={},
    )

    # Persist in signature_provider_request (reuse existing table)
    sig_req = SignatureProviderRequest(
        tenant_id=tenant_id,
        contract_id=contract_id,
        created_by_id=user.id,
        provider="viafirma",
        status="sent",
        provider_signature_id=result.provider_reference,
        signer_name=signer_name,
        signer_email=signer_email,
        source_pdf_path=doc.path,
        request_payload={"reference": reference, "signing_url": result.signing_url},
    )
    session.add(sig_req)

    contract.status = ContractStatus.SENT_FOR_SIGNATURE
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract_id,
        user_id=user.id,
        event_type="contract.sent_for_signature",
        payload={
            "provider": "viafirma",
            "provider_reference": result.provider_reference,
            "signing_url": result.signing_url,
            "signer_email": signer_email,
        },
    )

    session.commit()
    session.refresh(contract)
    return contract


def complete_signature_from_webhook(
    session: Session,
    *,
    provider_reference: str,
    signer_name: Optional[str],
    signer_email: Optional[str],
    signed_at: Optional[datetime],
    evidence_url: Optional[str],
    signed_document_url: Optional[str],
) -> Contract:
    """
    Llamado desde el webhook de Viafirma cuando la firma se completa.
    Transición: SENT_FOR_SIGNATURE → SIGNED.
    """
    sig_req = session.exec(
        select(SignatureProviderRequest).where(
            SignatureProviderRequest.provider_signature_id == provider_reference,
            SignatureProviderRequest.provider == "viafirma",
        )
    ).first()
    if not sig_req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No se encontró solicitud de firma con referencia: {provider_reference}",
        )

    contract = contract_crud._get_contract_or_404(
        session, sig_req.contract_id, sig_req.tenant_id
    )
    if contract.status != ContractStatus.SENT_FOR_SIGNATURE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Estado inválido para completar firma: {contract.status.value}",
        )

    now = datetime.now(timezone.utc)
    sig_req.status = "signed"
    sig_req.completed_at = signed_at or now
    sig_req.signer_name = signer_name or sig_req.signer_name
    sig_req.signer_email = signer_email or sig_req.signer_email
    sig_req.provider_response = {
        "signed_at": (signed_at or now).isoformat(),
        "evidence_url": evidence_url,
        "signed_document_url": signed_document_url,
    }
    session.add(sig_req)

    contract.status = ContractStatus.SIGNED
    contract.signed_at = signed_at or now
    contract.updated_at = now
    session.add(contract)

    contract_crud._log_event(
        session,
        tenant_id=sig_req.tenant_id,
        contract_id=contract.id,
        user_id=None,
        event_type="contract.signed",
        payload={
            "provider": "viafirma",
            "provider_reference": provider_reference,
            "signer_name": signer_name,
            "evidence_url": evidence_url,
        },
    )

    session.commit()
    session.refresh(contract)
    return contract
