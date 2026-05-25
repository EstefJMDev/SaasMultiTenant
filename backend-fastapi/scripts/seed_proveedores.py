from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.core.db_session import engine  # noqa: E402
from app.platform.contracts_core.models import Supplier, SupplierStatus  # noqa: E402


DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d")


@dataclass
class ImportStats:
    processed: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0


def _clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_email(value: Any) -> str | None:
    cleaned = _clean(value)
    return cleaned.lower() if cleaned else None


def _normalize_tax_id(value: Any) -> str | None:
    cleaned = _clean(value)
    if not cleaned:
        return None
    normalized = re.sub(r"[^A-Za-z0-9]", "", cleaned).upper()
    return normalized or None


def _parse_int(value: Any) -> int | None:
    cleaned = _clean(value)
    if not cleaned:
        return None
    return int(cleaned)


def _parse_datetime(value: Any) -> datetime | None:
    cleaned = _clean(value)
    if not cleaned:
        return None
    for fmt in DATE_FORMATS:
        try:
            parsed = datetime.strptime(cleaned, fmt)
            return parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError as exc:
        raise ValueError(f"Formato de fecha no soportado: {cleaned}") from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _pick(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if _clean(value) is not None:
            return value
    return None


def _parse_status(value: Any, fallback: SupplierStatus) -> SupplierStatus:
    cleaned = (_clean(value) or fallback.value).upper()
    try:
        return SupplierStatus(cleaned)
    except ValueError as exc:
        raise ValueError(f"Status de proveedor no soportado: {cleaned}") from exc


def _resolve_tenant_id(row: dict[str, Any], cli_tenant_id: int | None) -> int:
    tenant_id = _parse_int(row.get("tenant_id"))
    if tenant_id is not None:
        return tenant_id
    if cli_tenant_id is not None:
        return cli_tenant_id
    raise ValueError("Cada fila necesita tenant_id o debe pasarse --tenant-id.")


def _build_payload(
    row: dict[str, Any],
    *,
    cli_tenant_id: int | None,
    cli_created_by_id: int | None,
    default_status: SupplierStatus,
) -> dict[str, Any]:
    tenant_id = _resolve_tenant_id(row, cli_tenant_id)
    tax_id = _normalize_tax_id(_pick(row, "tax_id", "cif"))
    if not tax_id:
        raise ValueError("Fila sin CIF/tax_id util.")

    payload: dict[str, Any] = {
        "tenant_id": tenant_id,
        "created_by_id": _parse_int(row.get("created_by_id")) if row.get("created_by_id") else cli_created_by_id,
        "tax_id": tax_id,
        "name": _clean(_pick(row, "name", "razon_social", "empresa")),
        "email": _normalize_email(_pick(row, "email", "email_contacto")),
        "phone": _clean(_pick(row, "phone", "telefono_contacto")),
        "address": _clean(_pick(row, "address", "direccion_empresa")),
        "city": _clean(row.get("city")),
        "postal_code": _clean(row.get("postal_code")),
        "country": _clean(row.get("country")),
        "contact_name": _clean(_pick(row, "contact_name", "nombre_gerente")),
        "bank_iban": _clean(_pick(row, "bank_iban", "iban")),
        "bank_bic": _clean(_pick(row, "bank_bic", "bic")),
        "legal_rep_name": _clean(_pick(row, "legal_rep_name", "nombre_gerente")),
        "legal_rep_dni": _clean(_pick(row, "legal_rep_dni", "nif_gerente", "dni_gerente")),
        "deed_type": _clean(_pick(row, "deed_type", "tipo_escritura")),
        "notary_name": _clean(_pick(row, "notary_name", "nombre_notario")),
        "notary_protocol": _clean(_pick(row, "notary_protocol", "numero_protocolo", "num_protocolo")),
        "status": _parse_status(row.get("status"), default_status),
    }

    deed_date = _pick(row, "deed_date", "fecha_escritura")
    if _clean(deed_date):
        payload["deed_date"] = _parse_datetime(deed_date)

    return payload


def _apply_non_empty_updates(supplier: Supplier, payload: dict[str, Any]) -> bool:
    changed = False
    for field, value in payload.items():
        if field in {"tenant_id", "tax_id"}:
            continue
        if value is None:
            continue
        if getattr(supplier, field) != value:
            setattr(supplier, field, value)
            changed = True
    return changed


def run_import(
    csv_path: Path,
    *,
    tenant_id: int | None,
    created_by_id: int | None,
    default_status: SupplierStatus,
    delimiter: str,
    dry_run: bool,
) -> ImportStats:
    stats = ImportStats()
    now = datetime.now(timezone.utc)

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        if not reader.fieldnames:
            raise ValueError("El CSV no tiene cabecera.")

        with Session(engine) as session:
            for row in reader:
                stats.processed += 1
                try:
                    payload = _build_payload(
                        row,
                        cli_tenant_id=tenant_id,
                        cli_created_by_id=created_by_id,
                        default_status=default_status,
                    )
                except Exception as exc:
                    stats.skipped += 1
                    print(f"[skip] fila {stats.processed}: {exc}")
                    continue

                existing = session.exec(
                    select(Supplier).where(
                        Supplier.tenant_id == payload["tenant_id"],
                        Supplier.tax_id == payload["tax_id"],
                    )
                ).one_or_none()

                if existing is None:
                    supplier = Supplier(**payload)
                    supplier.created_at = now
                    supplier.updated_at = now
                    session.add(supplier)
                    stats.created += 1
                    continue

                changed = _apply_non_empty_updates(existing, payload)
                if changed:
                    existing.updated_at = now
                    stats.updated += 1
                else:
                    stats.skipped += 1

            if dry_run:
                session.rollback()
            else:
                session.commit()

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Importa proveedores desde un CSV privado externo usando upsert por tenant_id + tax_id.",
    )
    parser.add_argument("--tenant-id", type=int, help="Tenant por defecto si el CSV no trae tenant_id.")
    parser.add_argument("--created-by-id", type=int, help="Usuario creador por defecto.")
    parser.add_argument(
        "--status",
        default=SupplierStatus.PENDING.value,
        choices=[status.value for status in SupplierStatus],
        help="Status por defecto para altas nuevas.",
    )
    parser.add_argument("--delimiter", default=",", help="Separador CSV. Por defecto ','.")
    parser.add_argument("--dry-run", action="store_true", help="Procesa sin persistir cambios.")
    args = parser.parse_args()

    raw_path = os.getenv("PROVEEDORES_SEED_PATH")
    if not raw_path:
        raise SystemExit("Falta la variable de entorno PROVEEDORES_SEED_PATH.")

    csv_path = Path(raw_path).expanduser().resolve()
    if not csv_path.is_file():
        raise SystemExit(f"No existe el CSV indicado en PROVEEDORES_SEED_PATH: {csv_path}")

    stats = run_import(
        csv_path,
        tenant_id=args.tenant_id,
        created_by_id=args.created_by_id,
        default_status=SupplierStatus(args.status),
        delimiter=args.delimiter,
        dry_run=args.dry_run,
    )

    mode = "dry-run" if args.dry_run else "persistido"
    print(f"Importacion {mode} desde: {csv_path}")
    print(f"Filas procesadas: {stats.processed}")
    print(f"Altas: {stats.created}")
    print(f"Actualizaciones: {stats.updated}")
    print(f"Saltadas: {stats.skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
