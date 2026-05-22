from __future__ import annotations

from pathlib import Path

from app.core.config import settings


def build_contract_base_path(tenant_id: int, contract_id: int) -> Path:
    base = Path(settings.contracts_storage_path)
    return base / f"tenant_{tenant_id}" / f"contract_{contract_id}"


def build_contract_document_path(
    tenant_id: int,
    contract_id: int,
    doc_type: object,
    filename: str,
) -> Path:
    base = build_contract_base_path(tenant_id, contract_id)
    raw = getattr(doc_type, "value", str(doc_type))
    doc_folder = str(raw).lower().replace("contractdocumenttype.", "")
    return base / "documents" / doc_folder / filename


def ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def read_bytes(path: Path) -> bytes:
    return path.read_bytes()


def write_bytes(path: Path, data: bytes) -> None:
    ensure_parent_dir(path)
    path.write_bytes(data)


def write_bytes_from_path(target: Path, source: Path) -> None:
    write_bytes(target, read_bytes(source))


def safe_unlink(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass
