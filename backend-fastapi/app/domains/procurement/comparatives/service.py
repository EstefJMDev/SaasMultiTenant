from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlmodel import Session, select

from app.platform.contracts_core.models import (
    ApprovalScope,
    ApprovalStatus,
    ComparativeStatus,
    Contract,
    ContractDepartment,
    ContractNotificationEvent,
    ContractOffer,
    ContractStatus,
    ContractType,
    Supplier,
    SupplierStatus,
)
from app.platform.contracts_core.permissions import (
    can_approve_comparative,
    can_approve_contract,
    can_create_comparative,
    can_delete_comparative,
    can_edit_comparative,
    can_read_comparative,
    can_reject_comparative,
    can_reject_contract,
    can_view_all_comparatives,
    can_view_all_contracts,
    can_view_contract,
    can_write_comparative,
    ensure_tenant_access,
)
from app.domains.procurement.contracts import crud as contract_crud
from app.domains.procurement.contracts import validators as contract_validators
from app.domains.procurement.notifications import (
    get_comparative_approvers,
    get_department_recipients,
    send_contract_notification,
)
from app.storage.local import ensure_upload_extension, save_contract_offer_upload
from app.models.hr import Department, EmployeeProfile, Position
from app.platform.contracts_core.models import ContractApproval


ALLOWED_CONTRACT_OFFER_EXTENSIONS = {
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "jpg",
    "jpeg",
    "png",
    "webp",
    "txt",
}
MAX_CONTRACT_OFFER_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB
from app.models.user import User

logger = logging.getLogger("app.platform.contracts_core")

_MGMT_PENDING_STATUSES = {
    ComparativeStatus.PENDING_MGMT_APPROVAL,
    ComparativeStatus.PENDING_REVIEW,  # legacy status in existing rows
}


def _merge_comparative_data(existing: object, incoming: object) -> object:
    """Merge recursivo para preservar claves existentes no enviadas en el borrador."""
    if isinstance(existing, dict) and isinstance(incoming, dict):
        merged: dict = dict(existing)
        for key, value in incoming.items():
            merged[key] = _merge_comparative_data(merged.get(key), value)
        return merged
    return incoming


def get_comparative_offers(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[dict]:
    ensure_tenant_access(user, tenant_id)
    if not can_read_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    return list((contract.comparative_data or {}).get("offers") or [])


def sync_comparative_offer_ids(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> list[dict]:
    from app.domains.procurement.comparatives import sync as comparatives_sync

    ensure_tenant_access(user, tenant_id)
    if not can_write_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)

    changed = comparatives_sync.ensure_comparative_offer_ids(
        session,
        contract=contract,
        fallback_user_id=user.id or contract.created_by_id,
    )
    if changed:
        session.commit()
        session.refresh(contract)

    return list((contract.comparative_data or {}).get("offers") or [])


def save_comparative_draft(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    payload: dict,
    user: User,
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_write_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.status != ContractStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede guardar el comparativo en borrador.",
        )
    if contract.comparative_status not in {
        ComparativeStatus.DRAFT,
        ComparativeStatus.NEEDS_CHANGES,
        ComparativeStatus.REJECTED,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comparativo ya esta en revision o aprobado.",
        )

    if "type" in payload and payload.get("type"):
        contract.type = payload["type"]
    # title SÍ se acepta: es el título manual escrito en el wizard y persiste
    # como título fijo. description/project_id se ignoran (se derivan).
    if "title" in payload:
        contract.title = contract_crud._clean_optional_title(payload.get("title"))

    comparative_data = payload.get("comparative_data")
    if comparative_data is not None and not isinstance(comparative_data, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="comparative_data debe ser un objeto JSON.",
        )
    if comparative_data is None:
        next_comparative_data = dict(contract.comparative_data or {})
    else:
        next_comparative_data = _merge_comparative_data(
            dict(contract.comparative_data or {}),
            comparative_data,
        )
        if not isinstance(next_comparative_data, dict):
            next_comparative_data = {}
    contract.comparative_data = next_comparative_data

    derived_project_id = contract_crud._resolve_valid_project_id(
        session,
        tenant_id=tenant_id,
        candidate=contract_crud._derive_project_id_from_comparative(contract.comparative_data),
    )
    if derived_project_id is not None:
        contract.project_id = derived_project_id
    # title NO se re-deriva: persiste el valor manual escrito por el usuario.
    contract.description = None

    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="comparative.draft_saved",
    )

    return contract


def rebuild_comparative(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    from app.domains.invoices.ocr import service as ocr_service
    from app.domains.procurement.comparatives import analytics as comparatives_analytics

    ensure_tenant_access(user, tenant_id)
    if not can_view_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)

    offers_stmt = (
        select(ContractOffer)
        .where(
            ContractOffer.tenant_id == tenant_id,
            ContractOffer.contract_id == contract.id,
        )
        .order_by(ContractOffer.id.asc())
    )
    offers = list(session.exec(offers_stmt).all())
    unique_offers: list[ContractOffer] = []
    seen_offer_keys: set[str] = set()
    for offer in offers:
        key = f"{(offer.original_filename or '').strip().lower()}|{(offer.file_path or '').strip().lower()}"
        if key in seen_offer_keys:
            continue
        seen_offer_keys.add(key)
        unique_offers.append(offer)
    for offer in unique_offers:
        try:
            ocr_service.extract_and_apply_offer_data(session=session, offer=offer)
        except Exception:
            continue

    comparatives_analytics.auto_repair_comparative_lines_if_needed(session, contract=contract)
    if comparatives_analytics.reconcile_comparative_offers_with_db(session, contract=contract):
        session.commit()
    session.refresh(contract)
    return contract


