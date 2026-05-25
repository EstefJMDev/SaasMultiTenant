from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.platform.contracts_core.models import Contract, ContractType, Supplier
from app.domains.invoices.ocr import service as ocr_service


def _jsonable(value: Any) -> Any:
    """Convierte fechas a ISO string; el resto se devuelve tal cual.

    Sirve para evitar TypeError al volcar valores procedentes de columnas
    DATE/TIMESTAMP en columnas JSONB del contrato.
    """
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def get_supplier_by_tax_id(
    session: Session, *, tenant_id: int, tax_id: Optional[str]
) -> Optional[Supplier]:
    normalized = normalize_tax_id(tax_id)
    if not normalized:
        return None
    return session.exec(
        select(Supplier).where(
            Supplier.tenant_id == tenant_id,
            Supplier.tax_id == normalized,
        )
    ).one_or_none()


def get_provider_by_tax_id_and_type(
    session: Session,
    *,
    tax_id: Optional[str],
    contract_type: Optional[ContractType],
) -> Optional[dict]:
    return ocr_service.get_provider_by_tax_id_and_type(
        session,
        tax_id=tax_id,
        contract_type=contract_type,
    )


def sync_contract_from_supplier(contract: Contract, supplier: Supplier) -> None:
    if supplier.name and not contract.supplier_name:
        contract.supplier_name = supplier.name
    if supplier.tax_id and not contract.supplier_tax_id:
        contract.supplier_tax_id = supplier.tax_id
    if supplier.email and not contract.supplier_email:
        contract.supplier_email = supplier.email
    if supplier.phone and not contract.supplier_phone:
        contract.supplier_phone = supplier.phone
    if supplier.address and not contract.supplier_address:
        contract.supplier_address = supplier.address
    if supplier.city and not contract.supplier_city:
        contract.supplier_city = supplier.city
    if supplier.postal_code and not contract.supplier_postal_code:
        contract.supplier_postal_code = supplier.postal_code
    if supplier.country and not contract.supplier_country:
        contract.supplier_country = supplier.country
    if supplier.contact_name and not contract.supplier_contact_name:
        contract.supplier_contact_name = supplier.contact_name
    if supplier.bank_iban and not contract.supplier_bank_iban:
        contract.supplier_bank_iban = supplier.bank_iban
    if supplier.bank_bic and not contract.supplier_bank_bic:
        contract.supplier_bank_bic = supplier.bank_bic
    if supplier.legal_rep_name and not contract.supplier_legal_rep_name:
        contract.supplier_legal_rep_name = supplier.legal_rep_name
    if supplier.legal_rep_dni and not contract.supplier_legal_rep_dni:
        contract.supplier_legal_rep_dni = supplier.legal_rep_dni


