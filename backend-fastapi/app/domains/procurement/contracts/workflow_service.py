"""
Lógica de negocio para las fases de contrato post-comparativo (FASE 3–8).

FASE 3  — activate_contract:  comparative APPROVED → contract PENDING_TEMPLATE
FASE 4  — select_template:    PENDING_TEMPLATE → PENDING_DATA_VALIDATION
FASE 5  — validate_fields:    comprueba variables [CAMPO] de la plantilla vs BD
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.platform.contracts_core.models import (
    ComparativeStatus,
    Contract,
    ContractStatus,
    ContractSubtype,
    ContractTemplate,
)
from app.platform.contracts_core.permissions import (
    ROLE_ADMIN_ALIASES,
    can_view_contract,
    ensure_tenant_access,
    _get_role_name,
)
from app.domains.procurement.contracts import crud as contract_crud
from app.models.user import User


# ── Mapeo [VAR] → campo del Contract/Supplier ─────────────────────────────────

# Campos mínimos requeridos del proveedor (Fase 5 spec)
_SUPPLIER_VAR_MAP: dict[str, str] = {
    "NOMBRE_PROVEEDOR": "supplier_name",
    "CIF_NIF": "supplier_tax_id",
    "DIRECCION": "supplier_address",
    "CIUDAD": "supplier_city",
    "CODIGO_POSTAL": "supplier_postal_code",
    "EMAIL_PROVEEDOR": "supplier_email",
    "TELEFONO": "supplier_phone",
    "IBAN": "supplier_bank_iban",
}

# Campos del contrato requeridos (Fase 5 spec)
_CONTRACT_VAR_MAP: dict[str, str] = {
    "IMPORTE_TOTAL": "total_amount",
    "FECHA_INICIO": "_contract_data.schedule.start_date",
    "FECHA_FIN": "_contract_data.schedule.end_date",
    "CONDICIONES_PAGO": "_contract_data.economic.payment_method",
    "DESCRIPCION_TRABAJOS": "_contract_data.additional.units_description",
    "NOMBRE_PROYECTO": "_project_name",
    "CODIGO_PROYECTO": "project_id",
}


def _is_non_empty(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _resolve_contract_var(contract: Contract, var_name: str) -> Any:
    """Resolve a [VAR_NAME] to its actual value from the contract record."""
    if var_name in _SUPPLIER_VAR_MAP:
        return getattr(contract, _SUPPLIER_VAR_MAP[var_name], None)

    if var_name in _CONTRACT_VAR_MAP:
        field = _CONTRACT_VAR_MAP[var_name]
        if field.startswith("_contract_data."):
            parts = field.split(".")
            data = contract.contract_data or {}
            value = data.get(parts[1], {}) or {}
            return value.get(parts[2]) if isinstance(value, dict) else None
        if field == "_project_name":
            comp_data = contract.comparative_data or {}
            header = comp_data.get("header") if isinstance(comp_data, dict) else {}
            return (
                (header or {}).get("obra_nombre")
                or comp_data.get("obra")
                or comp_data.get("nombre_proyecto")
            )
        return getattr(contract, field, None)

    # Fallback: look in contract_data flat keys
    data = contract.contract_data or {}
    return data.get(var_name.lower())


# Variables presentes en las plantillas que NO bloquean la generacion si
# estan vacias: si un dato opcional falta, se sustituye por cadena vacia
# en el documento final pero no impide producirlo. Cualquier variable que
# no este aqui y resuelva a vacio se considera campo faltante.
_OPTIONAL_VARS: frozenset[str] = frozenset({
    "NIF_GERENTE",
    "PROMOTORA",
    "PROMOTOR",
    "FORMA_PAGO",
    "CONDICIONES_PAGO",
    "PORTES",
    "DESCARGAS",
    "HITOS",
    "TERMINO_PAGO",
    "DURACION_OBRA",
    "PLAZO_EJECUCION",
    "DESCRIPCION_TRABAJOS",
    "IMPORTE_LETRAS",
    "MONEDA",
    "PAIS",
    "BIC",
    "IBAN",
    "TELEFONO",
    "CIUDAD",
    "CODIGO_POSTAL",
    "EMAIL_PROVEEDOR",
    "NOMBRE_CONTACTO",
    # SUBCONTRATACION: datos de escritura del proveedor (vienen del lookup
    # canónico en `proveedores` por CIF, no del Contract directamente).
    # No bloquean: si faltan, quedan en blanco en el PDF.
    "TIPO_ESCRITURA",
    "FECHA_ESCRITURA",
    "NOMBRE_NOTARIO",
    "NUMERO_PROTOCOLO",
    # SUBCONTRATACION: campos opcionales del form (rellena JO si aplica).
    "NUM_TRAB",
    "NUM_TRAB_LETRA",
    "GARANTIA",
    "PRECIO_LETRA",
    # SERVICIOS: tipo de servicio acordado (opcional).
    "TIPO_SERVICIO",
    # Aliases semánticos de FECHA_FIN ya cubiertos por FECHA_FIN.
    "FIN_OBRA",
    # Alias numérico del NUMERO_OBRA cuando el formulario solo trae NUM_OBRA.
    "NUMERO_OBRA",
})


def _check_missing_vars(contract: Contract, variables: list[str]) -> list[str]:
    """Return list of [VAR] names whose value is missing/empty in the contract.

    Para resolver cada variable usamos el mismo contexto que el generador real
    (`_build_substitution_context`), asi cualquier token que el generador sabe
    sustituir se considera cubierto. Solo se reportan como "faltantes" los
    tokens cuyo valor sustituido seria vacio y no estan en `_OPTIONAL_VARS`.
    """
    try:
        from app.domains.procurement.contracts.document_generator import (
            _build_substitution_context,
        )
        context = _build_substitution_context(contract)
    except Exception:
        context = {}

    missing: list[str] = []
    for var in variables:
        if var in context:
            value = context.get(var)
        else:
            value = _resolve_contract_var(contract, var)
        if _is_non_empty(value):
            continue
        if var in _OPTIONAL_VARS:
            continue
        missing.append(var)
    return missing


def _user_is_admin(session: Session, user: User) -> bool:
    if user.is_super_admin:
        return True
    role = _get_role_name(session, user)
    if role == "tenant_admin":
        return True
    return role in ROLE_ADMIN_ALIASES


# ── FASE 3: activate contract ──────────────────────────────────────────────────

def activate_contract(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    subtype: Optional[ContractSubtype] = None,
) -> Contract:
    """
    Administración activa el contrato desde comparativo aprobado.
    Transición: comparative_status=APPROVED → contract.status=PENDING_TEMPLATE
    """
    ensure_tenant_access(user, tenant_id)
    if not _user_is_admin(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Administración puede activar contratos desde comparativos.",
        )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)

    comparative_status_raw = getattr(contract.comparative_status, "value", contract.comparative_status)
    comparative_status = str(comparative_status_raw or "").strip().upper()
    if comparative_status != ComparativeStatus.APPROVED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comparativo debe estar aprobado para activar el contrato.",
        )
    status_raw = getattr(contract.status, "value", contract.status)
    current_status = str(status_raw or "").strip().upper()
    allowed_statuses = {
        ContractStatus.DRAFT.value,
        ContractStatus.PENDING_JEFE_OBRA.value,
        ContractStatus.PENDING_TEMPLATE.value,
    }
    if current_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El contrato ya está en estado {current_status or 'DESCONOCIDO'}.",
        )

    if subtype is not None:
        # ContractSubtype values match ContractType enum — lowercase vs uppercase
        from app.platform.contracts_core.models import ContractType
        type_map = {
            ContractSubtype.SUBCONTRATACION: ContractType.SUBCONTRATACION,
            ContractSubtype.SERVICIO: ContractType.SERVICIO,
            ContractSubtype.SUMINISTRO: ContractType.SUMINISTRO,
        }
        contract.type = type_map[subtype]

    contract.status = ContractStatus.PENDING_TEMPLATE
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    contract_crud.ensure_contract_admin_assignment(session, contract=contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.activated",
        payload={"subtype": subtype.value if subtype else None},
    )

    return contract


def auto_progress_after_comparative_approval(
    session: Session,
    *,
    contract: Contract,
) -> Contract:
    """Avanza el contrato post-aprobación de comparativo.

    Flujo deseado:
    1. Si hay una única plantilla activa para el tipo del contrato, se asigna.
    2. Se genera automáticamente el PDF.
    3. El contrato queda en DRAFT para revisión de Administración.

    Si el tipo no está fijado o hay varias plantillas posibles, se deja en
    `PENDING_TEMPLATE` para que Administración seleccione plantilla.
    """
    if contract.comparative_status != ComparativeStatus.APPROVED:
        return contract

    # Si el contrato está bloqueado a la espera del formulario del proveedor,
    # no avanzamos: ese flujo lo controla `approve_comparative`.
    cd = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    if cd.get("needs_supplier_form_after_approval"):
        return contract

    status_value = getattr(contract.status, "value", contract.status)
    current_status = str(status_value or "").strip().upper()

    # Paso 1: si ya conocemos el tipo, intentamos resolver plantilla única.
    if contract.type is not None:
        # ContractTemplate.subtype guarda el valor en minúsculas
        # (ContractSubtype: "subcontratacion" | "servicio" | "suministro"),
        # mientras que Contract.type es ContractType en mayúsculas.
        type_value = getattr(contract.type, "value", str(contract.type)).lower()
        templates = session.exec(
            select(ContractTemplate).where(
                ContractTemplate.tenant_id == contract.tenant_id,
                ContractTemplate.subtype == type_value,
                ContractTemplate.is_active.is_(True),
            )
        ).all()
        if len(templates) == 1:
            template = templates[0]
            contract.template_id = template.id
            contract.updated_at = datetime.now(timezone.utc)
            session.add(contract)
            contract_crud.ensure_contract_admin_assignment(session, contract=contract)
            session.flush()
            contract_crud._log_event(
                session,
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                user_id=None,
                event_type="contract.auto_template_selected",
                payload={"template_id": template.id, "template_name": template.name},
            )
        elif current_status == ContractStatus.DRAFT.value:
            contract.status = ContractStatus.PENDING_TEMPLATE
            contract.updated_at = datetime.now(timezone.utc)
            session.add(contract)
            contract_crud.ensure_contract_admin_assignment(session, contract=contract)
            session.flush()
            contract_crud._log_event(
                session,
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                user_id=None,
                event_type="contract.auto_activated",
                payload={"type": getattr(contract.type, "value", str(contract.type))},
            )
            current_status = ContractStatus.PENDING_TEMPLATE.value

    # Paso 2: generar automáticamente el PDF si ya hay plantilla asignada.
    if contract.template_id is not None:
        try:
            from app.domains.procurement.contracts.document_generator import (
                generate_contract_from_template,
            )

            generate_contract_from_template(
                session,
                contract=contract,
                created_by_id=None,
            )
            session.refresh(contract)
        except Exception as exc:  # noqa: BLE001
            import logging as _logging
            _logging.getLogger("app.platform.contracts_core").warning(
                "auto_progress: generate_contract_from_template fallo contract_id=%s: %s",
                contract.id,
                exc,
            )
            # Best-effort: el comparativo queda aprobado y Administración podrá
            # regenerar manualmente el contrato si falta algún dato extraordinario.

    return contract


# ── FASE 4: select template ────────────────────────────────────────────────────

class FieldValidationResult:
    def __init__(self, missing: list[str]):
        self.missing = missing

    @property
    def is_complete(self) -> bool:
        return len(self.missing) == 0


def select_template(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    template_id: int,
    user: User,
) -> tuple[Contract, FieldValidationResult]:
    """
    Administración selecciona plantilla.
    Transición: PENDING_TEMPLATE → PENDING_DATA_VALIDATION
    Devuelve contrato + resultado de validación de campos.
    """
    ensure_tenant_access(user, tenant_id)
    if not _user_is_admin(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Administración puede seleccionar la plantilla.",
        )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.status != ContractStatus.PENDING_TEMPLATE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El contrato debe estar en estado PENDING_TEMPLATE para seleccionar plantilla.",
        )

    template = session.exec(
        select(ContractTemplate).where(
            ContractTemplate.id == template_id,
            ContractTemplate.tenant_id == tenant_id,
            ContractTemplate.is_active.is_(True),
        )
    ).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plantilla no encontrada o inactiva.",
        )

    contract.template_id = template.id
    contract.status = ContractStatus.PENDING_DATA_VALIDATION
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    contract_crud.ensure_contract_admin_assignment(session, contract=contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.template_selected",
        payload={"template_id": template.id, "template_name": template.name},
    )

    # FASE 5: validate immediately
    validation = validate_contract_fields(session, contract=contract, template=template)
    return contract, validation


# ── FASE 5: validate fields ────────────────────────────────────────────────────

def validate_contract_fields(
    session: Session,
    *,
    contract: Contract,
    template: Optional[ContractTemplate] = None,
) -> FieldValidationResult:
    """
    Comprueba si todos los [VARIABLES] de la plantilla tienen valor en BD.
    Si no hay plantilla asignada, valida contra el conjunto mínimo requerido.
    """
    if template is None and contract.template_id:
        template = session.get(ContractTemplate, contract.template_id)

    if template and template.variables:
        variables_to_check = [str(v) for v in template.variables]
    else:
        # Conjunto mínimo si no hay plantilla
        variables_to_check = list(_SUPPLIER_VAR_MAP.keys()) + list(_CONTRACT_VAR_MAP.keys())

    missing = _check_missing_vars(contract, variables_to_check)
    return FieldValidationResult(missing=missing)


def get_contract_validation(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> FieldValidationResult:
    """Endpoint helper: validate fields of a contract."""
    ensure_tenant_access(user, tenant_id)
    if not can_view_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    return validate_contract_fields(session, contract=contract)
