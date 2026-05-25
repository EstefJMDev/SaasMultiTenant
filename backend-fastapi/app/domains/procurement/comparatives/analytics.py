from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session, select

from app.ai.client import _looks_like_bad_supplier_name, _looks_like_customer
from app.platform.contracts_core.models import Contract, ContractOffer
from app.domains.invoices.ocr import service as ocr_service


logger = logging.getLogger("app.procurement.comparatives.analytics")


def offer_to_comparative_entry(offer: ContractOffer) -> dict:
    def _as_valid_amount(value: object) -> Optional[float]:
        try:
            amount = float(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        return amount if amount > 1 else None

    supplier_name = offer.supplier_name.strip() if offer.supplier_name else None
    if supplier_name and _looks_like_bad_supplier_name(supplier_name, None):
        supplier_name = None
    normalized_offer_name = (
        supplier_name
        or ocr_service.supplier_name_from_filename(offer.original_filename)
        or offer.original_filename
    )
    display_supplier_name = supplier_name or normalized_offer_name

    effective_total_amount = _as_valid_amount(offer.total_amount)
    if effective_total_amount is None and isinstance(offer.extraction_raw_json, dict):
        effective_total_amount = _as_valid_amount(offer.extraction_raw_json.get("total_amount"))
    if effective_total_amount is None and isinstance(offer.extraction_meta, dict):
        comparative_totals = offer.extraction_meta.get("comparative_totales") or {}
        if isinstance(comparative_totals, dict):
            effective_total_amount = _as_valid_amount(comparative_totals.get("total_ofertado_proveedor"))

    missing: list[str] = []
    if not supplier_name:
        missing.append("supplier_name")
    if not offer.supplier_tax_id:
        missing.append("supplier_tax_id")
    if effective_total_amount is None:
        missing.append("total_amount")
    if not offer.currency:
        missing.append("currency")

    status = None
    comparative_totales: dict = {}
    if isinstance(offer.extraction_meta, dict):
        status = offer.extraction_meta.get("status")
        comparative_totales = offer.extraction_meta.get("comparative_totales") or {}
        if not isinstance(comparative_totales, dict):
            comparative_totales = {}

    return {
        "id": offer.id,
        "offer_name": normalized_offer_name,
        "supplier_name": display_supplier_name,
        "supplier_tax_id": offer.supplier_tax_id,
        "supplier_email": offer.supplier_email,
        "supplier_phone": offer.supplier_phone,
        "total_amount": effective_total_amount,
        "currency": offer.currency,
        "plazo": comparative_totales.get("plazos"),
        "garantia": comparative_totales.get("garantias"),
        "pago": comparative_totales.get("forma_pago"),
        "notes": offer.notes,
        "file": offer.original_filename,
        "ocr_status": status,
        "pending_fields": missing,
    }


def reconcile_comparative_offers_with_db(session: Session, *, contract: Contract) -> bool:
    try:
        statement = (
            select(ContractOffer)
            .where(
                ContractOffer.tenant_id == contract.tenant_id,
                ContractOffer.contract_id == contract.id,
            )
            .order_by(ContractOffer.created_at.asc(), ContractOffer.id.asc())
        )
        db_offers = list(session.exec(statement).all())
        data = dict(contract.comparative_data or {})
        previous_offers = list(data.get("offers") or [])
        previous_by_id = {
            item.get("id"): item for item in previous_offers if isinstance(item, dict) and item.get("id") is not None
        }
        previous_by_file = {
            item.get("file"): item for item in previous_offers if isinstance(item, dict) and item.get("file")
        }
    except Exception as exc:
        logger.exception(
            "Error reconciliando ofertas contract_id=%s: %s",
            contract.id,
            exc,
        )
        contract.comparative_data = {"offers": [], "lines": []}
        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)
        session.commit()
        return False

    rebuilt_offers = []
    seen_offer_keys: set[str] = set()
    if db_offers:
        for offer in db_offers:
            dedupe_key = f"{(offer.original_filename or '').strip().lower()}|{(offer.file_path or '').strip().lower()}"
            if dedupe_key in seen_offer_keys:
                continue
            seen_offer_keys.add(dedupe_key)
            entry = offer_to_comparative_entry(offer)
            existing = previous_by_id.get(offer.id) or previous_by_file.get(offer.original_filename)
            if existing:
                for field in ("plazo", "garantia", "pago"):
                    if not entry.get(field) and existing.get(field):
                        entry[field] = existing.get(field)
            rebuilt_offers.append(entry)
    else:
        # Fallback para contratos legacy donde solo se guardaron filenames en comparative_data.
        for item in previous_offers:
            if not isinstance(item, dict):
                continue
            filename = item.get("file")
            if not filename:
                rebuilt_offers.append(item)
                continue

            hist_stmt = (
                select(ContractOffer)
                .where(
                    ContractOffer.tenant_id == contract.tenant_id,
                    ContractOffer.original_filename == filename,
                )
                .order_by(
                    ContractOffer.created_at.desc(),
                    ContractOffer.id.desc(),
                )
            )
            historical_candidates = list(session.exec(hist_stmt).all())
            historical = next(
                (
                    candidate
                    for candidate in historical_candidates
                    if candidate.total_amount is not None and float(candidate.total_amount) > 1
                ),
                historical_candidates[0] if historical_candidates else None,
            )
            if not historical:
                rebuilt_offers.append(item)
                continue

            entry = offer_to_comparative_entry(historical)
            entry["id"] = item.get("id")
            entry["file"] = filename
            item_supplier_name = item.get("supplier_name")
            if (
                item_supplier_name
                and not _looks_like_customer(item_supplier_name)
                and not _looks_like_bad_supplier_name(item_supplier_name, None)
            ):
                entry["supplier_name"] = item_supplier_name
            if item.get("supplier_tax_id"):
                entry["supplier_tax_id"] = item.get("supplier_tax_id")
            if item.get("plazo"):
                entry["plazo"] = item.get("plazo")
            if item.get("garantia"):
                entry["garantia"] = item.get("garantia")
            if item.get("pago"):
                entry["pago"] = item.get("pago")
            rebuilt_offers.append(entry)

    if rebuilt_offers == previous_offers:
        return False

    data["offers"] = rebuilt_offers
    if contract.selected_offer_id:
        data["selected_offer_id"] = contract.selected_offer_id
    contract.comparative_data = data
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    return True


