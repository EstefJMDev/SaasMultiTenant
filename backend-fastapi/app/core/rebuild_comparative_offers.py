from __future__ import annotations

import argparse
import copy
from typing import Iterable, Optional

from sqlmodel import Session, select

import app.db.base  # noqa: F401 - ensure models are registered
from app.ai.client import OllamaClient
from app.ai.errors import AIInvalidResponseError, AIUnavailableError
from app.platform.contracts_core.models import Contract, ContractOffer
from app.domains.invoices.ocr.service import (
    extract_and_apply_offer_data,
    merge_comparative_data,
)
from app.domains.procurement.comparatives.analytics import (
    auto_repair_comparative_lines_if_needed,
    reconcile_comparative_offers_with_db,
)
from app.db.session import engine


def _iter_contracts(
    session: Session,
    *,
    contract_id: Optional[int],
    tenant_id: Optional[int],
) -> Iterable[Contract]:
    statement = select(Contract)
    if contract_id is not None:
        statement = statement.where(Contract.id == contract_id)
    if tenant_id is not None:
        statement = statement.where(Contract.tenant_id == tenant_id)
    statement = statement.order_by(Contract.id.asc())
    return session.exec(statement).all()


def _offer_needs_reextract(offer: ContractOffer, *, force: bool) -> bool:
    if force:
        return True
    if offer.total_amount is None:
        return True
    try:
        if float(offer.total_amount) <= 1:
            return True
    except (TypeError, ValueError):
        return True
    meta = offer.extraction_meta if isinstance(offer.extraction_meta, dict) else {}
    status = str(meta.get("status") or "").lower()
    if status in {"", "failed", "partial"}:
        return True
    if not bool(meta.get("comparative_detected")):
        return True
    totals = meta.get("comparative_totales") if isinstance(meta.get("comparative_totales"), dict) else {}
    comparative_total = totals.get("total_ofertado_proveedor") if isinstance(totals, dict) else None
    if comparative_total is None:
        return True
    try:
        return float(comparative_total) <= 1
    except (TypeError, ValueError):
        return True


def _valid_total_amount(offer: ContractOffer) -> bool:
    if offer.total_amount is None:
        return False
    try:
        return float(offer.total_amount) > 1
    except (TypeError, ValueError):
        return False


def _find_historical_offer_by_filename(
    session: Session,
    *,
    tenant_id: int,
    contract_id: int,
    filename: str,
) -> Optional[ContractOffer]:
    stmt = (
        select(ContractOffer)
        .where(
            ContractOffer.tenant_id == tenant_id,
            ContractOffer.original_filename == filename,
            ContractOffer.contract_id != contract_id,
        )
        .order_by(ContractOffer.created_at.desc(), ContractOffer.id.desc())
    )
    candidates = list(session.exec(stmt).all())
    if not candidates:
        return None

    def score(offer: ContractOffer) -> tuple[int, int, int, int]:
        # Prioridad:
        # 1) total válido (>1)
        # 2) texto extraído disponible (permite reconstruir líneas)
        # 3) raw_json disponible
        # 4) id más reciente
        has_text = 1 if (offer.extracted_text and len(offer.extracted_text.strip()) > 50) else 0
        has_raw = 1 if isinstance(offer.extraction_raw_json, dict) and len(offer.extraction_raw_json) > 0 else 0
        return (
            1 if _valid_total_amount(offer) else 0,
            has_text,
            has_raw,
            int(offer.id or 0),
        )

    return max(candidates, key=score)


def _hydrate_legacy_offers_for_contract(session: Session, *, contract: Contract) -> int:
    existing_stmt = select(ContractOffer).where(
        ContractOffer.tenant_id == contract.tenant_id,
        ContractOffer.contract_id == contract.id,
    )
    existing = list(session.exec(existing_stmt).all())
    if existing:
        return 0

    offers_in_data = (contract.comparative_data or {}).get("offers") or []
    if not isinstance(offers_in_data, list):
        return 0

    created = 0
    for item in offers_in_data:
        if not isinstance(item, dict):
            continue
        filename = item.get("file")
        if not filename:
            continue
        historical = _find_historical_offer_by_filename(
            session,
            tenant_id=contract.tenant_id,
            contract_id=contract.id,
            filename=str(filename),
        )
        if not historical:
            continue

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
        session.refresh(cloned)
        created += 1

    return created


def _rebuild_comparative_from_offer_text(*, contract: Contract, offer: ContractOffer) -> bool:
    text = (offer.extracted_text or "").strip()
    if len(text) < 100:
        return False
    try:
        client = OllamaClient()
        comparative_json = client.comparative_text_to_json(text)
    except (AIUnavailableError, AIInvalidResponseError):
        return False
    if not isinstance(comparative_json, dict):
        return False

    previous = contract.comparative_data or {}
    snapshot = copy.deepcopy(previous)
    merged = merge_comparative_data(previous, comparative_json)
    if merged == snapshot:
        return False
    # Fuerza dirty tracking de JSONB asignando un objeto nuevo.
    contract.comparative_data = copy.deepcopy(merged)
    return True


