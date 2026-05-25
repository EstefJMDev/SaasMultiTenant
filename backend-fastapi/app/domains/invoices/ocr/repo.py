from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select
from sqlalchemy import text

from app.platform.contracts_core.models import ContractType, Supplier, SupplierStatus
from app.domains.invoices.ocr import parse


logger = logging.getLogger("app.domains.invoices.ocr")


def find_supplier_by_tax_id(
    session: Session,
    *,
    tenant_id: int,
    tax_id: Optional[str],
) -> Optional[Supplier]:
    return _get_supplier_by_tax_id(session, tenant_id=tenant_id, tax_id=tax_id)


def find_supplier_by_email(
    session: Session,
    *,
    tenant_id: int,
    email: Optional[str],
) -> Optional[Supplier]:
    if not email:
        return None
    normalized = str(email).strip()
    if not normalized:
        return None
    return session.exec(
        select(Supplier).where(
            Supplier.tenant_id == tenant_id,
            Supplier.email == normalized,
        )
    ).one_or_none()


def find_supplier_by_name(
    session: Session,
    *,
    tenant_id: int,
    name: Optional[str],
) -> Optional[Supplier]:
    if not name:
        return None
    normalized = re.sub(r"\s+", " ", str(name)).strip()
    if len(normalized) < 3:
        return None
    return session.exec(
        select(Supplier).where(
            Supplier.tenant_id == tenant_id,
            Supplier.name == normalized,
        )
    ).one_or_none()



def _get_provider_by_tax_id(session: Session, *, tax_id: Optional[str]) -> Optional[dict]:
    return _get_provider_by_tax_id_and_type(
        session,
        tax_id=tax_id,
        contract_type=None,
    )


def _get_provider_by_tax_id_and_type(
    session: Session,
    *,
    tax_id: Optional[str],
    contract_type: Optional[ContractType],
) -> Optional[dict]:
    """Busca un proveedor por CIF en la tabla unificada `proveedores`.

    Los proveedores son universales (no se separan por tipo de contrato): la
    tabla `proveedores` consolida los datos legales (gerente, escritura,
    notario...) y los flags `puede_sub` / `puede_sum_ser` indican para qué
    tipos sirve. El parámetro `contract_type` se conserva para compatibilidad
    de firma pero no filtra el lookup.
    """
    del contract_type  # universal: no se filtra por tipo

    normalized = parse._normalize_tax_id(tax_id)
    if not normalized:
        return None

    stmt = text(
        """
        SELECT
            'proveedores' AS source,
            razon_social,
            empresa,
            cif,
            nombre_gerente,
            nif_gerente,
            direccion_empresa,
            tipo_escritura,
            fecha_escritura,
            nombre_notario,
            numero_protocolo,
            NULL AS telefono_contacto,
            NULL AS email_contacto,
            puede_sub,
            puede_sum_ser
        FROM proveedores
        WHERE regexp_replace(UPPER(cif), '[^A-Z0-9]', '', 'g') = :lookup_id
           OR regexp_replace(UPPER(COALESCE(nif_gerente, '')), '[^A-Z0-9]', '', 'g') = :lookup_id
        LIMIT 1
        """
    )

    try:
        with session.begin_nested():
            row = session.exec(stmt, params={"lookup_id": normalized}).first()
    except Exception:
        logger.warning(
            "No se pudo consultar la tabla 'proveedores' por CIF tax_id=%s",
            normalized,
            exc_info=True,
        )
        return None

    if row:
        return dict(row._mapping)
    return None


