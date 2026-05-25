from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional

from sqlmodel import Session, select

from app.platform.contracts_core.models import Contract, ContractOffer
from app.domains.procurement.comparatives import analytics as comparatives_analytics


def ensure_comparative_offer_ids(
    session: Session,
    *,
    contract: Contract,
    fallback_user_id: int,
) -> bool:
    data = dict(contract.comparative_data or {})
    offers_data = data.get("offers")
    if not isinstance(offers_data, list):
        offers_data = []

    # Inferimos ofertas desde lineas y las fusionamos con las existentes.
    # Asi evitamos radios deshabilitados cuando hay proveedores en lineas sin entrada en offers.
    inferred_by_provider: dict[str, dict[str, Any]] = {}
    comparative_lines = data.get("lines")
    if isinstance(comparative_lines, list):
        for line in comparative_lines:
            if not isinstance(line, dict):
                continue
            prices = line.get("prices")
            if not isinstance(prices, list):
                continue
            for price in prices:
                if not isinstance(price, dict):
                    continue
                provider_name = str(price.get("proveedor") or "").strip()
                if not provider_name:
                    continue
                key = _normalize_offer_text_key(provider_name)
                if not key:
                    continue
                amount = _parse_offer_amount(price.get("importe"))
                if key not in inferred_by_provider:
                    inferred_by_provider[key] = {
                        "supplier_name": provider_name,
                        "offer_name": provider_name,
                        "file": f"{provider_name}.pdf",
                        "currency": contract.currency or "EUR",
                        "total_amount": 0.0,
                    }
                if amount is not None:
                    inferred_by_provider[key]["total_amount"] = (
                        float(inferred_by_provider[key].get("total_amount") or 0.0) + amount
                    )

    existing_keys: set[str] = set()
    for raw in offers_data:
        if not isinstance(raw, dict):
            continue
        supplier_name = _normalize_offer_text_key(
            raw.get("supplier_name") or raw.get("offer_name")
        )
        file_name = _normalize_offer_text_key(raw.get("file"))
        if supplier_name:
            existing_keys.add(supplier_name)
        if file_name:
            existing_keys.add(file_name.replace(".pdf", "").strip())

    merged_missing = False
    for key, inferred in inferred_by_provider.items():
        if key in existing_keys:
            continue
        offers_data.append(inferred)
        merged_missing = True

    if merged_missing:
        data["offers"] = offers_data
        contract.comparative_data = data
        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)

    statement = (
        select(ContractOffer)
        .where(
            ContractOffer.tenant_id == contract.tenant_id,
            ContractOffer.contract_id == contract.id,
        )
        .order_by(ContractOffer.id.asc())
    )
    db_offers = list(session.exec(statement).all())
    by_id = {offer.id: offer for offer in db_offers if offer.id is not None}
    by_key: dict[tuple[str, str, str], ContractOffer] = {}

    for offer in db_offers:
        key = (
            _normalize_tax_id(offer.supplier_tax_id) or "",
            _normalize_offer_text_key(offer.supplier_name),
            _normalize_offer_text_key(offer.original_filename),
        )
        by_key[key] = offer
        if key[2]:
            by_key[(key[0], "", key[2])] = offer
        if key[1]:
            by_key[("", key[1], "")] = offer
            by_key[("", key[1], key[2])] = offer

    changed = False
    normalized_offers: list[dict] = []
    for raw in offers_data:
        if not isinstance(raw, dict):
            continue
        entry = dict(raw)
        offer_match: Optional[ContractOffer] = None

        raw_id = entry.get("id")
        try:
            candidate_id = int(raw_id)
            if candidate_id > 0:
                offer_match = by_id.get(candidate_id)
        except (TypeError, ValueError):
            offer_match = None

        supplier_tax_id = _normalize_tax_id(entry.get("supplier_tax_id")) or ""
        supplier_name = _normalize_offer_text_key(
            entry.get("supplier_name") or entry.get("offer_name")
        )
        file_name = _normalize_offer_text_key(entry.get("file"))

        if offer_match is None:
            lookup_keys = [
                (supplier_tax_id, supplier_name, file_name),
                (supplier_tax_id, "", file_name),
                ("", supplier_name, file_name),
                ("", supplier_name, ""),
            ]
            for lookup_key in lookup_keys:
                if lookup_key in by_key:
                    offer_match = by_key[lookup_key]
                    break

        if offer_match is None:
            offer_match = ContractOffer(
                tenant_id=contract.tenant_id,
                contract_id=contract.id,
                created_by_id=fallback_user_id,
                supplier_name=(str(entry.get("supplier_name")).strip() if entry.get("supplier_name") else None),
                supplier_tax_id=_normalize_tax_id(entry.get("supplier_tax_id")),
                supplier_email=_normalize_email(entry.get("supplier_email")),
                supplier_phone=(str(entry.get("supplier_phone")).strip() if entry.get("supplier_phone") else None),
                total_amount=_parse_offer_amount(entry.get("total_amount")),
                currency=(str(entry.get("currency")).strip() if entry.get("currency") else None),
                notes=(str(entry.get("notes")).strip() if entry.get("notes") else None),
                original_filename=(str(entry.get("file")).strip() if entry.get("file") else None),
            )
            session.add(offer_match)
            session.flush()
            if offer_match.id is not None:
                by_id[offer_match.id] = offer_match
                key = (
                    _normalize_tax_id(offer_match.supplier_tax_id) or "",
                    _normalize_offer_text_key(offer_match.supplier_name),
                    _normalize_offer_text_key(offer_match.original_filename),
                )
                by_key[key] = offer_match
                if key[2]:
                    by_key[(key[0], "", key[2])] = offer_match
                if key[1]:
                    by_key[("", key[1], "")] = offer_match
                    by_key[("", key[1], key[2])] = offer_match
            changed = True

        if offer_match and offer_match.id is not None and entry.get("id") != offer_match.id:
            entry["id"] = offer_match.id
            changed = True

        normalized_offers.append(entry)

    if changed:
        data["offers"] = normalized_offers
        contract.comparative_data = data
        contract.updated_at = datetime.now(timezone.utc)
        session.add(contract)
    return changed