def auto_repair_comparative_lines_if_needed(session: Session, *, contract: Contract) -> bool:
    def _offer_has_valid_total(candidate: ContractOffer) -> bool:
        if candidate.total_amount is None:
            return False
        try:
            return float(candidate.total_amount) > 1
        except (TypeError, ValueError):
            return False

    def _hydrate_legacy_offers() -> int:
        offers_data = (contract.comparative_data or {}).get("offers") or []
        if not isinstance(offers_data, list):
            return 0

        created = 0
        for item in offers_data:
            if not isinstance(item, dict):
                continue
            filename = item.get("file")
            if not filename:
                continue
            stmt = (
                select(ContractOffer)
                .where(
                    ContractOffer.tenant_id == contract.tenant_id,
                    ContractOffer.original_filename == str(filename),
                    ContractOffer.contract_id != contract.id,
                )
                .order_by(ContractOffer.created_at.desc(), ContractOffer.id.desc())
            )
            historical_candidates = list(session.exec(stmt).all())
            if not historical_candidates:
                continue

            historical = next(
                (candidate for candidate in historical_candidates if _offer_has_valid_total(candidate)),
                historical_candidates[0],
            )
            cloned = ContractOffer(
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                created_by_id=contract.created_by_id,
                supplier_name=historical.supplier_name,
                supplier_tax_id=historical.supplier_tax_id,
                supplier_email=historical.supplier_email,
                supplier_phone=historical.supplier_phone,
                total_amount=historical.total_amount,
                currency=historical.currency,
                notes=historical.notes,
                file_path=historical.file_path,
                original_filename=historical.original_filename,
                extracted_text=historical.extracted_text,
                extraction_raw_json=historical.extraction_raw_json,
                extraction_meta=historical.extraction_meta,
            )
            session.add(cloned)
            session.commit()
            created += 1
        return created


    if _comparative_has_meaningful_lines(contract):
        return False

    data = dict(contract.comparative_data or {})
    offers_in_data = data.get("offers")
    if not isinstance(offers_in_data, list) or not offers_in_data:
        return False

    now = datetime.now(timezone.utc)

    statement = (
        select(ContractOffer)
        .where(
            ContractOffer.tenant_id == contract.tenant_id,
            ContractOffer.contract_id == contract.id,
        )
        .order_by(ContractOffer.id.asc())
    )
    offers = list(session.exec(statement).all())
    if not offers:
        hydrated = _hydrate_legacy_offers()
        if hydrated > 0:
            offers = list(session.exec(statement).all())
        if not offers:
            return False

    contract.comparative_data = data
    contract.updated_at = now
    session.add(contract)
    session.commit()
    session.refresh(contract)

    changed = False
    for offer in offers:
        try:
            ocr_service.extract_and_apply_offer_data(session=session, offer=offer)
            changed = True
        except Exception:
            continue

    refreshed = session.get(Contract, contract.id)
    if refreshed is None:
        return changed
    contract.comparative_data = refreshed.comparative_data
    contract.updated_at = refreshed.updated_at

    if reconcile_comparative_offers_with_db(session, contract=contract):
        session.commit()
        session.refresh(contract)
        changed = True

    return changed


def _comparative_has_meaningful_lines(contract: Contract) -> bool:
    data = contract.comparative_data or {}
    lines = data.get("lines")
    if not isinstance(lines, list) or not lines:
        return False

    for line in lines:
        if not isinstance(line, dict):
            continue
        prices = line.get("prices")
        if not isinstance(prices, list):
            continue
        for price in prices:
            if not isinstance(price, dict):
                continue
            has_price = price.get("precio_unitario") not in (None, "")
            has_amount = price.get("importe") not in (None, "")
            if has_price or has_amount:
                return True
    return False