def add_offer(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    payload: dict,
    upload: UploadFile,
    user: User,
) -> ContractOffer:
    from app.domains.invoices.ocr import service as ocr_service
    from app.domains.procurement.comparatives import sync as comparatives_sync

    ensure_tenant_access(user, tenant_id)
    if not can_write_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    ensure_upload_extension(
        upload.filename,
        allowed_extensions=ALLOWED_CONTRACT_OFFER_EXTENSIONS,
        detail="Formato de archivo no permitido para ofertas.",
    )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.status != ContractStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se pueden cargar ofertas en borrador.",
        )
    if contract.comparative_status not in {
        ComparativeStatus.DRAFT,
        ComparativeStatus.NEEDS_CHANGES,
        ComparativeStatus.REJECTED,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comparativo ya esta en revision o aprobado.",
        )

    offer = ContractOffer(
        tenant_id=tenant_id,
        contract_id=contract.id,
        created_by_id=user.id,
        supplier_name=payload.get("supplier_name"),
        supplier_tax_id=payload.get("supplier_tax_id"),
        supplier_email=payload.get("supplier_email"),
        supplier_phone=payload.get("supplier_phone"),
        total_amount=payload.get("total_amount"),
        currency=payload.get("currency"),
        notes=payload.get("notes"),
        original_filename=upload.filename,
    )
    session.add(offer)
    session.commit()
    session.refresh(offer)

    try:
        logger.info(
            "Oferta upload inicio contract_id=%s offer_id=%s filename=%s content_type=%s",
            contract.id,
            offer.id,
            upload.filename,
            getattr(upload, "content_type", None),
        )
        stored_path = save_contract_offer_upload(
            upload,
            tenant_id,
            contract.id,
            offer.id,
            max_size_bytes=MAX_CONTRACT_OFFER_UPLOAD_BYTES,
        )
        if not stored_path.exists() or stored_path.stat().st_size <= 0:
            raise RuntimeError("Archivo subido vacio o no guardado")
        offer.file_path = str(stored_path)
        session.add(offer)
        session.commit()
        session.refresh(offer)
    except Exception as exc:
        logger.exception(
            "Error guardando oferta contract_id=%s offer_id=%s filename=%s: %s",
            contract.id,
            offer.id,
            upload.filename,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error guardando archivo de oferta",
        ) from exc

    ocr_service.extract_and_apply_offer_data(session=session, offer=offer)
    session.refresh(offer)
    comparatives_sync.sync_comparative_offers(session, contract=contract, offer=offer)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.offer_added",
        payload={"offer_id": offer.id},
    )

    return offer


def select_offer(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    offer_id: int,
    user: User,
) -> Contract:
    from app.domains.procurement import suppliers

    ensure_tenant_access(user, tenant_id)
    if not can_write_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.status != ContractStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede seleccionar oferta en borrador.",
        )
    if contract.comparative_status not in {
        ComparativeStatus.DRAFT,
        ComparativeStatus.REJECTED,
        ComparativeStatus.NEEDS_CHANGES,
        ComparativeStatus.APPROVED,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede cambiar la oferta seleccionada en el estado actual.",
        )

    offer = contract_crud._get_offer_or_404(session, offer_id, tenant_id)
    if offer.contract_id != contract.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Oferta no valida")

    contract.selected_offer_id = offer.id
    if offer.supplier_name and not contract.supplier_name:
        contract.supplier_name = offer.supplier_name
    if offer.supplier_tax_id and not contract.supplier_tax_id:
        contract.supplier_tax_id = offer.supplier_tax_id
    if offer.supplier_email and not contract.supplier_email:
        contract.supplier_email = offer.supplier_email
    if offer.supplier_phone and not contract.supplier_phone:
        contract.supplier_phone = offer.supplier_phone
    if offer.total_amount is not None:
        contract.total_amount = offer.total_amount
    if offer.currency:
        contract.currency = offer.currency
    if contract.comparative_data is not None:
        data = contract.comparative_data
        data["selected_offer_id"] = offer.id
        contract.comparative_data = data

    contract_crud.ensure_supplier_snapshot(session, contract=contract)

    if contract.supplier_tax_id:
        supplier = suppliers.get_supplier_by_tax_id(
            session,
            tenant_id=tenant_id,
            tax_id=contract.supplier_tax_id,
        )
        if supplier:
            suppliers.sync_supplier_from_contract(supplier, contract)
            session.add(supplier)
            contract.supplier_id = supplier.id
        elif contract_validators.is_valid_email(contract.supplier_email):
            supplier = Supplier(
                tenant_id=tenant_id,
                created_by_id=user.id,
                tax_id=contract.supplier_tax_id,
                name=contract.supplier_name,
                email=contract.supplier_email,
                phone=contract.supplier_phone,
                address=contract.supplier_address,
                city=contract.supplier_city,
                postal_code=contract.supplier_postal_code,
                country=contract.supplier_country,
                contact_name=contract.supplier_contact_name,
                bank_iban=contract.supplier_bank_iban,
                bank_bic=contract.supplier_bank_bic,
                status=SupplierStatus.PENDING,
                updated_at=datetime.now(timezone.utc),
            )
            try:
                with session.begin_nested():
                    session.add(supplier)
                    session.flush()
            except IntegrityError:
                supplier = suppliers.get_supplier_by_tax_id(
                    session,
                    tenant_id=tenant_id,
                    tax_id=contract.supplier_tax_id,
                )
                if supplier is None:
                    raise
            contract.supplier_id = supplier.id

    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="contract.offer_selected",
        payload={"offer_id": offer.id},
    )

    return contract


