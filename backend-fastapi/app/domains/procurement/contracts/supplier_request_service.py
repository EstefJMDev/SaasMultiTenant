"""
FASE 6B — Solicitud de datos al proveedor.

Cuando faltan campos [VARIABLE]:
  1. Genera token UUID v4 con expiración 72h
  2. Guarda supplier_data_request en BD
  3. Envía email al proveedor con enlace público /supplier/complete/{token}
  4. El proveedor completa el formulario (endpoint público, sin auth)
  5. Los datos se guardan en tabla suppliers
  6. Se dispara automáticamente FASE 6A
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, Request, status
from sqlmodel import Session, select

from app.core.config import settings
from app.core.email import _send_email
from app.platform.contracts_core.models import (
    Contract,
    ContractStatus,
    Supplier,
    SupplierDataRequest,
    SupplierStatus,
)
from app.domains.procurement.contracts import crud as contract_crud
from app.domains.procurement.contracts.workflow_service import (
    FieldValidationResult,
    validate_contract_fields,
)

logger = logging.getLogger("app.procurement.supplier_request")

_TOKEN_EXPIRY_HOURS = 72

# Mapping from spec [VAR] names to Supplier model fields
_VAR_TO_SUPPLIER_FIELD: dict[str, str] = {
    "NOMBRE_PROVEEDOR": "name",
    "NOMBRE_CONTACTO": "contact_name",
    "CIF_NIF": "tax_id",
    "DIRECCION": "address",
    "CIUDAD": "city",
    "CODIGO_POSTAL": "postal_code",
    "EMAIL_PROVEEDOR": "email",
    "TELEFONO": "phone",
    "IBAN": "bank_iban",
}

# Mapping from spec [VAR] names to Contract model fields (for contract-level vars)
_VAR_TO_CONTRACT_FIELD: dict[str, str] = {
    "NOMBRE_PROVEEDOR": "supplier_name",
    "NOMBRE_CONTACTO": "supplier_contact_name",
    "CIF_NIF": "supplier_tax_id",
    "DIRECCION": "supplier_address",
    "CIUDAD": "supplier_city",
    "CODIGO_POSTAL": "supplier_postal_code",
    "EMAIL_PROVEEDOR": "supplier_email",
    "TELEFONO": "supplier_phone",
    "IBAN": "supplier_bank_iban",
}

_SUPPLIER_FIELD_LABELS: dict[str, str] = {
    "NOMBRE_PROVEEDOR": "Nombre de la empresa",
    "NOMBRE_CONTACTO": "Nombre de contacto",
    "CIF_NIF": "CIF/NIF",
    "DIRECCION": "Dirección",
    "CIUDAD": "Ciudad",
    "CODIGO_POSTAL": "Código postal",
    "EMAIL_PROVEEDOR": "Email del proveedor",
    "TELEFONO": "Teléfono",
    "IBAN": "IBAN",
}


def _build_supplier_complete_url(token: str) -> str:
    base = (getattr(settings, "frontend_base_url", None) or "").strip()
    if not base:
        base = "http://localhost:5174"

    # Generamos URL directa sin hash para que los clientes de correo no rompan
    # el enlace; el frontend redirige internamente a hash-router si hace falta.
    if "#/" in base:
        base, _ = base.split("#/", 1)
    if "#" in base:
        base, _ = base.split("#", 1)
    route = f"/supplier/complete/{token}"
    return f"{base.rstrip('/')}{route}"


def _filter_supplier_missing_fields(fields: list[str]) -> tuple[list[str], list[str]]:
    supplier_fields: list[str] = []
    internal_fields: list[str] = []
    for field in fields:
        normalized = str(field or "").strip().upper()
        if not normalized:
            continue
        if normalized in _VAR_TO_SUPPLIER_FIELD:
            if normalized not in supplier_fields:
                supplier_fields.append(normalized)
        else:
            if normalized not in internal_fields:
                internal_fields.append(normalized)
    return supplier_fields, internal_fields


# ── Token creation & email ─────────────────────────────────────────────────────

def create_supplier_data_request(
    session: Session,
    *,
    contract: Contract,
    missing_fields: list[str],
) -> SupplierDataRequest:
    """Create or refresh a SupplierDataRequest record and send email."""
    supplier_missing_fields, internal_missing_fields = _filter_supplier_missing_fields(
        list(missing_fields or []),
    )
    if not supplier_missing_fields:
        detail = "Faltan campos internos del contrato. Revísalos desde el formulario de contrato."
        if internal_missing_fields:
            detail = f"{detail} Campos: {', '.join(internal_missing_fields)}"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    # Invalidate any previous pending request for this contract
    existing = session.exec(
        select(SupplierDataRequest).where(
            SupplierDataRequest.contract_id == contract.id,
            SupplierDataRequest.completed_at.is_(None),
        )
    ).first()
    if existing:
        session.delete(existing)
        session.flush()

    token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(hours=_TOKEN_EXPIRY_HOURS)

    req = SupplierDataRequest(
        tenant_id=contract.tenant_id,
        contract_id=contract.id,
        token=token,
        missing_fields=supplier_missing_fields,
        expires_at=expires_at,
    )
    session.add(req)
    session.flush()

    _send_supplier_data_email(
        contract=contract,
        token=token,
        missing_fields=supplier_missing_fields,
    )

    session.commit()
    session.refresh(req)
    return req


def _get_saludo() -> str:
    hour = datetime.now().hour
    if 6 <= hour <= 12:
        return "Buenos días"
    elif 13 <= hour <= 21:
        return "Buenas tardes"
    return "Buenos días"


_SUBCONTRATA_DOCS = (
    "- Escritura de poderes\n"
    "- DNI persona firmante\n"
    "- REA actualizado\n"
    "- Certificado negativo de Hacienda\n"
    "- Certificado de estar al corriente de pago en la Seguridad Social"
)

_SUMINISTRO_SERVICIO_DOCS = (
    "- Datos Empresa\n"
    "- DNI persona firmante\n"
    "- Escritura de poderes"
)


def _send_supplier_data_email(
    *,
    contract: Contract,
    token: str,
    missing_fields: list[str],
) -> None:
    from app.platform.contracts_core.models import ContractType

    recipient = contract.supplier_email
    if not recipient:
        logger.warning(
            "No supplier email for contract %s — skipping supplier data email", contract.id
        )
        return

    complete_url = _build_supplier_complete_url(token)
    saludo = _get_saludo()
    obra = contract.title or str(contract.id)

    if contract.type == ContractType.SUBCONTRATACION:
        subject = f"Solicitud de documentación — contrato de subcontratación {obra}"
        body = (
            f"{saludo},\n\n"
            f"Para poder confeccionarles el contrato de subcontratación de la obra {obra}, "
            f"les solicitamos nos envíen la siguiente documentación, a la mayor brevedad posible:\n\n"
            f"{_SUBCONTRATA_DOCS}\n\n"
            f"A través de este enlace:\n"
            f"{complete_url}\n\n"
            f"Cualquier consulta o aclaración no duden en ponerse en contacto con nosotros.\n\n"
            f"Un saludo.\n"
        )
    elif contract.type in (ContractType.SUMINISTRO, ContractType.SERVICIO):
        subject = f"Solicitud de documentación — contrato {obra}"
        body = (
            f"{saludo},\n\n"
            f"Para poder confeccionarles el contrato de la obra {obra}, "
            f"les solicitamos nos envíen la siguiente documentación, a la mayor brevedad posible:\n\n"
            f"{_SUMINISTRO_SERVICIO_DOCS}\n\n"
            f"A través de este enlace:\n"
            f"{complete_url}\n\n"
            f"Cualquier consulta o aclaración no duden en ponerse en contacto con nosotros.\n\n"
            f"Un saludo.\n"
        )
    else:
        fields_list = "\n".join(
            f"  - {_SUPPLIER_FIELD_LABELS.get(field, field)}"
            for field in missing_fields
        )
        subject = f"Solicitud de datos para contrato — {obra}"
        body = (
            f"{saludo},\n\n"
            f"Para completar la formalización de su contrato necesitamos que nos facilite "
            f"los siguientes datos:\n\n"
            f"{fields_list}\n\n"
            f"Por favor, acceda al siguiente enlace para completar la información:\n"
            f"{complete_url}\n\n"
            f"El enlace expira en {_TOKEN_EXPIRY_HOURS} horas.\n\n"
            f"Un saludo.\n"
        )

    sent = _send_email([recipient], subject, body)
    if not sent:
        logger.warning(
            "Could not send supplier data email for contract %s to %s", contract.id, recipient
        )


# ── Token validation ───────────────────────────────────────────────────────────

def get_supplier_request_or_error(
    session: Session,
    *,
    token: str,
) -> SupplierDataRequest:
    req = session.exec(
        select(SupplierDataRequest).where(SupplierDataRequest.token == token)
    ).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enlace no válido.")
    if req.completed_at is not None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Este enlace ya fue utilizado.")
    expires = req.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="El enlace ha caducado.")
    return req


# ── Supplier data submission ───────────────────────────────────────────────────

def submit_supplier_data(
    session: Session,
    *,
    token: str,
    submitted_data: dict[str, Any],
) -> Contract:
    """
    Proveedor envía datos faltantes.
    1. Valida token + expiración.
    2. Guarda datos en Supplier + Contract.
    3. Marca request como completado.
    4. Dispara FASE 6A automáticamente.
    Returns the updated contract.
    """
    req = get_supplier_request_or_error(session, token=token)
    contract = session.get(Contract, req.contract_id)
    if not contract:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contrato no encontrado.")

    missing = list(req.missing_fields or [])

    # Server-side validation: all missing fields must now be present
    errors: list[str] = []
    for var in missing:
        field_key = var.lower()  # submitted_data uses lowercase [var] names
        value = submitted_data.get(field_key) or submitted_data.get(var)
        if not value or not str(value).strip():
            errors.append(var)
    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Campos obligatorios incompletos", "missing": errors},
        )

    # Persist supplier data
    _apply_supplier_data(session, contract=contract, data=submitted_data, missing_vars=missing)

    # Marcar captura para que el historial del comparativo avance.
    from sqlalchemy.orm.attributes import flag_modified as _flag_modified
    cd_capture = dict(contract.comparative_data or {})
    cd_capture["supplier_data_captured_at"] = datetime.now(timezone.utc).isoformat()
    cd_capture.pop("needs_supplier_form_after_approval", None)
    contract.comparative_data = cd_capture
    _flag_modified(contract, "comparative_data")
    session.add(contract)
    session.flush()

    try:
        # Auto-trigger FASE 6A
        from app.domains.procurement.contracts.document_generator import generate_contract_from_template
        generate_contract_from_template(session, contract=contract, created_by_id=None)

        # Solo consumimos el token si el documento se generó correctamente.
        req.completed_at = datetime.now(timezone.utc)
        session.add(req)
        session.commit()

        contract_crud._log_event(
            session,
            tenant_id=contract.tenant_id,
            contract_id=contract.id,
            user_id=None,
            event_type="contract.supplier_data_submitted",
            payload={"token": token, "fields": missing},
        )
        session.refresh(contract)
        return contract
    except Exception:
        session.rollback()
        raise


_FORM_TO_CONTRACT_FIELD: dict[str, str] = {
    "cif_nif": "supplier_tax_id",
    "razon_social": "supplier_name",
    "nombre_firmante": "supplier_contact_name",
    "direccion": "supplier_address",
}

_FORM_TO_SUPPLIER_FIELD: dict[str, str] = {
    "cif_nif": "tax_id",
    "razon_social": "name",
    "nombre_firmante": "contact_name",
    "direccion": "address",
}

_FORM_EXTRA_FIELDS = {
    "nif_firmante",
    "tipo_escritura",
    "fecha_escritura",
    "nombre_notario",
    "numero_protocolo",
}


def _apply_supplier_data(
    session: Session,
    *,
    contract: Contract,
    data: dict[str, Any],
    missing_vars: list[str],
) -> None:
    """Apply submitted data to Supplier record and Contract supplier fields."""
    supplier: Optional[Supplier] = None
    if contract.supplier_id:
        supplier = session.get(Supplier, contract.supplier_id)
    elif contract.supplier_tax_id:
        supplier = session.exec(
            select(Supplier).where(
                Supplier.tenant_id == contract.tenant_id,
                Supplier.tax_id == contract.supplier_tax_id,
            )
        ).first()

    # Campos del template anterior (VAR names como CIF_NIF, NOMBRE_PROVEEDOR…)
    for var in missing_vars:
        value = data.get(var.lower()) or data.get(var) or ""
        value = str(value).strip()
        if not value:
            continue
        contract_field = _VAR_TO_CONTRACT_FIELD.get(var)
        if contract_field:
            setattr(contract, contract_field, value)
        if supplier:
            supplier_field = _VAR_TO_SUPPLIER_FIELD.get(var)
            if supplier_field:
                setattr(supplier, supplier_field, value)

    # Nuevos campos del formulario público (lowercase snake_case)
    extra: dict[str, Any] = dict(contract.contract_data or {})
    for key, value in data.items():
        key = str(key).lower()
        value = str(value).strip() if value else ""
        if not value:
            continue
        contract_field = _FORM_TO_CONTRACT_FIELD.get(key)
        if contract_field:
            setattr(contract, contract_field, value)
        if supplier:
            supplier_field = _FORM_TO_SUPPLIER_FIELD.get(key)
            if supplier_field:
                setattr(supplier, supplier_field, value)
        if key in _FORM_EXTRA_FIELDS:
            extra[key] = value

    contract.contract_data = extra
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)

    if supplier:
        supplier.updated_at = datetime.now(timezone.utc)
        supplier.status = SupplierStatus.ACTIVE
        session.add(supplier)

    session.flush()
