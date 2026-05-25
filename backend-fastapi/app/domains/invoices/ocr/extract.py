from __future__ import annotations

import io
import logging
import subprocess
import tempfile
from typing import Optional

import pdfplumber
from pdf2image import convert_from_path
from PIL import Image
from pypdf import PdfReader

from app.ai.client import OllamaClient
from app.ai.errors import AIInvalidResponseError, AIUnavailableError
from app.core.config import settings


logger = logging.getLogger("app.domains.invoices.ocr")


def _image_bytes_from_pil(image: Image.Image) -> bytes:
    # Reducimos resolución/peso antes de enviar al OCR remoto para evitar timeouts
    # con PDFs escaneados muy grandes.
    max_side = 1800
    img = image.copy()
    width, height = img.size
    if max(width, height) > max_side:
        img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    buffer = io.BytesIO()
    if img.mode == "L":
        img.save(buffer, format="JPEG", quality=82, optimize=True)
    else:
        img.save(buffer, format="JPEG", quality=85, optimize=True)
    return buffer.getvalue()


def _ocr_image_tiled(
    image: Image.Image,
    client: OllamaClient,
    *,
    timeout_seconds: Optional[float] = None,
) -> str:
    """
    Fallback OCR por bloques para PDFs escaneados complejos.
    Reduce timeout al dividir la página en cuadrantes.
    """
    img = image.convert("L")
    width, height = img.size
    cols, rows = 2, 2
    overlap = 24
    tile_timeout = min(35, max(10, int(timeout_seconds or settings.ollama_comparative_ocr_timeout_seconds)))
    texts: list[str] = []

    for row in range(rows):
        for col in range(cols):
            x1 = max(0, int((width / cols) * col) - overlap)
            y1 = max(0, int((height / rows) * row) - overlap)
            x2 = min(width, int((width / cols) * (col + 1)) + overlap)
            y2 = min(height, int((height / rows) * (row + 1)) + overlap)
            tile = img.crop((x1, y1, x2, y2))
            try:
                tile_text = client.ocr_image_to_text(
                    _image_bytes_from_pil(tile),
                    timeout_seconds=tile_timeout,
                    max_retries=1,
                )
            except (AIUnavailableError, AIInvalidResponseError):
                continue
            if tile_text and len(tile_text.strip()) > 8:
                texts.append(tile_text.strip())
    return "\n".join(texts).strip()


