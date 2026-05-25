from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.domains.documents.storage import build_contract_base_path, build_contract_document_path


def extract_upload_extension(original_filename: Optional[str]) -> str:
    if not original_filename or "." not in original_filename:
        return ""
    return original_filename.rsplit(".", 1)[1].lower().strip()


def ensure_upload_extension(
    original_filename: Optional[str],
    *,
    allowed_extensions: set[str],
    detail: str,
) -> str:
    ext = extract_upload_extension(original_filename)
    if not ext or ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail,
        )
    return ext


def _write_upload_with_size_limit(
    upload: UploadFile,
    target_path: Path,
    *,
    max_size_bytes: int | None = None,
) -> None:
    bytes_written = 0
    try:
        with target_path.open("wb") as f:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if max_size_bytes is not None and bytes_written > max_size_bytes:
                    f.close()
                    target_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="El archivo excede el tamano maximo permitido.",
                    )
                f.write(chunk)
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No hay permisos de escritura en el almacenamiento de facturas.",
        ) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo guardar el archivo de factura en disco.",
        ) from exc


def build_invoice_path(
    tenant_id: int,
    file_id: str,
    original_filename: Optional[str],
) -> Path:
    """Construye la ruta final del archivo en el disco compartido."""
    ext = ".pdf"
    if original_filename and "." in original_filename:
        ext = f".{original_filename.rsplit('.', 1)[1].lower()}"
    base = Path(settings.invoices_storage_path)
    return base / f"tenant_{tenant_id}" / f"{file_id}{ext}"


def save_upload_to_disk(
    upload: UploadFile,
    tenant_id: int,
    file_id: str,
    *,
    max_size_bytes: int | None = None,
) -> Path:
    """
    Guarda el fichero subido en el disco local del contenedor.
    """
    target_path = build_invoice_path(tenant_id, file_id, upload.filename)
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No hay permisos para crear carpetas de almacenamiento de facturas.",
        ) from exc

    _write_upload_with_size_limit(
        upload,
        target_path,
        max_size_bytes=max_size_bytes,
    )

    return target_path


def delete_invoice_file(file_path: str) -> None:
    """
    Elimina el archivo local si existe.
    """
    path = Path(file_path)
    try:
        if path.exists():
            path.unlink()
    except OSError:
        # No bloqueamos la operacion de negocio por fallo de borrado fisico.
        return


def build_avatar_path(user_id: int, extension: str) -> Path:
    """
    Construye la ruta final del avatar en el disco.
    """
    base = Path(settings.avatars_storage_path)
    return base / f"user_{user_id}.{extension}"


def save_avatar_to_disk(
    upload: UploadFile,
    user_id: int,
    extension: str,
    *,
    max_size_bytes: int | None = None,
) -> Path:
    """
    Guarda el avatar subido en el disco local.
    """
    target_path = build_avatar_path(user_id, extension)
    target_path.parent.mkdir(parents=True, exist_ok=True)

    _write_upload_with_size_limit(
        upload,
        target_path,
        max_size_bytes=max_size_bytes,
    )

    return target_path


def build_logo_path(tenant_id: int, extension: str) -> Path:
    """
    Construye la ruta final del logo en el disco.
    """
    base = Path(settings.logos_storage_path)
    return base / f"tenant_{tenant_id}.{extension}"


def save_logo_to_disk(
    upload: UploadFile,
    tenant_id: int,
    extension: str,
    *,
    max_size_bytes: int | None = None,
) -> Path:
    """
    Guarda el logo subido en el disco local.
    """
    target_path = build_logo_path(tenant_id, extension)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    upload.file.seek(0)

    _write_upload_with_size_limit(
        upload,
        target_path,
        max_size_bytes=max_size_bytes,
    )

    return target_path


def build_project_doc_path(project_id: int, extension: str) -> Path:
    """
    Construye la ruta final del documento del proyecto en el disco.
    """
    base = Path(settings.project_docs_storage_path)
    file_id = uuid4().hex
    return base / f"project_{project_id}_{file_id}.{extension}"


def save_project_doc_to_disk(
    upload: UploadFile,
    project_id: int,
    extension: str,
    *,
    max_size_bytes: int | None = None,
) -> Path:
    """
    Guarda un documento de proyecto en el disco local.
    """
    target_path = build_project_doc_path(project_id, extension)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    upload.file.seek(0)

    _write_upload_with_size_limit(
        upload,
        target_path,
        max_size_bytes=max_size_bytes,
    )

    return target_path


__all__ = [
    "build_invoice_path",
    "save_upload_to_disk",
    "delete_invoice_file",
    "build_avatar_path",
    "save_avatar_to_disk",
    "build_logo_path",
    "save_logo_to_disk",
    "build_project_doc_path",
    "save_project_doc_to_disk",
    "build_contract_base_path",
    "build_contract_document_path",
    "extract_upload_extension",
    "ensure_upload_extension",
    "build_contract_offer_path",
    "save_contract_offer_upload",
    "save_signed_contract_upload",
    "build_comparative_source_path",
    "save_comparative_source_bytes",
]


def build_contract_offer_path(
    tenant_id: int,
    contract_id: int,
    offer_id: int,
    original_filename: str | None,
) -> Path:
    ext = ".pdf"
    if original_filename and "." in original_filename:
        ext = f".{original_filename.rsplit('.', 1)[1].lower()}"
    base = build_contract_base_path(tenant_id, contract_id)
    return base / "offers" / f"offer_{offer_id}{ext}"


def save_contract_offer_upload(
    upload: UploadFile,
    tenant_id: int,
    contract_id: int,
    offer_id: int,
    *,
    max_size_bytes: int | None = None,
) -> Path:
    target_path = build_contract_offer_path(
        tenant_id=tenant_id,
        contract_id=contract_id,
        offer_id=offer_id,
        original_filename=upload.filename,
    )
    target_path.parent.mkdir(parents=True, exist_ok=True)

    _write_upload_with_size_limit(
        upload,
        target_path,
        max_size_bytes=max_size_bytes,
    )

    return target_path


def save_signed_contract_upload(
    upload: UploadFile,
    tenant_id: int,
    contract_id: int,
    *,
    max_size_bytes: int | None = None,
) -> Path:
    base = build_contract_base_path(tenant_id, contract_id) / "signed"
    base.mkdir(parents=True, exist_ok=True)
    # Server-generated filename to avoid client-driven collisions/overwrites.
    path = base / f"signed_{uuid4().hex}.pdf"

    _write_upload_with_size_limit(
        upload,
        path,
        max_size_bytes=max_size_bytes,
    )

    return path


def build_comparative_source_path(
    tenant_id: int,
    contract_id: int,
    original_filename: str | None,
) -> Path:
    ext = ".xlsx"
    if original_filename and "." in original_filename:
        candidate = f".{original_filename.rsplit('.', 1)[1].lower()}"
        if candidate in (".xlsx", ".xls"):
            ext = candidate
    base = build_contract_base_path(tenant_id, contract_id)
    return base / "comparative-source" / f"source{ext}"


def save_comparative_source_bytes(
    content: bytes,
    tenant_id: int,
    contract_id: int,
    original_filename: str | None,
) -> Path:
    target_path = build_comparative_source_path(
        tenant_id=tenant_id,
        contract_id=contract_id,
        original_filename=original_filename,
    )
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_bytes(content)
    return target_path
