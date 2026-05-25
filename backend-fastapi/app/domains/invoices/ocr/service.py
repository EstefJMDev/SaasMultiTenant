from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlmodel import Session

from app.ai.client import (
    OllamaClient,
    build_extraction_meta,
    _looks_like_bad_supplier_name,
    _looks_like_customer,
    _find_supplier_name_in_header,
)
from app.ai.errors import AIInvalidResponseError, AIUnavailableError
from app.platform.contracts_core.models import Contract, ContractOffer, ContractType, Supplier
from app.core.config import settings
from app.domains.invoices.ocr import extract, parse, repo


logger = logging.getLogger("app.domains.invoices.ocr")

__all__ = [
    "lookup_supplier",
    "get_provider_by_tax_id",
    "get_provider_by_tax_id_and_type",
    "get_provider_by_name_and_type",
    "build_supplier_from_provider",
    "image_bytes_from_pil",
    "ocr_image_tiled",
    "ocr_image_tesseract",
    "ocr_image_with_fallback",
    "ocr_pdf_high",
    "ocr_pdf_header",
    "ocr_pdf_strict",
    "ocr_image",
    "extract_text_from_pdf",
    "ocr_pdf_to_text",
    "parse_invoice_fields",
    "find_first_email",
    "find_first_phone",
    "find_spanish_tax_id",
    "parse_amount_token",
    "extract_total_amount_fallback",
    "extract_supplier_name_fallback",
    "supplier_name_from_filename",
    "provider_name_from_comparative",
    "clean_description",
    "extract_comparative_fallback",
    "attach_provider_to_comparative",
    "looks_like_comparative_text",
    "has_comparative_lines",
    "parse_spanish_address",
    "merge_comparative_data",
    "extract_offer_from_file",
    "extract_and_apply_offer_data",
]


# ------------------------------
# Suppliers/Providers
# ------------------------------

def lookup_supplier(
    session: Session,
    *,
    tenant_id: int,
    tax_id: str,
    contract_type: Optional[ContractType] = None,
) -> Optional[Supplier]:
    if contract_type is not None:
        provider = repo._get_provider_by_tax_id_and_type(
            session,
            tax_id=tax_id,
            contract_type=contract_type,
        )
        if provider:
            return repo._build_supplier_from_provider(tenant_id=tenant_id, provider=provider)

    supplier = repo.find_supplier_by_tax_id(session, tenant_id=tenant_id, tax_id=tax_id)
    if supplier:
        return supplier

    # Fallback: si con el tipo actual no aparece, busca en todas las fuentes.
    # Esto evita falsos "no encontrado" cuando el proveedor está en la otra tabla.
    if contract_type is not None:
        provider_any = repo._get_provider_by_tax_id_and_type(
            session,
            tax_id=tax_id,
            contract_type=None,
        )
        if provider_any:
            return repo._build_supplier_from_provider(tenant_id=tenant_id, provider=provider_any)

    provider = repo._get_provider_by_tax_id_and_type(
        session,
        tax_id=tax_id,
        contract_type=contract_type,
    )
    if not provider:
        return None
    return repo._build_supplier_from_provider(tenant_id=tenant_id, provider=provider)


def get_provider_by_tax_id(session: Session, *, tax_id: Optional[str]) -> Optional[dict]:
    return _get_provider_by_tax_id(session, tax_id=tax_id)


def get_provider_by_tax_id_and_type(
    session: Session,
    *,
    tax_id: Optional[str],
    contract_type: Optional[ContractType],
) -> Optional[dict]:
    return _get_provider_by_tax_id_and_type(
        session,
        tax_id=tax_id,
        contract_type=contract_type,
    )


def get_provider_by_name_and_type(
    session: Session,
    *,
    name: Optional[str],
    contract_type: Optional[ContractType],
) -> Optional[dict]:
    return _get_provider_by_name_and_type(
        session,
        name=name,
        contract_type=contract_type,
    )


def build_supplier_from_provider(*, tenant_id: int, provider: dict) -> Supplier:
    return _build_supplier_from_provider(tenant_id=tenant_id, provider=provider)


# ------------------------------
# OCR (image/pdf)
# ------------------------------
def image_bytes_from_pil(image: extract.Image.Image) -> bytes:
    return _image_bytes_from_pil(image)


def ocr_image_tiled(
    image: extract.Image.Image,
    client: OllamaClient,
    *,
    timeout_seconds: Optional[float] = None,
) -> str:
    return _ocr_image_tiled(image, client, timeout_seconds=timeout_seconds)