def _resolve_supplier_in_db(
    session: Session,
    *,
    contract: Contract,
    tenant_id: int,
) -> Optional[Supplier]:
    """Devuelve el proveedor en BD si existe (independientemente de su status).

    Orden de resolución:
      1. Por `contract.supplier_id` en la tabla `supplier`.
      2. Por `contract.supplier_tax_id` en la tabla `supplier`.
      3. Fallback a la tabla unificada `proveedores` (datos consolidados del
         ERP) si no hay registro en `supplier` o si está incompleto. Se
         devuelve un `Supplier` virtual (sin persistir) construido a partir
         de los datos de `proveedores`, para que `_supplier_form_required`
         pueda evaluar correctamente sin pedir un formulario que ya tenemos
         respondido.
    """
    from app.domains.procurement.suppliers import get_supplier_by_tax_id

    base: Optional[Supplier] = None
    if contract.supplier_id:
        base = session.get(Supplier, contract.supplier_id)
    if base is None and contract.supplier_tax_id:
        base = get_supplier_by_tax_id(
            session,
            tenant_id=tenant_id,
            tax_id=contract.supplier_tax_id,
        )

    if base is not None and not _supplier_form_required(
        contract=contract, supplier=base
    ):
        return base

    # Fallback ERP: si en `supplier` no hay registro o está incompleto,
    # consultamos la tabla unificada `proveedores` que consolida los datos
    # legales (gerente, escritura, notario...).
    if contract.supplier_tax_id:
        try:
            from app.domains.invoices.ocr import service as ocr_service

            provider = ocr_service.get_provider_by_tax_id_and_type(
                session,
                tax_id=contract.supplier_tax_id,
                contract_type=contract.type,
            )
            if provider:
                legacy_supplier = ocr_service.build_supplier_from_provider(
                    tenant_id=tenant_id, provider=provider
                )
                # Si el legacy está completo lo devolvemos como "encontrado".
                if not _supplier_form_required(
                    contract=contract, supplier=legacy_supplier
                ):
                    return legacy_supplier
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Fallback ERP legacy fallo tax_id=%s: %s",
                contract.supplier_tax_id,
                exc,
            )

    return base


# Campos básicos del proveedor exigidos para SUMINISTRO y SERVICIO.
# `phone` no se exige: el contacto operativo es por email y la tabla
# `proveedores` (ERP) no almacena teléfono, así que pedirlo forzaba un
# formulario de onboarding innecesario cuando el resto de datos ya estaba.
_SUPPLIER_BASIC_FIELDS = (
    "name",
    "email",
    "address",
    "city",
    "postal_code",
    "country",
)

# Campos exigidos para SUBCONTRATACION (datos de empresa requeridos antes de
# firmar). Si alguno falta se envía el formulario al proveedor.
# Fuente: requisitos funcionales para contratos de subcontrata.
_SUPPLIER_FULL_FIELDS = (
    "tax_id",          # CIF/NIF
    "name",            # Razón social
    "legal_rep_name",  # Nombre persona firmante / representante
    "legal_rep_dni",   # NIF persona firmante / representante
    "address",         # Dirección de la empresa
    "deed_type",       # Tipo de escritura
    "deed_date",       # Fecha de escritura
    "notary_name",     # Nombre del notario
    "notary_protocol", # Número de protocolo
)


def _supplier_form_required(
    *,
    contract: Contract,
    supplier: Optional[Supplier],
) -> bool:
    """Decide si hay que enviar al proveedor el formulario de onboarding.

    Reglas:
    - Si el proveedor no existe en BD → siempre se envía.
    - Si el contrato es SUBCONTRATACION → todos los campos del proveedor son
      obligatorios; basta con que uno esté vacío para enviar el formulario.
    - Si el contrato es SUMINISTRO o SERVICIO → solo se exigen los datos
      básicos (contacto y dirección); si falta alguno, se envía.
    """
    if supplier is None:
        return True
    required = (
        _SUPPLIER_FULL_FIELDS
        if contract.type == ContractType.SUBCONTRATACION
        else _SUPPLIER_BASIC_FIELDS
    )
    for field in required:
        value = getattr(supplier, field, None)
        if value is None:
            return True
        if isinstance(value, str) and not value.strip():
            return True
    return False


def validate_rea_for_contract(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> dict:
    """Consulta REA del proveedor del comparativo y decide siguiente accion.

    Devuelve:
      - rea: dict con resultado de la consulta REA
      - supplier_in_db: bool
      - next_action: "send_to_approval" si REA=ALTA y proveedor en BD
                     "send_to_supplier" en cualquier otro caso
    """
    from app.domains.procurement.rea_validator import consultar_rea

    ensure_tenant_access(user, tenant_id)
    if not can_edit_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    tax_id = (contract.supplier_tax_id or "").strip()
    if not tax_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Falta CIF/NIF del proveedor para validar en REA.",
        )

    rea_result = consultar_rea(tax_id)
    supplier_in_db = _resolve_supplier_in_db(
        session,
        contract=contract,
        tenant_id=tenant_id,
    )

    rea_ok = rea_result.get("estado") == "ALTA"
    # El proveedor solo se considera apto para enviar a aprobacion sin
    # formulario adicional cuando esta en BD y cumple los campos requeridos
    # segun el tipo de contrato.
    supplier_ready = supplier_in_db is not None and not _supplier_form_required(
        contract=contract,
        supplier=supplier_in_db,
    )
    next_action = "send_to_approval" if (rea_ok and supplier_ready) else "send_to_supplier"

    return {
        "rea": rea_result,
        "supplier_in_db": supplier_in_db is not None,
        "next_action": next_action,
    }