def _get_provider_by_name_and_type(
    session: Session,
    *,
    name: Optional[str],
    contract_type: Optional[ContractType],
) -> Optional[dict]:
    """Busca un proveedor por razón social/empresa en la tabla `proveedores`.

    `contract_type` se conserva por compatibilidad de firma pero no filtra
    (los proveedores son universales).
    """
    del contract_type  # universal: no se filtra por tipo

    if not name:
        return None
    normalized_name = re.sub(r"\s+", " ", str(name)).strip()
    if len(normalized_name) < 3:
        return None

    stmt = text(
        """
        SELECT
            'proveedores' AS source,
            razon_social,
            empresa,
            cif,
            nombre_gerente,
            nif_gerente,
            direccion_empresa,
            tipo_escritura,
            fecha_escritura,
            nombre_notario,
            numero_protocolo,
            NULL AS telefono_contacto,
            NULL AS email_contacto,
            puede_sub,
            puede_sum_ser
        FROM proveedores
        WHERE UPPER(COALESCE(razon_social, '')) LIKE UPPER(:needle)
           OR UPPER(COALESCE(empresa, '')) LIKE UPPER(:needle)
        ORDER BY
            CASE
                WHEN UPPER(COALESCE(razon_social, '')) = UPPER(:exact_name) THEN 0
                WHEN UPPER(COALESCE(empresa, '')) = UPPER(:exact_name) THEN 1
                ELSE 2
            END
        LIMIT 1
        """
    )

    try:
        with session.begin_nested():
            row = session.exec(
                stmt,
                params={"needle": f"%{normalized_name}%", "exact_name": normalized_name},
            ).first()
    except Exception:
        logger.exception(
            "No se pudo consultar proveedor por nombre name=%s", normalized_name
        )
        return None
    if row:
        return dict(row._mapping)
    return None


def _build_supplier_from_provider(*, tenant_id: int, provider: dict) -> Supplier:
    parsed = parse._parse_spanish_address(provider.get("direccion_empresa"))

    # `fecha_escritura` viene como date desde la tabla `proveedores` (también
    # aceptamos string por si alguna otra fuente la pasa así).
    raw_deed_date = provider.get("fecha_escritura")
    deed_date: Optional[datetime] = None
    if isinstance(raw_deed_date, datetime):
        deed_date = raw_deed_date
    elif raw_deed_date is not None and not isinstance(raw_deed_date, str):
        # date (no datetime) → promovemos a datetime a medianoche
        try:
            deed_date = datetime(
                raw_deed_date.year, raw_deed_date.month, raw_deed_date.day
            )
        except (AttributeError, TypeError, ValueError):
            deed_date = None
    elif isinstance(raw_deed_date, str) and raw_deed_date.strip():
        candidate = raw_deed_date.strip()
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                deed_date = datetime.strptime(candidate, fmt)
                break
            except ValueError:
                continue

    notary_protocol = provider.get("numero_protocolo") or provider.get("num_protocolo")
    if notary_protocol is not None:
        notary_protocol = str(notary_protocol).strip() or None

    return Supplier(
        id=0,
        tenant_id=tenant_id,
        tax_id=provider.get("cif") or "",
        name=provider.get("razon_social") or provider.get("empresa"),
        email=provider.get("email_contacto"),
        phone=provider.get("telefono_contacto"),
        address=parsed.get("address"),
        city=parsed.get("city"),
        postal_code=parsed.get("postal_code"),
        country=parsed.get("country"),
        contact_name=provider.get("nombre_gerente"),
        legal_rep_name=provider.get("nombre_gerente"),
        legal_rep_dni=provider.get("nif_gerente") or provider.get("dni_gerente"),
        deed_type=provider.get("tipo_escritura"),
        deed_date=deed_date,
        notary_name=provider.get("nombre_notario"),
        notary_protocol=notary_protocol,
        status=SupplierStatus.ACTIVE,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


def _get_supplier_by_tax_id(
    session: Session, *, tenant_id: int, tax_id: Optional[str]
) -> Optional[Supplier]:
    normalized = parse._normalize_tax_id(tax_id)
    if not normalized:
        return None
    return session.exec(
        select(Supplier).where(
            Supplier.tenant_id == tenant_id,
            Supplier.tax_id == normalized,
        )
    ).one_or_none()


