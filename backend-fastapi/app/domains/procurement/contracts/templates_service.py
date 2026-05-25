"""
Servicio de gestión de plantillas de contrato.

Soporta .docx y .pdf. Extrae variables con formato [NOMBRE_VARIABLE].
"""
from __future__ import annotations

import importlib
import io
import re
import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session, select

from app.core.config import settings
from app.platform.contracts_core.models import ContractTemplate, ContractSubtype


ALLOWED_TEMPLATE_EXTENSIONS = {"docx", "pdf"}
MAX_TEMPLATE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB
_VAR_RE = re.compile(r"\[([A-Z][A-Z0-9_]*)\]")


# ── Variable extraction ────────────────────────────────────────────────────────

def _extract_variables_from_docx(data: bytes) -> list[str]:
    docx = importlib.import_module("docx")
    doc = docx.Document(io.BytesIO(data))
    found: set[str] = set()
    for para in doc.paragraphs:
        found.update(_VAR_RE.findall(para.text))
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in cell.paragraphs:
                    found.update(_VAR_RE.findall(para.text))
    return sorted(found)


def _extract_variables_from_pdf(data: bytes) -> list[str]:
    pdfplumber = importlib.import_module("pdfplumber")
    found: set[str] = set()
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            found.update(_VAR_RE.findall(text))
    return sorted(found)


def extract_template_variables(data: bytes, file_format: str) -> list[str]:
    try:
        if file_format == "docx":
            return _extract_variables_from_docx(data)
        if file_format == "pdf":
            return _extract_variables_from_pdf(data)
    except Exception:
        pass
    return []


# ── Storage ────────────────────────────────────────────────────────────────────

def _template_storage_path(tenant_id: int, filename: str) -> Path:
    base = Path(settings.contracts_storage_path)
    return base / f"tenant_{tenant_id}" / "templates" / filename


def _save_template_file(tenant_id: int, data: bytes, extension: str) -> Path:
    unique_name = f"{uuid.uuid4().hex}.{extension}"
    path = _template_storage_path(tenant_id, unique_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


# ── Service functions ──────────────────────────────────────────────────────────

def upload_template(
    session: Session,
    *,
    tenant_id: int,
    created_by_id: Optional[int],
    name: str,
    subtype: ContractSubtype,
    file_data: bytes,
    original_filename: str,
) -> ContractTemplate:
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else ""
    if ext not in ALLOWED_TEMPLATE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato no soportado: {ext}. Use .docx o .pdf",
        )
    if len(file_data) > MAX_TEMPLATE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Archivo demasiado grande (máximo 20 MB)",
        )

    path = _save_template_file(tenant_id, file_data, ext)
    if ext == "docx":
        # Word a veces guarda los tokens [VAR] dentro de Structured Document
        # Tags. python-docx no expone su contenido, asi que los desenvolvemos
        # antes de extraer variables (operacion idempotente).
        from app.core.db_bootstrap.seeds_contracts import (
            _unwrap_sdt_content_in_docx,
        )

        _unwrap_sdt_content_in_docx(path)
        file_data = path.read_bytes()
    variables = extract_template_variables(file_data, ext)

    template = ContractTemplate(
        tenant_id=tenant_id,
        created_by_id=created_by_id,
        name=name.strip(),
        subtype=subtype.value,
        file_path=str(path),
        original_filename=original_filename,
        file_format=ext,
        variables=variables,
        is_active=True,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


def list_templates(
    session: Session,
    *,
    tenant_id: int,
    subtype: Optional[ContractSubtype] = None,
    active_only: bool = True,
) -> list[ContractTemplate]:
    q = select(ContractTemplate).where(ContractTemplate.tenant_id == tenant_id)
    if active_only:
        q = q.where(ContractTemplate.is_active.is_(True))
    if subtype is not None:
        q = q.where(ContractTemplate.subtype == subtype.value)
    return list(session.exec(q.order_by(ContractTemplate.created_at.desc())).all())


def get_template_or_404(
    session: Session,
    *,
    tenant_id: int,
    template_id: int,
) -> ContractTemplate:
    tpl = session.exec(
        select(ContractTemplate).where(
            ContractTemplate.id == template_id,
            ContractTemplate.tenant_id == tenant_id,
        )
    ).first()
    if not tpl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plantilla no encontrada")
    return tpl


def deactivate_template(
    session: Session,
    *,
    tenant_id: int,
    template_id: int,
) -> ContractTemplate:
    tpl = get_template_or_404(session, tenant_id=tenant_id, template_id=template_id)
    tpl.is_active = False
    session.add(tpl)
    session.commit()
    session.refresh(tpl)
    return tpl