def ocr_image_tesseract(image: extract.Image.Image) -> str:
    return _ocr_image_tesseract(image)


def ocr_image_with_fallback(
    image: extract.Image.Image,
    client: OllamaClient,
    *,
    timeout_seconds: Optional[float] = None,
) -> str:
    return _ocr_image_with_fallback(image, client, timeout_seconds=timeout_seconds)


def ocr_pdf_high(path: str, client: OllamaClient) -> str:
    return _ocr_pdf_high(path, client)


def ocr_pdf_header(
    path: str,
    client: OllamaClient,
    dpi: int = 400,
    timeout_seconds: Optional[float] = None,
) -> str:
    return _ocr_pdf_header(path, client, dpi=dpi, timeout_seconds=timeout_seconds)


def ocr_pdf_strict(
    path: str,
    client: OllamaClient,
    *,
    dpi: int = 300,
    max_pages: int = 2,
    timeout_seconds: Optional[float] = None,
) -> str:
    return _ocr_pdf_strict(
        path,
        client,
        dpi=dpi,
        max_pages=max_pages,
        timeout_seconds=timeout_seconds,
    )


def ocr_image(path: str, client: OllamaClient, timeout_seconds: Optional[float] = None) -> str:
    return _ocr_image(path, client, timeout_seconds=timeout_seconds)


# ------------------------------
# Parsers (email/phone/tax_id/amount/address)
# ------------------------------
def find_first_email(text: str) -> Optional[str]:
    return _find_first_email(text)


def find_first_phone(text: str) -> Optional[str]:
    return _find_first_phone(text)


def find_spanish_tax_id(text: str) -> Optional[str]:
    return _find_spanish_tax_id(text)


def parse_amount_token(raw: Optional[str]) -> Optional[float]:
    return _parse_amount_token(raw)


def extract_total_amount_fallback(text: str) -> Optional[float]:
    return _extract_total_amount_fallback(text)


def extract_supplier_name_fallback(text: str) -> Optional[str]:
    return _extract_supplier_name_fallback(text)


def supplier_name_from_filename(filename: Optional[str]) -> Optional[str]:
    return _supplier_name_from_filename(filename)


def provider_name_from_comparative(payload: Optional[dict]) -> Optional[str]:
    return _provider_name_from_comparative(payload)


def clean_description(value: Optional[str]) -> Optional[str]:
    return _clean_description(value)


def extract_comparative_fallback(text: str) -> dict:
    return _extract_comparative_fallback(text)


def attach_provider_to_comparative(payload: dict, provider_name: Optional[str]) -> dict:
    return _attach_provider_to_comparative(payload, provider_name)


def looks_like_comparative_text(text: str) -> bool:
    return _looks_like_comparative_text(text)


def has_comparative_lines(payload: Optional[dict]) -> bool:
    return _has_comparative_lines(payload)


def parse_spanish_address(raw: Optional[str]) -> dict:
    return _parse_spanish_address(raw)


# ------------------------------
# Comparative helpers
# ------------------------------
def extract_offer_from_file(path: str) -> dict:
    return _extract_offer_from_file(path)


def _get_provider_by_tax_id(session: Session, *, tax_id: Optional[str]) -> Optional[dict]:
    return repo._get_provider_by_tax_id(session, tax_id=tax_id)


def _get_provider_by_tax_id_and_type(
    session: Session,
    *,
    tax_id: Optional[str],
    contract_type: Optional[ContractType],
) -> Optional[dict]:
    return repo._get_provider_by_tax_id_and_type(
        session,
        tax_id=tax_id,
        contract_type=contract_type,
    )


def _get_provider_by_name_and_type(
    session: Session,
    *,
    name: Optional[str],
    contract_type: Optional[ContractType],
) -> Optional[dict]:
    return repo._get_provider_by_name_and_type(
        session,
        name=name,
        contract_type=contract_type,
    )


def _build_supplier_from_provider(*, tenant_id: int, provider: dict) -> Supplier:
    return repo._build_supplier_from_provider(tenant_id=tenant_id, provider=provider)


def _image_bytes_from_pil(image: extract.Image.Image) -> bytes:
    return extract._image_bytes_from_pil(image)