def sync_comparative_offers(
    session: Session,
    *,
    contract: Contract,
    offer: ContractOffer,
) -> None:
    base_data = contract.comparative_data or {}
    data = dict(base_data)
    offers = list(base_data.get("offers") or [])
    offers = [
        item
        for item in offers
        if item.get("id") != offer.id and item.get("file") != offer.original_filename
    ]
    offers.append(comparatives_analytics.offer_to_comparative_entry(offer))
    data["offers"] = offers
    if contract.selected_offer_id:
        data["selected_offer_id"] = contract.selected_offer_id
    contract.comparative_data = data
    contract.updated_at = datetime.now(timezone.utc)
    session.add(contract)
    session.commit()
    session.refresh(contract)


def _normalize_tax_id(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9]", "", str(value)).upper()
    return cleaned or None


def _normalize_offer_text_key(value: object) -> str:
    if value is None:
        return ""
    text = str(value).strip().lower()
    return re.sub(r"\s+", " ", text)


def _normalize_email(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().lower()
    return cleaned or None


def _parse_offer_amount(value: object) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        amount = float(value)  # type: ignore[arg-type]
        return amount if amount > 0 else None
    except (TypeError, ValueError):
        pass

    if isinstance(value, str):
        raw = value.strip().replace(" ", "")
        if not raw:
            return None
        normalized = raw
        if "," in normalized and "." in normalized:
            normalized = normalized.replace(".", "").replace(",", ".")
        elif "," in normalized:
            normalized = normalized.replace(",", ".")
        try:
            amount = float(normalized)
            return amount if amount > 0 else None
        except (TypeError, ValueError):
            return None
    return None