def _ocr_image_tesseract(image: Image.Image) -> str:
    """
    Fallback final con Tesseract para escaneos complicados.
    Requiere binario `tesseract` en el contenedor.
    """
    img = image.convert("L")
    # Binarización suave para tablas/documentos escaneados.
    img = img.point(lambda px: 255 if px > 165 else 0)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=True) as tmp:
        img.save(tmp.name, format="PNG")
        cmd = [
            "tesseract",
            tmp.name,
            "stdout",
            "-l",
            "spa+eng",
            "--oem",
            "1",
            "--psm",
            "6",
        ]
        try:
            proc = subprocess.run(
                cmd,
                check=False,
                capture_output=True,
                text=True,
                timeout=45,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return ""
        if proc.returncode != 0:
            return ""
        return (proc.stdout or "").strip()


def _ocr_image_with_fallback(
    image: Image.Image,
    client: OllamaClient,
    *,
    timeout_seconds: Optional[float] = None,
) -> str:
    try:
        direct = client.ocr_image_to_text(
            _image_bytes_from_pil(image),
            timeout_seconds=timeout_seconds,
            max_retries=1,
        )
        if direct and direct.strip():
            return direct
        logger.warning("OCR remoto devolvio texto vacio; activando fallback por bloques")
    except (AIUnavailableError, AIInvalidResponseError):
        logger.warning("OCR/Comparativo: fallback por bloques activado")
    tiled = _ocr_image_tiled(
        image,
        client,
        timeout_seconds=timeout_seconds,
    )
    if tiled and tiled.strip():
        return tiled
    logger.warning("OCR/Comparativo: fallback Tesseract activado")
    return _ocr_image_tesseract(image)


def _ocr_embedded_pdf_images(
    path: str,
    client: OllamaClient,
    *,
    timeout_seconds: Optional[float] = None,
    max_images: int = 2,
) -> str:
    texts: list[str] = []
    try:
        reader = PdfReader(path)
    except Exception as exc:
        logger.warning("No se pudo leer PDF para fallback de imagen embebida path=%s: %s", path, exc)
        return ""

    for page in reader.pages:
        resources = page.get("/Resources")
        if not resources or "/XObject" not in resources:
            continue
        xobjects = resources["/XObject"].get_object()
        for _, ref in xobjects.items():
            if len(texts) >= max_images:
                return "\n".join(texts).strip()
            obj = ref.get_object()
            if obj.get("/Subtype") != "/Image":
                continue
            try:
                img_bytes = obj.get_data()
                with Image.open(io.BytesIO(img_bytes)) as img:
                    txt = _ocr_image_with_fallback(
                        img,
                        client,
                        timeout_seconds=timeout_seconds,
                    )
                if txt and txt.strip():
                    texts.append(txt.strip())
            except Exception as exc:
                logger.warning("Fallo OCR de imagen embebida path=%s: %s", path, exc)
                continue
    return "\n".join(texts).strip()


def _extract_text_from_pdf(path: str) -> str:
    with pdfplumber.open(path) as pdf:
        texts = [page.extract_text() or "" for page in pdf.pages]
    return "\n".join(texts).strip()


def _extract_text_pdf(path: str) -> str:
    return _extract_text_from_pdf(path)


def _ocr_pdf(
    path: str,
    client: OllamaClient,
    dpi: int = 200,
    max_pages: Optional[int] = None,
    timeout_seconds: Optional[float] = None,
) -> str:
    try:
        with pdfplumber.open(path) as pdf:
            page_count = len(pdf.pages)
    except Exception:
        page_count = 1

    limit = page_count
    if max_pages is not None and max_pages > 0:
        limit = min(page_count, max_pages)
    limit = max(1, limit)

    ocr_texts: list[str] = []
    for page_number in range(1, limit + 1):
        try:
            rendered = convert_from_path(
                path,
                dpi=dpi,
                first_page=page_number,
                last_page=page_number,
            )
        except Exception as exc:
            logger.warning(
                "OCR PDF no disponible (posible falta de poppler) path=%s page=%s: %s",
                path,
                page_number,
                exc,
            )
            break
        if not rendered:
            continue
        page = rendered[0]
        ocr_texts.append(
            _ocr_image_with_fallback(
                page,
                client,
                timeout_seconds=timeout_seconds,
            )
        )
    joined = "\n".join(ocr_texts).strip()
    if joined:
        return joined

    # Fallback: algunos PDFs son imagen escaneada embebida y el render no devuelve texto util.
    embedded = _ocr_embedded_pdf_images(
        path,
        client,
        timeout_seconds=timeout_seconds,
    )
    return embedded


def _ocr_pdf_high(path: str, client: OllamaClient) -> str:
    return _ocr_pdf(path, client, dpi=300)


def _ocr_pdf_header(
    path: str,
    client: OllamaClient,
    dpi: int = 400,
    timeout_seconds: Optional[float] = None,
) -> str:
    try:
        pages = convert_from_path(path, dpi=dpi, first_page=1, last_page=1)
    except Exception as exc:
        logger.warning(
            "OCR cabecera no disponible (posible falta de poppler) path=%s: %s",
            path,
            exc,
        )
        return ""
    if not pages:
        return ""
    page = pages[0]
    width, height = page.size
    crop_box = (0, 0, width, int(height * 0.35))
    header_img = page.crop(crop_box)
    try:
        return client.ocr_image_to_text(
            _image_bytes_from_pil(header_img),
            timeout_seconds=timeout_seconds,
            max_retries=1,
        ).strip()
    except (AIUnavailableError, AIInvalidResponseError):
        # Fallback local para no depender de Ollama en la cabecera.
        return _ocr_image_tesseract(header_img)


def _ocr_pdf_strict(
    path: str,
    client: OllamaClient,
    *,
    dpi: int = 300,
    max_pages: int = 2,
    timeout_seconds: Optional[float] = None,
) -> str:
    """
    OCR estricto para comparativos:
    - prioriza primera(s) páginas y última (totales/firmas),
    - sube DPI,
    - preprocesa en escala de grises para mejorar tablas.
    """
    pages_to_read: list[int] = []
    try:
        with pdfplumber.open(path) as pdf:
            page_count = len(pdf.pages)
    except Exception:
        page_count = 1

    if page_count <= 0:
        return ""

    # Selección de páginas relevantes: inicio + final.
    pages_to_read.append(1)
    if page_count >= 2:
        pages_to_read.append(page_count)

    # Completa hasta max_pages con páginas consecutivas.
    candidate = 2
    while len(set(pages_to_read)) < min(max_pages, page_count) and candidate <= page_count:
        pages_to_read.append(candidate)
        candidate += 1

    selected = sorted(set(pages_to_read))[: max(1, min(max_pages, page_count))]

    ocr_texts: list[str] = []
    for page_number in selected:
        try:
            rendered = convert_from_path(
                path,
                dpi=dpi,
                first_page=page_number,
                last_page=page_number,
            )
        except Exception as exc:
            logger.warning(
                "OCR strict no disponible (posible falta de poppler) path=%s page=%s: %s",
                path,
                page_number,
                exc,
            )
            continue
        if not rendered:
            continue
        img = rendered[0]
        # Preproceso simple para aumentar contraste en celdas de tabla.
        img = img.convert("L")
        try:
            text = _ocr_image_with_fallback(
                img,
                client,
                timeout_seconds=timeout_seconds,
            )
        except Exception:
            logger.exception(
                "OCR/Comparativo: fallo OCR en página strict path=%s page=%s",
                path,
                page_number,
            )
            continue
        if text:
            ocr_texts.append(text)
    return "\n".join(ocr_texts).strip()


def _ocr_image(path: str, client: OllamaClient, timeout_seconds: Optional[float] = None) -> str:
    with Image.open(path) as img:
        return _ocr_image_with_fallback(
            img,
            client,
            timeout_seconds=timeout_seconds,
        )