def submit_comparative(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    from app.domains.procurement.documents import signatures as documents_signatures
    from app.domains.procurement.rea_validator import consultar_rea

    ensure_tenant_access(user, tenant_id)
    if not can_edit_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.comparative_status not in {
        ComparativeStatus.DRAFT,
        ComparativeStatus.NEEDS_CHANGES,
        ComparativeStatus.REJECTED,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede enviar a aprobacion desde borrador, 'necesita cambios' o rechazado.",
        )

    from app.domains.procurement.suppliers import is_valid_email as _is_valid_email

    supplier_email = (contract.supplier_email or "").strip()
    if not _is_valid_email(supplier_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Es necesario un email de proveedor válido para enviar el comparativo. "
                "Completa el campo Email en datos de proveedor y vuelve a intentarlo."
            ),
        )

    # Fast-track: si el proveedor acaba de completar su onboarding y el jefe
    # de obra ya revisó los datos capturados, no repetimos validación REA y
    # enviamos directamente a gerencia.
    comparative_data_existing = (
        contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    ) or {}
    fast_track_after_supplier = bool(
        comparative_data_existing.get("pending_jefe_review_after_supplier")
    )

    from sqlalchemy.orm.attributes import flag_modified as _flag_modified

    if fast_track_after_supplier:
        rea_result = comparative_data_existing.get("rea_validation") or {
            "estado": "SKIPPED_FAST_TRACK"
        }
        rea_ok = True
        supplier_in_db = _resolve_supplier_in_db(
            session,
            contract=contract,
            tenant_id=tenant_id,
        )
    else:
        # Validacion REA antes de enviar a aprobacion.
        rea_result = consultar_rea(contract.supplier_tax_id or "")
        rea_ok = rea_result.get("estado") == "ALTA"
        supplier_in_db = _resolve_supplier_in_db(
            session,
            contract=contract,
            tenant_id=tenant_id,
        )

        # Si el proveedor no figura como ALTA en REA, no se envia a aprobacion.
        # El frontend debe ofrecer "Guardar borrador" en su lugar.
        if not rea_ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "El proveedor no figura como acreditado en REA "
                    f"(estado: {rea_result.get('estado')}). "
                    "Guarda el comparativo en borrador y revisa los datos."
                ),
            )

    # Persistimos el resultado REA en comparative_data para auditoria y UI.
    comparative_data = dict(contract.comparative_data or {})
    comparative_data["rea_validation"] = {
        "estado": rea_result.get("estado"),
        "encontrada": rea_result.get("encontrada"),
        "tipo_identificacion": rea_result.get("tipo_identificacion"),
        "numero": rea_result.get("numero"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    # Decidimos si tras aprobacion de gerencia hay que enviarle al proveedor
    # el formulario de onboarding. Para SUBCONTRATACION exigimos todos los
    # campos; para SUMINISTRO/SERVICIO basta con los datos basicos.
    if not fast_track_after_supplier and _supplier_form_required(
        contract=contract,
        supplier=supplier_in_db,
    ):
        comparative_data["needs_supplier_form_after_approval"] = True
    else:
        # Si pasamos del envio, asegurarnos de no arrastrar un flag previo
        # heredado de un ciclo anterior (p.ej. el proveedor ya completo sus
        # datos antes del reenvio).
        comparative_data.pop("needs_supplier_form_after_approval", None)
    contract.comparative_data = comparative_data
    _flag_modified(contract, "comparative_data")

    contract.comparative_status = ComparativeStatus.PENDING_MGMT_APPROVAL
    now_ts = datetime.now(timezone.utc)
    contract.updated_at = now_ts
    contract.submitted_at = now_ts
    # Limpiamos el flag de revision post-onboarding si estaba activo.
    if fast_track_after_supplier:
        cd_clear = dict(contract.comparative_data or {})
        cd_clear.pop("pending_jefe_review_after_supplier", None)
        contract.comparative_data = cd_clear
        _flag_modified(contract, "comparative_data")
    # Cada envio a aprobacion abre un nuevo ciclo (Obra + Gerencia) conservando
    # el historial de ciclos anteriores. Las ramas del nuevo ciclo se crearan
    # bajo demanda por _upsert_approval cuando se decida cada una.
    new_cycle = _open_new_comparative_cycle(session, contract)
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="comparative.submitted" if not fast_track_after_supplier else "comparative.submitted_after_supplier",
        payload={"cycle_number": new_cycle},
    )

    send_contract_notification(
        session,
        event=ContractNotificationEvent.COMPARATIVE_CREATED,
        contract=contract,
        recipients=[],
    )
    send_contract_notification(
        session,
        event=ContractNotificationEvent.COMPARATIVE_PENDING_APPROVAL,
        contract=contract,
        recipients=[],
    )

    return contract


def send_supplier_form_after_approval(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
) -> Contract:
    """Envia el formulario de onboarding al proveedor tras aprobacion del comparativo.

    Disparado manualmente por el jefe de obra cuando el proveedor figura
    en REA pero no esta en nuestra BD local. Requiere que el comparativo
    este aprobado (APPROVED) y que el flag needs_supplier_form_after_approval
    este activo.
    """
    from app.domains.procurement.documents import signatures as documents_signatures
    from sqlalchemy.orm.attributes import flag_modified as _flag_modified

    ensure_tenant_access(user, tenant_id)
    if not can_edit_comparative(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.comparative_status != ComparativeStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comparativo debe estar aprobado para enviar el formulario al proveedor.",
        )
    cd = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    if cd.get("supplier_data_captured_at"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El proveedor ya completo el formulario; no es necesario reenviarlo.",
        )
    awaiting_initial = bool(cd.get("needs_supplier_form_after_approval"))
    already_sent = bool(cd.get("supplier_form_sent_at"))
    if not awaiting_initial and not already_sent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Este comparativo no necesita envio manual de formulario al proveedor.",
        )

    try:
        documents_signatures.generate_supplier_onboarding_link(
            session,
            contract_id=contract.id,
            tenant_id=tenant_id,
            user=user,
            supplier_tax_id=contract.supplier_tax_id,
            supplier_email=contract.supplier_email,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(
            "No se pudo generar enlace onboarding proveedor contract_id=%s: %s",
            contract.id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se pudo enviar el enlace al proveedor. Revisa NIF/CIF y email.",
        )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    contract.status = ContractStatus.PENDING_SUPPLIER
    cd_clear = dict(contract.comparative_data or {})
    cd_clear.pop("needs_supplier_form_after_approval", None)
    now_iso = datetime.now(timezone.utc).isoformat()
    if not cd_clear.get("supplier_form_sent_at"):
        cd_clear["supplier_form_sent_at"] = now_iso
    cd_clear["supplier_form_last_sent_at"] = now_iso
    cd_clear["supplier_form_sent_count"] = int(cd_clear.get("supplier_form_sent_count") or 0) + 1
    contract.comparative_data = cd_clear
    contract.updated_at = datetime.now(timezone.utc)
    _flag_modified(contract, "comparative_data")
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="comparative.supplier_form_sent_after_approval",
    )
    return contract