def _ocr_image_tiled(
    image: extract.Image.Image,
    client: OllamaClient,
    *,
    timeout_seconds: Optional[float] = None,
) -> str:
    return extract._ocr_image_tiled(image, client, timeout_seconds=timeout_seconds)


def _ocr_image_tesseract(image: extract.Image.Image) -> str:
    return extract._ocr_image_tesseract(image)


def _ocr_image_with_fallback(
    image: extract.Image.Image,
    client: OllamaClient,
    *,
    timeout_seconds: Optional[float] = None,
) -> str:
    return extract._ocr_image_with_fallback(image, client, timeout_seconds=timeout_seconds)


def extract_text_from_pdf(path: str) -> str:
    return extract._extract_text_from_pdf(path)


def _extract_text_pdf(path: str) -> str:
    return extract._extract_text_pdf(path)


def ocr_pdf_to_text(
    path: str,
    client: OllamaClient,
    dpi: int = 200,
    max_pages: Optional[int] = None,
    timeout_seconds: Optional[float] = None,
) -> str:
    return extract._ocr_pdf(
        path,
        client,
        dpi=dpi,
        max_pages=max_pages,
        timeout_seconds=timeout_seconds,
    )


def _ocr_pdf_high(path: str, client: OllamaClient) -> str:
    return extract._ocr_pdf_high(path, client)


def _ocr_pdf_header(
    path: str,
    client: OllamaClient,
    dpi: int = 400,
    timeout_seconds: Optional[float] = None,
) -> str:
    return extract._ocr_pdf_header(path, client, dpi=dpi, timeout_seconds=timeout_seconds)


def _ocr_pdf_strict(
    path: str,
    client: OllamaClient,
    *,
    dpi: int = 300,
    max_pages: int = 2,
    timeout_seconds: Optional[float] = None,
) -> str:
    return extract._ocr_pdf_strict(
        path,
        client,
        dpi=dpi,
        max_pages=max_pages,
        timeout_seconds=timeout_seconds,
    )


def _ocr_image(path: str, client: OllamaClient, timeout_seconds: Optional[float] = None) -> str:
    return extract._ocr_image(path, client, timeout_seconds=timeout_seconds)


def _find_first_email(text: str) -> Optional[str]:
    return parse._find_first_email(text)


def _find_first_phone(text: str) -> Optional[str]:
    return parse._find_first_phone(text)


def _find_spanish_tax_id(text: str) -> Optional[str]:
    return parse._find_spanish_tax_id(text)


def _parse_amount_token(raw: Optional[str]) -> Optional[float]:
    return parse._parse_amount_token(raw)


def _extract_total_amount_fallback(text: str) -> Optional[float]:
    return parse._extract_total_amount_fallback(text)


def _extract_supplier_name_fallback(text: str) -> Optional[str]:
    return parse._extract_supplier_name_fallback(text)


def _supplier_name_from_filename(filename: Optional[str]) -> Optional[str]:
    return parse._supplier_name_from_filename(filename)


def _provider_name_from_comparative(payload: Optional[dict]) -> Optional[str]:
    return parse._provider_name_from_comparative(payload)


def parse_invoice_fields(text: str) -> dict:
    return parse._extract_invoice_fallback(text)


def _clean_description(value: Optional[str]) -> Optional[str]:
    return parse._clean_description(value)


def _extract_comparative_fallback(text: str) -> dict:
    return parse._extract_comparative_fallback(text)


def _attach_provider_to_comparative(payload: dict, provider_name: Optional[str]) -> dict:
    return parse._attach_provider_to_comparative(payload, provider_name)


def _looks_like_comparative_text(text: str) -> bool:
    return parse._looks_like_comparative_text(text)


def _has_comparative_lines(payload: Optional[dict]) -> bool:
    return parse._has_comparative_lines(payload)


def merge_comparative_data(existing: Optional[dict], incoming: dict) -> dict:
    return parse._merge_comparative_data(existing, incoming)


def _parse_spanish_address(raw: Optional[str]) -> dict:
    return parse._parse_spanish_address(raw)