def run(
    *,
    contract_id: Optional[int],
    tenant_id: Optional[int],
    reextract_failed: bool,
    force_reextract: bool,
    hydrate_legacy: bool,
) -> int:
    reconciled = 0
    repaired_lines = 0
    reextracted = 0
    hydrated = 0
    errors = 0

    with Session(engine) as session:
        contracts = list(
            _iter_contracts(
                session,
                contract_id=contract_id,
                tenant_id=tenant_id,
            )
        )

        if not contracts:
            print("No se encontraron contratos para los filtros indicados.")
            return 0

        for contract in contracts:
            print(f"[Contrato {contract.id}] tenant={contract.tenant_id}")

            if hydrate_legacy:
                try:
                    hydrated_count = _hydrate_legacy_offers_for_contract(session, contract=contract)
                    hydrated += hydrated_count
                    if hydrated_count:
                        print(f"  - ofertas legacy hidratadas: {hydrated_count}")
                except Exception as exc:  # pragma: no cover
                    session.rollback()
                    errors += 1
                    print(f"  - error hidratando ofertas legacy -> {exc}")

            if reextract_failed:
                offers_stmt = (
                    select(ContractOffer)
                    .where(
                        ContractOffer.tenant_id == contract.tenant_id,
                        ContractOffer.contract_id == contract.id,
                    )
                    .order_by(ContractOffer.id.asc())
                )
                offers = list(session.exec(offers_stmt).all())
                for offer in offers:
                    if not _offer_needs_reextract(offer, force=force_reextract):
                        continue
                    try:
                        extract_and_apply_offer_data(session=session, offer=offer)
                        session.refresh(offer)
                        reextracted += 1
                        print(
                            f"  - Oferta {offer.id}: extraida "
                            f"(importe={offer.total_amount}, moneda={offer.currency})"
                        )
                        if _rebuild_comparative_from_offer_text(contract=contract, offer=offer):
                            session.add(contract)
                            session.commit()
                            session.refresh(contract)
                            print(f"  - Oferta {offer.id}: líneas comparativas reconstruidas desde texto")
                    except Exception as exc:  # pragma: no cover
                        errors += 1
                        print(f"  - Oferta {offer.id}: error al extraer -> {exc}")

            try:
                if auto_repair_comparative_lines_if_needed(session, contract=contract):
                    session.commit()
                    session.refresh(contract)
                    repaired_lines += 1
                    lines_count = len((contract.comparative_data or {}).get("lines") or [])
                    print(f"  - lineas reparadas automaticamente (lines={lines_count})")

                changed = reconcile_comparative_offers_with_db(session, contract=contract)
                if changed:
                    session.commit()
                    session.refresh(contract)
                    reconciled += 1
                    offers_count = len((contract.comparative_data or {}).get("offers") or [])
                    print(f"  - comparative_data reconciliado (offers={offers_count})")
                else:
                    print("  - sin cambios en comparative_data")
            except Exception as exc:  # pragma: no cover
                session.rollback()
                errors += 1
                print(f"  - error reconciliando contrato -> {exc}")

    print(
        "Resumen: "
        f"contratos_reconciliados={reconciled}, "
        f"contratos_lineas_reparadas={repaired_lines}, "
        f"ofertas_hidratadas={hydrated}, "
        f"ofertas_reextraidas={reextracted}, "
        f"errores={errors}"
    )
    return 1 if errors else 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Reconstruye comparative_data.offers desde contract_offer y, "
            "opcionalmente, reintenta extraccion OCR/IA."
        )
    )
    parser.add_argument("--contract-id", type=int, default=None, help="Reparar solo un contrato.")
    parser.add_argument("--tenant-id", type=int, default=None, help="Reparar solo un tenant.")
    parser.add_argument(
        "--reextract-failed",
        action="store_true",
        help="Reintenta extraccion en ofertas sin importe o con estado failed/partial.",
    )
    parser.add_argument(
        "--force-reextract",
        action="store_true",
        help="Fuerza extraccion en todas las ofertas del alcance (requiere --reextract-failed).",
    )
    parser.add_argument(
        "--hydrate-legacy",
        action="store_true",
        help=(
            "Si un contrato no tiene contract_offer pero sí comparative_data.offers, "
            "clona ofertas históricas por filename y las vuelve a extraer."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.force_reextract and not args.reextract_failed:
        raise SystemExit("--force-reextract requiere --reextract-failed")
    code = run(
        contract_id=args.contract_id,
        tenant_id=args.tenant_id,
        reextract_failed=args.reextract_failed,
        force_reextract=args.force_reextract,
        hydrate_legacy=args.hydrate_legacy,
    )
    raise SystemExit(code)


if __name__ == "__main__":
    main()