def _resolve_comparative_branch(
    session: Session, user: User
) -> ContractDepartment:
    """Devuelve la rama (OBRA o GERENCIA) que corresponde al usuario aprobador.

    Resuelve siempre por EmployeeProfile -> Position -> Department.name,
    independientemente de si el usuario es tenant_admin o super_admin: un
    aprobador puede ostentar ese rol y al mismo tiempo ocupar un puesto en
    Obra (p.ej. Director Técnico). El puesto real del empleado manda.

    Fallback: GERENCIA si no hay EmployeeProfile/Position/Department
    resolvible para el usuario.
    """
    if user.tenant_id is not None:
        row = session.exec(
            select(Department.name)
            .join(Position, Position.department_id == Department.id)
            .join(EmployeeProfile, EmployeeProfile.position_id == Position.id)
            .where(
                EmployeeProfile.user_id == user.id,
                EmployeeProfile.tenant_id == user.tenant_id,
                EmployeeProfile.is_active.is_(True),
            )
        ).first()
        name = (row or "").strip().lower() if isinstance(row, str) else (
            (row[0] if row else "") or ""
        ).strip().lower()
        if name == "obra":
            return ContractDepartment.OBRA
    return ContractDepartment.GERENCIA


def _ensure_user_can_manage_comparative(
    session: Session,
    *,
    contract: Contract,
    tenant_id: int,
    user: User,
) -> None:
    if can_view_all_comparatives(session, user) or can_view_all_contracts(session, user):
        return
    branch = _resolve_comparative_branch(session, user)
    if branch == ContractDepartment.GERENCIA:
        return

    subordinado_user_ids = contract_crud._get_jo_subordinado_user_ids(
        session,
        current_user=user,
        tenant_id=tenant_id,
    )
    if contract.created_by_id in subordinado_user_ids:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Sin permisos sobre este comparativo.",
    )


def _current_comparative_cycle(session: Session, contract: Contract) -> int:
    """Devuelve el numero de ciclo activo de aprobacion de comparativo.

    Si no existe ninguna fila previa, devuelve 1.
    """
    max_cycle = session.exec(
        select(ContractApproval.cycle_number).where(
            ContractApproval.tenant_id == contract.tenant_id,
            ContractApproval.contract_id == contract.id,
            ContractApproval.scope == ApprovalScope.COMPARATIVE.value,
        ).order_by(ContractApproval.cycle_number.desc())
    ).first()
    return int(max_cycle) if max_cycle else 1


def _comparative_branches_status(
    session: Session, contract: Contract
) -> dict[ContractDepartment, ApprovalStatus]:
    """Estado de las ramas Obra/Gerencia en el ciclo activo (no histórico)."""
    current_cycle = _current_comparative_cycle(session, contract)
    rows = session.exec(
        select(ContractApproval).where(
            ContractApproval.tenant_id == contract.tenant_id,
            ContractApproval.contract_id == contract.id,
            ContractApproval.scope == ApprovalScope.COMPARATIVE.value,
            ContractApproval.cycle_number == current_cycle,
        )
    ).all()
    result: dict[ContractDepartment, ApprovalStatus] = {}
    for row in rows:
        # approver_role guarda el value (str) del enum ContractDepartment para
        # approvals de scope=COMPARATIVE. Reconvertimos a enum para que el
        # mapa siga indexado por ContractDepartment.
        try:
            key = ContractDepartment(row.approver_role)
        except ValueError:
            continue
        result[key] = row.status
    return result