def _extract_offer_from_file(path: str) -> dict:
    client = OllamaClient()
    path_lower = path.lower()
    is_image = path_lower.endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp"))
    looks_comparative = False
    comparative_ocr_timeout = min(60, max(10, int(settings.ollama_comparative_ocr_timeout_seconds)))
    comparative_json_timeout = min(60, max(10, int(settings.ollama_comparative_json_timeout_seconds)))
    comparative_max_pages = min(2, max(1, int(settings.ollama_comparative_ocr_max_pages)))
    logger.info("OCR/Comparativo: inicio path=%s is_image=%s", path, is_image)
    if is_image:
        text = extract._ocr_image(
            path,
            client,
            timeout_seconds=comparative_ocr_timeout,
        )
    else:
        text = extract._extract_text_from_pdf(path)
        logger.info("OCR/Comparativo: texto PDF path=%s chars=%s", path, len(text))
        looks_comparative = parse._looks_like_comparative_text(text)
        text_total = parse._extract_total_amount_fallback(text)
        strict_mode = (
            settings.ollama_comparative_strict_mode
            and looks_comparative
            and (text_total is None or text_total <= 1)
        )
        should_try_ocr = len(text) < 40
        if not should_try_ocr and looks_comparative:
            preview = parse._extract_comparative_fallback(text)
            should_try_ocr = not parse._has_comparative_lines(preview)
        if strict_mode:
            should_try_ocr = True
        if should_try_ocr:
            try:
                logger.info("OCR/Comparativo: OCR adicional path=%s strict=%s", path, strict_mode)
                if strict_mode:
                    ocr_text = extract._ocr_pdf_strict(
                        path,
                        client,
                        dpi=max(200, int(settings.ollama_comparative_ocr_dpi)),
                        max_pages=comparative_max_pages,
                        timeout_seconds=comparative_ocr_timeout,
                    )
                else:
                    ocr_text = extract._ocr_pdf(
                        path,
                        client,
                        max_pages=comparative_max_pages,
                        timeout_seconds=comparative_ocr_timeout,
                    )
                if ocr_text:
                    text = f"{text}\n{ocr_text}".strip() if text else ocr_text
            except (AIUnavailableError, AIInvalidResponseError):
                logger.exception("OCR/Comparativo: error OCR path=%s", path)
                text = text or ""
    looks_comparative = parse._looks_like_comparative_text(text)
    logger.info(
        "OCR/Comparativo: texto extraído length=%s preview=%s",
        len(text or ""),
        (text or "")[:500],
    )

    # En contratos/comparativos NO llamamos al parser de factura del LLM porque
    # introduce timeouts largos y bloqueos. Usamos fallback rápido local.
    raw_json = parse._extract_invoice_fallback(text)
    try:
        logger.info(
            "OCR/Comparativo: JSON raw=%s",
            json.dumps(raw_json, indent=2, ensure_ascii=False, default=str)[:1000],
        )
    except Exception:
        logger.info("OCR/Comparativo: JSON raw no serializable")
    normalized = raw_json or parse._extract_invoice_fallback(text)
    comparative_fallback = parse._extract_comparative_fallback(text)
    comparative_json = comparative_fallback
    fallback_totales = comparative_fallback.get("totales") if isinstance(comparative_fallback, dict) else {}
    fallback_total = (
        fallback_totales.get("total_ofertado_proveedor")
        if isinstance(fallback_totales, dict)
        else None
    )
    should_try_comparative_llm = (
        looks_comparative
        and (
            settings.ollama_comparative_force_llm
            or not parse._has_comparative_lines(comparative_json)
            or fallback_total in (None, 0, 0.0)
        )
    )
    if should_try_comparative_llm:
        try:
            llm_comparative = client.comparative_text_to_json(
                text,
                timeout_seconds=comparative_json_timeout,
                max_retries=1,
            )
            if isinstance(llm_comparative, dict):
                comparative_json = parse._merge_comparative_data(llm_comparative, comparative_fallback)
        except (AIUnavailableError, AIInvalidResponseError):
            logger.exception("OCR/Comparativo: comparative_text_to_json falló path=%s", path)
    if isinstance(comparative_json, dict):
        comparative_json = parse._attach_provider_to_comparative(
            comparative_json,
            normalized.get("supplier_name") or parse._supplier_name_from_filename(Path(path).name),
        )

    if not is_image:
        supplier_name = normalized.get("supplier_name")
        is_bad_supplier = _looks_like_customer(supplier_name) or _looks_like_bad_supplier_name(
            supplier_name,
            normalized.get("invoice_number"),
        )
        if is_bad_supplier:
            header_guess = _find_supplier_name_in_header(text)
            if header_guess and not _looks_like_bad_supplier_name(header_guess, normalized.get("invoice_number")):
                normalized["supplier_name"] = header_guess
            else:
                normalized["supplier_name"] = None

    normalized["supplier_email"] = parse._find_first_email(text)
    normalized["supplier_phone"] = parse._find_first_phone(text)
    if not normalized.get("supplier_tax_id"):
        normalized["supplier_tax_id"] = parse._find_spanish_tax_id(text)
    logger.info(
        "OCR/Comparativo: fin path=%s comparative=%s total=%s",
        path,
        bool(comparative_json),
        normalized.get("total_amount"),
    )

    return {
        "text": text,
        "raw_json": raw_json,
        "normalized": normalized,
        "comparative": comparative_json,
    }