def sync_contract_from_provider(contract: Contract, provider: dict) -> None:
    parsed = ocr_service.parse_spanish_address(provider.get("direccion_empresa"))
    if not contract.supplier_name:
        contract.supplier_name = provider.get("razon_social") or provider.get("empresa")
    if not contract.supplier_tax_id:
        contract.supplier_tax_id = provider.get("cif")
    if not contract.supplier_email:
        contract.supplier_email = provider.get("email_contacto")
    if not contract.supplier_phone:
        contract.supplier_phone = provider.get("telefono_contacto")
    if not contract.supplier_address:
        contract.supplier_address = parsed.get("address")
    if not contract.supplier_city:
        contract.supplier_city = parsed.get("city")
    if not contract.supplier_postal_code:
        contract.supplier_postal_code = parsed.get("postal_code")
    if not contract.supplier_country:
        contract.supplier_country = parsed.get("country")
    if not contract.supplier_contact_name:
        contract.supplier_contact_name = provider.get("nombre_gerente")
    # Representante legal del proveedor: la tabla `proveedores` es la fuente
    # canónica (universal, consolidada del ERP). Si el contrato aún no tiene
    # estos campos guardados, los hereda de `proveedores`. NO pisamos lo que ya
    # exista (el usuario puede haberlo editado manualmente en el form).
    if not contract.supplier_legal_rep_name and provider.get("nombre_gerente"):
        contract.supplier_legal_rep_name = provider.get("nombre_gerente")
    if not contract.supplier_legal_rep_dni and (
        provider.get("nif_gerente") or provider.get("dni_gerente")
    ):
        contract.supplier_legal_rep_dni = provider.get("nif_gerente") or provider.get(
            "dni_gerente"
        )
    # Datos de escritura (SUBCONTRATACION): mismo principio que el firmante.
    # Tabla `proveedores` es la fuente canónica; sólo rellenamos columna
    # dedicada si está vacía (el usuario puede haberla editado en el form).
    if not contract.deed_type and provider.get("tipo_escritura"):
        contract.deed_type = provider.get("tipo_escritura")
    if not contract.notary_name and provider.get("nombre_notario"):
        contract.notary_name = provider.get("nombre_notario")
    if not contract.notary_protocol and (
        provider.get("numero_protocolo") or provider.get("num_protocolo")
    ):
        contract.notary_protocol = (
            provider.get("numero_protocolo") or provider.get("num_protocolo")
        )

    # Precarga campos legales/representante para contratos con plantilla juridica.
    contract_data = dict(contract.contract_data or {})
    manager = dict(contract_data.get("manager") or {})
    legal = dict(contract_data.get("legal") or {})
    changed = False

    if not manager.get("nombre_gerente") and provider.get("nombre_gerente"):
        manager["nombre_gerente"] = _jsonable(provider.get("nombre_gerente"))
        changed = True
    if not manager.get("nif_gerente") and provider.get("nif_gerente"):
        manager["nif_gerente"] = _jsonable(provider.get("nif_gerente"))
        changed = True

    if not legal.get("tipo_escritura") and provider.get("tipo_escritura"):
        legal["tipo_escritura"] = _jsonable(provider.get("tipo_escritura"))
        changed = True
    if not legal.get("fecha_escritura") and provider.get("fecha_escritura"):
        legal["fecha_escritura"] = _jsonable(provider.get("fecha_escritura"))
        changed = True
    if not legal.get("nombre_notario") and provider.get("nombre_notario"):
        legal["nombre_notario"] = _jsonable(provider.get("nombre_notario"))
        changed = True
    if not legal.get("num_protocolo") and provider.get("num_protocolo"):
        legal["num_protocolo"] = _jsonable(provider.get("num_protocolo"))
        changed = True

    if changed:
        contract_data["manager"] = manager
        contract_data["legal"] = legal
        contract.contract_data = contract_data


def sync_supplier_from_contract(supplier: Supplier, contract: Contract) -> None:
    if contract.supplier_name:
        supplier.name = contract.supplier_name
    if contract.supplier_tax_id:
        # Normalizamos para que el lookup posterior por CIF (get_supplier_by_tax_id)
        # encuentre el registro aunque el usuario lo haya tecleado con guiones,
        # espacios o minúsculas.
        supplier.tax_id = normalize_tax_id(contract.supplier_tax_id)
    if contract.supplier_email:
        supplier.email = contract.supplier_email
    if contract.supplier_phone:
        supplier.phone = contract.supplier_phone
    if contract.supplier_address:
        supplier.address = contract.supplier_address
    if contract.supplier_city:
        supplier.city = contract.supplier_city
    if contract.supplier_postal_code:
        supplier.postal_code = contract.supplier_postal_code
    if contract.supplier_country:
        supplier.country = contract.supplier_country
    if contract.supplier_contact_name:
        supplier.contact_name = contract.supplier_contact_name
    if contract.supplier_bank_iban:
        supplier.bank_iban = contract.supplier_bank_iban
    if contract.supplier_bank_bic:
        supplier.bank_bic = contract.supplier_bank_bic
    if contract.supplier_legal_rep_name:
        supplier.legal_rep_name = contract.supplier_legal_rep_name
    if contract.supplier_legal_rep_dni:
        supplier.legal_rep_dni = contract.supplier_legal_rep_dni


def validate_supplier_email_if_present(email: Optional[str]) -> None:
    if email and not is_valid_email(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El correo del proveedor no tiene un formato valido.",
        )


def is_valid_email(value: Optional[str]) -> bool:
    if not value:
        return False
    return re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value) is not None


def normalize_email(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().lower()
    return cleaned or None


def normalize_tax_id(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9]", "", value).upper()
    return cleaned or None