def _open_new_comparative_cycle(session: Session, contract: Contract) -> int:
    """Inicia un nuevo ciclo de aprobacion de comparativo conservando el historial.

    Si no hay ramas previas, devuelve 1 sin crear nada.
    Si hay ramas previas, devuelve max(cycle)+1 e inserta filas PENDING para
    OBRA y GERENCIA del nuevo ciclo. Esto garantiza que `_upsert_approval` opere
    sobre el ciclo correcto al decidir (busca por max cycle existente), y que el
    frontend pueda detectar el ciclo activo sin heuristicas.
    """
    existing = session.exec(
        select(ContractApproval.cycle_number).where(
            ContractApproval.tenant_id == contract.tenant_id,
            ContractApproval.contract_id == contract.id,
            ContractApproval.scope == ApprovalScope.COMPARATIVE.value,
        ).order_by(ContractApproval.cycle_number.desc())
    ).first()
    if not existing:
        return 1
    new_cycle = int(existing) + 1
    for department in (ContractDepartment.OBRA, ContractDepartment.GERENCIA):
        session.add(
            ContractApproval(
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                scope=ApprovalScope.COMPARATIVE,
                approver_role=department.value,
                status=ApprovalStatus.PENDING,
                cycle_number=new_cycle,
            )
        )
    session.flush()
    return new_cycle


def approve_comparative(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: Optional[str],
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not (can_approve_comparative(session, user) or can_approve_contract(session, user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.comparative_status not in _MGMT_PENDING_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comparativo no está pendiente de aprobación de gerencia.",
        )

    if not can_approve_comparative(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Gerencia y Director Técnico pueden aprobar el comparativo.",
        )

    _ensure_user_can_manage_comparative(
        session,
        contract=contract,
        tenant_id=tenant_id,
        user=user,
    )
    branch = _resolve_comparative_branch(session, user)
    try:
        contract_crud._upsert_approval(
            session,
            contract=contract,
            department=branch,
            status=ApprovalStatus.APPROVED,
            decided_by_id=user.id,
            comment=comment,
            scope=ApprovalScope.COMPARATIVE,
        )
    except Exception as exc:
        session.rollback()
        logger.exception(
            "Fallo registrando approval comparativo contract_id=%s branch=%s: %s",
            contract.id,
            branch.value,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo registrar la aprobación del comparativo.",
        ) from exc

    branches = _comparative_branches_status(session, contract)
    obra_status = branches.get(ContractDepartment.OBRA)
    gerencia_status = branches.get(ContractDepartment.GERENCIA)
    both_approved = (
        obra_status == ApprovalStatus.APPROVED
        and gerencia_status == ApprovalStatus.APPROVED
    )
    logger.info(
        "approve_comparative contract_id=%s decided_branch=%s obra=%s gerencia=%s both_approved=%s",
        contract.id,
        branch.value,
        obra_status,
        gerencia_status,
        both_approved,
    )

    contract.updated_at = datetime.now(timezone.utc)
    if both_approved:
        contract.comparative_status = ComparativeStatus.APPROVED
        contract.approved_at = contract.updated_at
    else:
        # Mantener pendiente de la otra rama
        contract.comparative_status = ComparativeStatus.PENDING_MGMT_APPROVAL
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="comparative.approved" if both_approved else "comparative.partial_approved",
        payload={"branch": branch.value, "both_approved": both_approved},
    )

    # Notificar al creador en cada aprobación parcial, indicando quién aprobó.
    approver_label = "Director Técnico" if branch == ContractDepartment.OBRA else "Gerencia"
    send_contract_notification(
        session,
        event=ContractNotificationEvent.COMPARATIVE_APPROVED,
        contract=contract,
        recipients=[],
        department_label=approver_label,
    )

    if not both_approved:
        return contract

    # Si el proveedor figura en REA pero no esta en BD local, mandar
    # automaticamente el formulario de onboarding al proveedor en cuanto
    # se aprueba el comparativo. Best-effort: no romper la aprobacion si
    # falla el envio del email.
    cd_post = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}
    from sqlalchemy.orm.attributes import flag_modified as _flag_modified

    # Revalidamos el estado actual del proveedor en BD: el flag
    # `needs_supplier_form_after_approval` se grabó en submit_comparative y
    # puede haber quedado obsoleto si el proveedor (o un usuario) completó
    # los datos entre el submit y la aprobación. Si ya está todo en BD, no
    # tiene sentido pedir el formulario ni marcar PENDING_SUPPLIER.
    if cd_post.get("needs_supplier_form_after_approval"):
        supplier_now = _resolve_supplier_in_db(
            session, contract=contract, tenant_id=tenant_id
        )
        if not _supplier_form_required(contract=contract, supplier=supplier_now):
            cd_clear = dict(contract.comparative_data or {})
            cd_clear.pop("needs_supplier_form_after_approval", None)
            contract.comparative_data = cd_clear
            _flag_modified(contract, "comparative_data")
            session.add(contract)
            session.commit()
            session.refresh(contract)
            cd_post = contract.comparative_data if isinstance(contract.comparative_data, dict) else {}

    if cd_post.get("needs_supplier_form_after_approval"):
        from app.domains.procurement.documents import signatures as documents_signatures

        try:
            documents_signatures.generate_supplier_onboarding_link(
                session,
                contract_id=contract.id,
                tenant_id=tenant_id,
                user=user,
                supplier_tax_id=contract.supplier_tax_id,
                supplier_email=contract.supplier_email,
            )
            contract = contract_crud._get_contract_or_404(session, contract.id, tenant_id)
            contract.status = ContractStatus.PENDING_SUPPLIER
            cd_clear = dict(contract.comparative_data or {})
            cd_clear.pop("needs_supplier_form_after_approval", None)
            cd_clear["supplier_form_sent_at"] = datetime.now(timezone.utc).isoformat()
            contract.comparative_data = cd_clear
            contract.updated_at = datetime.now(timezone.utc)
            _flag_modified(contract, "comparative_data")
            session.add(contract)
            session.commit()
            session.refresh(contract)
            contract_crud._log_event(
                session,
                tenant_id=tenant_id,
                contract_id=contract.id,
                user_id=user.id,
                event_type="comparative.supplier_form_sent_after_approval",
            )
        except Exception as exc:
            logger.warning(
                "No se pudo auto-enviar formulario proveedor tras aprobacion contract_id=%s: %s",
                contract.id,
                exc,
            )
            is_db_error = isinstance(exc, (IntegrityError, SQLAlchemyError))
            # Aunque falle el envio del email, NO permitimos avanzar a fases
            # de generacion de contrato hasta que el proveedor complete los
            # datos. Forzamos PENDING_SUPPLIER y mantenemos el flag activo
            # para que el jefe de obra pueda reintentar el envio manual.
            try:
                contract = contract_crud._get_contract_or_404(session, contract.id, tenant_id)
                contract.status = ContractStatus.PENDING_SUPPLIER
                contract.updated_at = datetime.now(timezone.utc)
                session.add(contract)
                session.commit()
                session.refresh(contract)
            except Exception:
                session.rollback()
            # Si el fallo fue de base de datos (transitorio), encolamos un
            # reintento automatico 1 hora despues. Otros errores (email,
            # datos del proveedor incompletos) requieren accion manual.
            if is_db_error:
                try:
                    from app.workers.tasks.contracts import (
                        retry_send_supplier_form_after_approval,
                    )

                    retry_send_supplier_form_after_approval.apply_async(
                        kwargs={
                            "contract_id": contract.id,
                            "tenant_id": tenant_id,
                            "user_id": user.id,
                        },
                        countdown=3600,
                    )
                except Exception as schedule_exc:  # noqa: BLE001
                    logger.warning(
                        "No se pudo programar reintento de envio formulario proveedor contract_id=%s: %s",
                        contract.id,
                        schedule_exc,
                    )

    # Tras aprobar totalmente el comparativo, el contrato debe quedar ya
    # generado para la cola administrativa, sin paso manual de "activación".
    # Si el proveedor requiere onboarding, ese flujo ya lo habrá dejado en
    # PENDING_SUPPLIER y no avanzamos más hasta que complete datos.
    try:
        from app.domains.procurement.contracts.workflow_service import (
            auto_progress_after_comparative_approval,
        )

        contract = auto_progress_after_comparative_approval(
            session,
            contract=contract,
        )
        session.refresh(contract)
    except Exception as exc:  # noqa: BLE001
        session.rollback()
        logger.warning(
            "auto_progress_after_comparative_approval fallo contract_id=%s: %s",
            contract.id,
            exc,
        )

    return contract