def extract_and_apply_offer_data(*, session: Session, offer: ContractOffer) -> None:
    _extract_and_apply_offer_data(session=session, offer=offer)


def _extract_and_apply_offer_data(*, session: Session, offer: ContractOffer) -> None:
    if not offer.file_path:
        return

    try:
        logger.info(
            "OCR/Comparativo: oferta=%s contrato=%s archivo=%s",
            offer.id,
            offer.contract_id,
            offer.file_path,
        )
        extraction = _extract_offer_from_file(offer.file_path)
        normalized = extraction["normalized"] or {}
        comparative_json = extraction.get("comparative")
        offer.extracted_text = extraction.get("text")
        offer.extraction_raw_json = extraction.get("raw_json")
        meta = build_extraction_meta()
        meta["status"] = "success"
        meta["finished_at"] = datetime.now(timezone.utc).isoformat()
        if comparative_json:
            meta["comparative_detected"] = True
            totales = comparative_json.get("totales") if isinstance(comparative_json, dict) else {}
            if isinstance(totales, dict):
                meta["comparative_totales"] = {
                    "total_ofertado_proveedor": totales.get("total_ofertado_proveedor"),
                    "forma_pago": totales.get("forma_pago"),
                    "garantias": totales.get("garantias"),
                    "plazos": totales.get("plazos"),
                }
        offer.extraction_meta = meta

        normalized_supplier_name = normalized.get("supplier_name")
        if normalized_supplier_name and _looks_like_bad_supplier_name(
            normalized_supplier_name,
            normalized.get("invoice_number"),
        ):
            normalized_supplier_name = None
        if not offer.supplier_name and normalized_supplier_name:
            offer.supplier_name = normalized_supplier_name
        if not offer.supplier_name:
            offer.supplier_name = parse._supplier_name_from_filename(offer.original_filename)
        provider_name_for_offer = (
            offer.supplier_name
            or parse._provider_name_from_comparative(comparative_json)
            or parse._supplier_name_from_filename(offer.original_filename)
        )
        if not offer.supplier_tax_id and normalized.get("supplier_tax_id"):
            offer.supplier_tax_id = normalized.get("supplier_tax_id")
        if not offer.supplier_email and normalized.get("supplier_email"):
            offer.supplier_email = normalized.get("supplier_email")
        if not offer.supplier_phone and normalized.get("supplier_phone"):
            offer.supplier_phone = normalized.get("supplier_phone")
        if hasattr(offer, "supplier_address") and not offer.supplier_address and normalized.get("supplier_address"):
            offer.supplier_address = normalized.get("supplier_address")
        if hasattr(offer, "supplier_city") and not offer.supplier_city and normalized.get("supplier_city"):
            offer.supplier_city = normalized.get("supplier_city")
        if hasattr(offer, "supplier_postal_code") and not offer.supplier_postal_code and normalized.get("supplier_postal_code"):
            offer.supplier_postal_code = normalized.get("supplier_postal_code")
        if hasattr(offer, "supplier_country") and not offer.supplier_country and normalized.get("supplier_country"):
            offer.supplier_country = normalized.get("supplier_country")
        normalized_total_amount = normalized.get("total_amount")
        if normalized_total_amount is not None and normalized_total_amount > 0:
            should_update_total = offer.total_amount is None
            if not should_update_total and offer.total_amount is not None:
                try:
                    should_update_total = float(offer.total_amount) <= 1 and normalized_total_amount > 1
                except (TypeError, ValueError):
                    should_update_total = False
            if should_update_total:
                offer.total_amount = normalized_total_amount
        raw_total_amount = None
        if isinstance(extraction.get("raw_json"), dict):
            raw_total_amount = extraction["raw_json"].get("total_amount")
        if raw_total_amount is not None:
            try:
                raw_total_amount = float(raw_total_amount)
            except (TypeError, ValueError):
                raw_total_amount = None
        if raw_total_amount is not None and raw_total_amount > 1:
            should_update_from_raw = offer.total_amount is None
            if not should_update_from_raw and offer.total_amount is not None:
                try:
                    should_update_from_raw = float(offer.total_amount) <= 1
                except (TypeError, ValueError):
                    should_update_from_raw = False
            if should_update_from_raw:
                offer.total_amount = raw_total_amount
        elif not offer.total_amount and comparative_json:
            totales = comparative_json.get("totales") if isinstance(comparative_json, dict) else {}
            if isinstance(totales, dict):
                comparative_total = parse._parse_amount_token(totales.get("total_ofertado_proveedor"))
                if comparative_total is not None and comparative_total > 0:
                    offer.total_amount = comparative_total
        if not offer.total_amount or float(offer.total_amount or 0) <= 1:
            extracted_text = extraction.get("text") or ""
            fallback_total = parse._extract_total_amount_fallback(extracted_text)
            if fallback_total is not None and fallback_total > 1:
                offer.total_amount = fallback_total
        if not offer.currency and normalized.get("currency"):
            offer.currency = normalized.get("currency")
        if not offer.currency and offer.total_amount:
            offer.currency = "EUR"

        contract_for_offer = session.get(Contract, offer.contract_id)
        if offer.supplier_tax_id:
            provider = repo._get_provider_by_tax_id_and_type(
                session,
                tax_id=offer.supplier_tax_id,
                contract_type=contract_for_offer.type if contract_for_offer else None,
            )
            if provider:
                parsed = parse._parse_spanish_address(provider.get("direccion_empresa"))
                if not offer.supplier_name:
                    offer.supplier_name = provider.get("razon_social") or provider.get("empresa")
                if not offer.supplier_email:
                    offer.supplier_email = provider.get("email_contacto")
                if not offer.supplier_phone:
                    offer.supplier_phone = provider.get("telefono_contacto")
                if normalized.get("supplier_address") is None and parsed.get("address"):
                    normalized["supplier_address"] = parsed.get("address")
                if normalized.get("supplier_city") is None and parsed.get("city"):
                    normalized["supplier_city"] = parsed.get("city")
                if normalized.get("supplier_postal_code") is None and parsed.get("postal_code"):
                    normalized["supplier_postal_code"] = parsed.get("postal_code")
                if normalized.get("supplier_country") is None and parsed.get("country"):
                    normalized["supplier_country"] = parsed.get("country")
        elif offer.supplier_name:
            provider = repo._get_provider_by_name_and_type(
                session,
                name=offer.supplier_name,
                contract_type=contract_for_offer.type if contract_for_offer else None,
            )
            if provider:
                if not offer.supplier_tax_id:
                    offer.supplier_tax_id = provider.get("cif")
                if not offer.supplier_email:
                    offer.supplier_email = provider.get("email_contacto")
                if not offer.supplier_phone:
                    offer.supplier_phone = provider.get("telefono_contacto")

        if comparative_json:
            comparative_json = parse._attach_provider_to_comparative(comparative_json, provider_name_for_offer)

        if comparative_json and contract_for_offer:
            contract_for_offer.comparative_data = parse._merge_comparative_data(
                contract_for_offer.comparative_data, comparative_json
            )
            contract_for_offer.updated_at = datetime.now(timezone.utc)
            session.add(contract_for_offer)

        session.add(offer)
        session.commit()
        session.refresh(offer)
        logger.info(
            "OCR/Comparativo: oferta=%s OK total=%s supplier=%s lines=%s",
            offer.id,
            offer.total_amount,
            offer.supplier_name,
            len(comparative_json.get("lines") or []) if isinstance(comparative_json, dict) else 0,
        )
    except (AIUnavailableError, AIInvalidResponseError) as exc:
        session.rollback()
        offer.extraction_meta = {
            "status": "failed",
            "reason": str(exc),
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        session.add(offer)
        session.commit()
        logger.exception("OCR/Comparativo: oferta=%s fallo IA: %s", offer.id, exc)
    except Exception as exc:
        session.rollback()
        offer.extraction_meta = {
            "status": "failed",
            "reason": str(exc),
            "finished_at": datetime.now(timezone.utc).isoformat(),
        }
        session.add(offer)
        session.commit()
        logger.exception("OCR/Comparativo: oferta=%s error inesperado: %s", offer.id, exc)