def reject_comparative(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    reason: str,
) -> Contract:
    ensure_tenant_access(user, tenant_id)
    if not can_reject_contract(session, user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    if not reason or not reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El motivo de rechazo es obligatorio.",
        )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.comparative_status not in _MGMT_PENDING_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comparativo no está pendiente de aprobación de gerencia.",
        )

    if not can_reject_comparative(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para rechazar el comparativo.",
        )

    _ensure_user_can_manage_comparative(
        session,
        contract=contract,
        tenant_id=tenant_id,
        user=user,
    )
    branch = _resolve_comparative_branch(session, user)
    # Registramos el rechazo de la rama para auditoria antes de limpiarlo
    # en el reinicio del ciclo.
    try:
        contract_crud._upsert_approval(
            session,
            contract=contract,
            department=branch,
            status=ApprovalStatus.REJECTED,
            decided_by_id=user.id,
            comment=reason,
            scope=ApprovalScope.COMPARATIVE,
        )
    except Exception as exc:
        session.rollback()
        logger.warning(
            "No se pudo registrar contract_approval para comparative.rejected contract_id=%s: %s",
            contract.id,
            exc,
        )

    data = contract.comparative_data or {}
    data["rejected_reason"] = reason
    data["rejected_at"] = datetime.now(timezone.utc).isoformat()
    data["rejected_by_id"] = user.id
    data["rejected_branch"] = branch.value
    contract.comparative_data = data
    # Rechazo retrocede el comparativo a NEEDS_CHANGES. Las ramas del ciclo
    # actual (incluido el REJECTED recien registrado) se conservan como
    # historial. Un nuevo ciclo se abrira al reenviar (submit_comparative).
    contract.comparative_status = ComparativeStatus.NEEDS_CHANGES
    contract.updated_at = datetime.now(timezone.utc)
    current_cycle = _current_comparative_cycle(session, contract)
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="comparative.rejected",
        payload={"reason": reason, "cycle_number": current_cycle},
    )

    recipients = get_department_recipients(session, tenant_id)
    send_contract_notification(
        session,
        event=ContractNotificationEvent.COMPARATIVE_REJECTED,
        contract=contract,
        recipients=recipients.get("jefe_obra", []),
    )

    return contract


def return_comparative(
    session: Session,
    *,
    contract_id: int,
    tenant_id: int,
    user: User,
    comment: str,
) -> Contract:
    """Gerencia devuelve el comparativo al creador para que lo modifique (NEEDS_CHANGES)."""
    ensure_tenant_access(user, tenant_id)
    if not (can_approve_comparative(session, user) or can_approve_contract(session, user)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")

    if not comment or not comment.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El comentario es obligatorio al devolver el comparativo.",
        )

    if not can_approve_comparative(session, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo Gerencia y Director Técnico pueden devolver el comparativo.",
        )

    contract = contract_crud._get_contract_or_404(session, contract_id, tenant_id)
    if contract.comparative_status not in _MGMT_PENDING_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Solo se puede devolver un comparativo pendiente de aprobación de gerencia.",
        )

    data = contract.comparative_data or {}
    data["return_comment"] = comment.strip()
    data["returned_at"] = datetime.now(timezone.utc).isoformat()
    data["returned_by_id"] = user.id
    contract.comparative_data = data
    contract.comparative_status = ComparativeStatus.NEEDS_CHANGES
    contract.updated_at = datetime.now(timezone.utc)
    # Registrar la devolucion en la rama del aprobador como decision REJECTED
    # con prefijo [Devolucion] para distinguirla de un rechazo definitivo.
    # Asi el ciclo queda cerrado en el historial.
    branch = _resolve_comparative_branch(session, user)
    try:
        contract_crud._upsert_approval(
            session,
            contract=contract,
            department=branch,
            status=ApprovalStatus.REJECTED,
            decided_by_id=user.id,
            comment=f"[Devolución] {comment.strip()}",
            scope=ApprovalScope.COMPARATIVE,
        )
    except Exception as exc:
        session.rollback()
        logger.warning(
            "No se pudo registrar contract_approval para comparative.returned contract_id=%s: %s",
            contract.id,
            exc,
        )
    session.add(contract)
    session.commit()
    session.refresh(contract)

    contract_crud._log_event(
        session,
        tenant_id=tenant_id,
        contract_id=contract.id,
        user_id=user.id,
        event_type="comparative.returned",
        payload={"comment": comment},
    )

    branch = _resolve_comparative_branch(session, user)
    approver_label = "Director Técnico" if branch == ContractDepartment.OBRA else "Gerencia"
    send_contract_notification(
        session,
        event=ContractNotificationEvent.COMPARATIVE_REJECTED,
        contract=contract,
        recipients=[],
        department_label=approver_label,
    )

    return contract


# ─────────────────────────────────────────────────────────────────────────────
# Auto-aprobación de comparativos pendientes (job programado).
# ─────────────────────────────────────────────────────────────────────────────


def auto_approve_stale_comparatives(
    *,
    session: Session,
    grace_days: int,
    batch_size: int = 200,
    tenant_id: Optional[int] = None,
) -> dict[str, int]:
    """Auto-aprueba comparativos PENDING_MGMT_APPROVAL con más de `grace_days` días desde submit.

    Si se pasa `tenant_id`, restringe el barrido a ese tenant. Sin `tenant_id`
    el job opera sobre todos los tenants (uso histórico desde el scheduler global).

    Devuelve resumen con cuántos se aprobaron y cuántos quedaron pendientes.
    """
    from datetime import timedelta

    now_ts = datetime.now(timezone.utc)
    cutoff = now_ts - timedelta(days=grace_days)

    stmt = (
        select(Contract)
        .where(Contract.comparative_status == ComparativeStatus.PENDING_MGMT_APPROVAL)
        .where(Contract.submitted_at.is_not(None))
        .where(Contract.submitted_at < cutoff)
    )
    if tenant_id is not None:
        stmt = stmt.where(Contract.tenant_id == tenant_id)
    stmt = stmt.limit(batch_size)
    contracts = session.exec(stmt).all()

    approved = 0
    errors = 0
    for contract in contracts:
        for dept in (ContractDepartment.OBRA, ContractDepartment.GERENCIA):
            try:
                contract_crud._upsert_approval(
                    session,
                    contract=contract,
                    department=dept,
                    status=ApprovalStatus.APPROVED,
                    decided_by_id=None,
                    comment="Aprobación automática tras 3 días sin decisión.",
                    scope=ApprovalScope.COMPARATIVE,
                )
            except Exception:
                logger.exception(
                    "auto_approve_stale_comparatives: fallo upsert_approval contract_id=%s dept=%s",
                    contract.id,
                    dept.value,
                )

        contract.comparative_status = ComparativeStatus.APPROVED
        contract.approved_at = now_ts
        contract.updated_at = now_ts
        comparative_data = dict(contract.comparative_data or {})
        comparative_data["auto_approved"] = True
        comparative_data["auto_approved_at"] = now_ts.isoformat()
        contract.comparative_data = comparative_data

        try:
            session.add(contract)
            session.commit()
            session.refresh(contract)
        except Exception:
            session.rollback()
            errors += 1
            logger.exception(
                "auto_approve_stale_comparatives: commit fallo contract_id=%s",
                contract.id,
            )
            continue

        try:
            contract_crud._log_event(
                session,
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                user_id=None,
                event_type="comparative.auto_approved",
            )
        except Exception:
            logger.exception(
                "auto_approve_stale_comparatives: log_event fallo contract_id=%s",
                contract.id,
            )

        try:
            recipients = get_department_recipients(session, contract.tenant_id)
            send_contract_notification(
                session,
                event=ContractNotificationEvent.COMPARATIVE_AUTO_APPROVED,
                contract=contract,
                recipients=recipients.get("jefe_obra", []),
            )
        except Exception:
            logger.exception(
                "auto_approve_stale_comparatives: notificación fallo contract_id=%s",
                contract.id,
            )

        approved += 1

    return {"approved": approved, "errors": errors, "scanned": len(contracts)}
