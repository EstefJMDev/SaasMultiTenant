from __future__ import annotations

import asyncio
import base64
import io
import logging
import re
import subprocess
import tempfile
import time
from typing import Any

import httpx
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
from starlette.datastructures import Headers

from app.core.config import settings
from app.domains.invoices.ocr.extract import _ocr_image_tesseract
from app.platform.telegram.client import TelegramBotClient, get_telegram_bot_client
from app.platform.telegram.voice import VoiceClient, get_voice_client
from app.platform.telegram.image_processor import (
    TelegramImageResult,
    clean_ocr_text as _clean_ocr_text,
    score_ocr_text as _score_ocr_text,
)


logger = logging.getLogger("app.platform.telegram.service")


def _safe_str(value: Any) -> str:
    return str(value or "").strip()


def _normalize_text(value: str) -> str:
    text = value.lower().strip()
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ü": "u",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return " ".join(text.split())




class TelegramBridgeService:
    def __init__(
        self,
        bot_client: TelegramBotClient | None = None,
        voice_client: VoiceClient | None = None,
    ) -> None:
        self.bot_client = bot_client or get_telegram_bot_client()
        self.voice_client = voice_client or get_voice_client()
        self._voice_speed_by_chat: dict[int, float] = {}
        self._last_image_result_by_chat: dict[int, TelegramImageResult] = {}
        self._last_image_ts_by_chat: dict[int, float] = {}
        self._image_processing_by_chat: set[int] = set()

    async def handle_update(self, update: dict[str, Any]) -> None:
        if not self.bot_client:
            logger.warning("Telegram webhook received but TELEGRAM_BOT_TOKEN is not configured")
            return

        message = update.get("message") or update.get("edited_message")
        if not isinstance(message, dict):
            return

        chat = message.get("chat")
        if not isinstance(chat, dict):
            return

        chat_id = chat.get("id")
        if not isinstance(chat_id, int):
            return

        try:
            text = _safe_str(message.get("text"))
            if text:
                await self._handle_text_message(chat_id, message, text)
                return

            caption = _safe_str(message.get("caption"))

            # Non-image documents (PDFs, etc.) → always classify by intent
            if self._message_has_non_image_document(message):
                await self._handle_document_message(chat_id, message, caption)
                return

            # Images/photos with explicit upload intent in caption → classify
            if self._message_has_image(message) and self._has_upload_intent(caption):
                await self._handle_document_message(chat_id, message, caption)
                return

            if settings.telegram_image_enabled and self._message_has_image(message):
                await self._handle_image_message(chat_id, message)
                return

            if settings.telegram_voice_enabled and self._message_has_voice(message):
                await self._handle_voice_message(chat_id, message)
                return

            if caption:
                await self._handle_text_message(chat_id, message, caption)
        except Exception:
            logger.exception("Unhandled error while processing telegram update")
            await self._safe_send_message(
                chat_id,
                "No pude procesar tu mensaje ahora mismo. Intentalo de nuevo.",
            )

    async def _handle_text_message(self, chat_id: int, message: dict[str, Any], text: str) -> None:
        normalized = _normalize_text(text)

        if normalized in {"/start", "start"}:
            await self._safe_send_message(
                chat_id,
                "Asistente conectado. Puedes escribirme: 'dame una lista de empleados' o "
                "'dar de alta empleado ...'",
            )
            return

        if normalized in {"hola", "buenas", "buenos dias", "buenas tardes", "buenas noches"}:
            await self._safe_send_message(
                chat_id,
                "Hola. Puedes pedirme empleados, proyectos, tareas, voz o analizar una imagen.",
            )
            return

        if normalized.startswith("/voz_velocidad"):
            await self._handle_voice_speed_command(chat_id, text)
            return

        if self._looks_like_image_follow_up(normalized):
            if chat_id in self._image_processing_by_chat:
                await self._safe_send_message(
                    chat_id,
                    "Estoy procesando tu imagen. Espera unos segundos y vuelve a pedir: 'que pone'.",
                )
                return
            cached = self._last_image_result_by_chat.get(chat_id)
            if cached:
                await self._safe_send_message(chat_id, self._format_image_answer(cached, normalized))
                return
            await self._safe_send_message(
                chat_id,
                "No tengo una imagen reciente en memoria. Enviame la imagen y despues escribe 'que pone'.",
            )
            return

        await self._safe_send_chat_action(chat_id, "typing")
        result = await self._call_agent(chat_id=chat_id, message_text=text)
        reply = _safe_str(result.get("message"))
        if not reply:
            reply = "El agente no devolvio una respuesta valida. Reintentalo en unos segundos."
        await self._safe_send_message(chat_id, reply)

    async def _handle_voice_speed_command(self, chat_id: int, raw_text: str) -> None:
        parts = [part for part in raw_text.strip().split() if part]
        if len(parts) < 2:
            current = self._voice_speed_by_chat.get(chat_id, 1.0)
            await self._safe_send_message(
                chat_id,
                f"Velocidad actual de voz: {current:.2f}x. Ejemplo: /voz_velocidad 1.2",
            )
            return
        try:
            value = float(parts[1].replace(",", "."))
        except ValueError:
            await self._safe_send_message(
                chat_id,
                "Valor invalido. Usa por ejemplo /voz_velocidad 1.2",
            )
            return

        value = max(settings.telegram_local_tts_speed_min, min(settings.telegram_local_tts_speed_max, value))
        self._voice_speed_by_chat[chat_id] = value
        await self._safe_send_message(chat_id, f"Velocidad de voz actualizada a {value:.2f}x")

    async def _handle_voice_message(self, chat_id: int, message: dict[str, Any]) -> None:
        if not self.voice_client.enabled:
            await self._safe_send_message(chat_id, "El servicio de voz no esta disponible en este entorno.")
            return

        voice_obj = message.get("voice") if isinstance(message.get("voice"), dict) else message.get("audio")
        if not isinstance(voice_obj, dict):
            await self._safe_send_message(chat_id, "No pude leer el audio recibido.")
            return

        duration = int(voice_obj.get("duration") or 0)
        file_size = int(voice_obj.get("file_size") or 0)
        if duration > settings.telegram_voice_max_duration_seconds:
            await self._safe_send_message(
                chat_id,
                f"El audio supera {settings.telegram_voice_max_duration_seconds}s.",
            )
            return
        if file_size and file_size > settings.telegram_voice_max_bytes:
            await self._safe_send_message(chat_id, "El audio supera el tamano maximo permitido.")
            return

        file_id = _safe_str(voice_obj.get("file_id"))
        if not file_id:
            await self._safe_send_message(chat_id, "No pude obtener el archivo de audio.")
            return

        await self._safe_send_chat_action(chat_id, "typing")
        audio_bytes = await self._download_telegram_file(file_id)
        if not audio_bytes:
            await self._safe_send_message(chat_id, "No pude descargar el audio.")
            return

        try:
            transcribed = await self.voice_client.transcribe_audio(audio_bytes)
        except Exception:
            logger.exception("Voice transcription failed")
            await self._safe_send_message(chat_id, "No pude transcribir el audio.")
            return

        if not transcribed:
            await self._safe_send_message(chat_id, "No pude entender el audio.")
            return

        result = await self._call_agent(chat_id=chat_id, message_text=transcribed)
        reply = _safe_str(result.get("message")) or "No tengo respuesta ahora mismo."
        await self._safe_send_message(chat_id, reply)

        if not settings.telegram_voice_reply_enabled:
            return

        try:
            speed = self._voice_speed_by_chat.get(chat_id, 1.0)
            audio = await self.voice_client.synthesize_speech(reply, speed_multiplier=speed)
            await self.bot_client.send_voice(chat_id, audio, filename="reply.mp3")
        except Exception:
            logger.exception("Voice synthesis failed")

    async def _handle_image_message(self, chat_id: int, message: dict[str, Any]) -> None:
        image_bytes = await self._extract_image_bytes(message)
        if not image_bytes:
            await self._safe_send_message(chat_id, "No pude descargar la imagen enviada.")
            return
        if len(image_bytes) > settings.telegram_image_max_bytes:
            await self._safe_send_message(
                chat_id,
                f"La imagen supera el maximo permitido ({settings.telegram_image_max_bytes // (1024 * 1024)}MB).",
            )
            return

        self._image_processing_by_chat.add(chat_id)
        try:
            await self._safe_send_chat_action(chat_id, "typing")
            result = await self._analyze_image(image_bytes)
            self._last_image_result_by_chat[chat_id] = result
            self._last_image_ts_by_chat[chat_id] = time.time()
            await self._safe_send_message(chat_id, self._format_image_answer(result, ""))
        finally:
            self._image_processing_by_chat.discard(chat_id)

    # ------------------------------------------------------------------ #
    # Document upload routing (invoice / comparative / unknown)            #
    # ------------------------------------------------------------------ #

    def _message_has_non_image_document(self, message: dict[str, Any]) -> bool:
        """True if message has a non-image document (e.g. PDF)."""
        document = message.get("document")
        if isinstance(document, dict):
            mime = _safe_str(document.get("mime_type")).lower()
            return not mime.startswith("image/")
        return False

    def _has_upload_intent(self, text: str) -> bool:
        """True if caption suggests the user wants to upload/register something."""
        if not text:
            return False
        normalized = _normalize_text(text)
        keywords = ("factura", "comparativo", "oferta", "invoice", "recibo", "albaran", "sube", "subir")
        return any(k in normalized for k in keywords)

    def _is_invoice_intent(self, text: str) -> bool:
        normalized = _normalize_text(text)
        return any(k in normalized for k in ("factura", "invoice", "recibo", "albaran"))

    def _is_comparative_intent(self, text: str) -> bool:
        normalized = _normalize_text(text)
        return any(k in normalized for k in ("comparativo", "oferta", "offer"))

    def _parse_project_id_from_caption(self, text: str) -> int | None:
        if not text:
            return None
        match = re.search(r"proyecto[:\s#]*(\d+)", _normalize_text(text))
        return int(match.group(1)) if match else None

    def _parse_contract_id_from_caption(self, text: str) -> int | None:
        if not text:
            return None
        match = re.search(r"contrato[:\s#]*(\d+)", _normalize_text(text))
        return int(match.group(1)) if match else None

    async def _get_document_bytes_and_meta(
        self, message: dict[str, Any]
    ) -> tuple[bytes | None, str, str]:
        """Download any attached file. Returns (bytes, filename, mime_type)."""
        document = message.get("document")
        if isinstance(document, dict):
            file_id = _safe_str(document.get("file_id"))
            filename = _safe_str(document.get("file_name")) or "documento"
            mime_type = _safe_str(document.get("mime_type")) or "application/octet-stream"
            if file_id:
                data = await self._download_telegram_file(file_id)
                return data, filename, mime_type

        photos = message.get("photo")
        if isinstance(photos, list) and photos:
            for item in reversed(photos):
                if isinstance(item, dict):
                    file_id = _safe_str(item.get("file_id"))
                    if file_id:
                        data = await self._download_telegram_file(file_id)
                        return data, "imagen.jpg", "image/jpeg"

        return None, "", ""

    async def _handle_document_message(
        self, chat_id: int, message: dict[str, Any], caption: str
    ) -> None:
        """Classify an incoming document by intent and route to the right handler."""
        if self._is_invoice_intent(caption):
            await self._upload_file_as_invoice(chat_id, message, caption)
        elif self._is_comparative_intent(caption):
            contract_id = self._parse_contract_id_from_caption(caption)
            if contract_id is None:
                await self._safe_send_message(
                    chat_id,
                    "He recibido el documento pero necesito saber a qué contrato pertenece.\n"
                    "Reenvíalo con: comparativo contrato:15\n"
                    "(sustituye 15 por el ID real del contrato)",
                )
            else:
                await self._upload_file_as_comparative(chat_id, message, caption, contract_id)
        else:
            await self._safe_send_message(
                chat_id,
                "He recibido un archivo. Indícame a dónde corresponde añadiendo una descripción:\n\n"
                "• Factura de proyecto: factura proyecto:42\n"
                "• Oferta comparativa: comparativo contrato:15\n\n"
                "Reenvía el archivo con esa indicación en el pie de foto.",
            )

    async def _upload_file_as_invoice(
        self, chat_id: int, message: dict[str, Any], caption: str
    ) -> None:
        """Download file and register it as an invoice."""
        file_bytes, filename, mime_type = await self._get_document_bytes_and_meta(message)
        if not file_bytes:
            await self._safe_send_message(chat_id, "No pude descargar el archivo.")
            return
        if len(file_bytes) > settings.telegram_image_max_bytes:
            await self._safe_send_message(
                chat_id,
                f"El archivo supera el tamaño máximo ({settings.telegram_image_max_bytes // (1024 * 1024)} MB).",
            )
            return

        await self._safe_send_chat_action(chat_id, "upload_document")
        await self._safe_send_message(chat_id, "Subiendo factura al sistema...")

        project_id = self._parse_project_id_from_caption(caption)

        try:
            import io as _io
            from fastapi import UploadFile
            from app.db.session import get_session
            from app.domains.invoices.service import create_invoice_with_upload
            from app.workers.tasks.invoices import extract_invoice as _extract_invoice_task

            upload = UploadFile(
                file=_io.BytesIO(file_bytes),
                filename=filename,
                headers=Headers({"content-type": mime_type}),
            )
            gen = get_session()
            session = next(gen)
            try:
                invoice = create_invoice_with_upload(
                    session=session,
                    tenant_id=settings.telegram_default_tenant_id,
                    created_by_id=settings.telegram_default_user_id,
                    upload=upload,
                    project_id=project_id,
                )
                invoice_id = int(invoice.id)
            finally:
                gen.close()

            _extract_invoice_task.delay(invoice_id)

            parts = ["Factura registrada.", f"ID: {invoice_id}", f"Archivo: {filename}"]
            if project_id:
                parts.append(f"Proyecto: {project_id}")
            else:
                parts.append("Sin proyecto asignado. Puedes asociarla desde la plataforma.")
            parts.append(f"OCR en proceso. Consulta: 'datos factura {invoice_id}'")
            await self._safe_send_message(chat_id, "\n".join(parts))

        except Exception:
            logger.exception("Invoice upload failed for chat %s", chat_id)
            await self._safe_send_message(
                chat_id,
                "Error al registrar la factura. El archivo debe ser PDF, JPG, PNG o WEBP.",
            )

    async def _upload_file_as_comparative(
        self, chat_id: int, message: dict[str, Any], caption: str, contract_id: int
    ) -> None:
        """Download file and register it as a comparative offer on a contract."""
        file_bytes, filename, mime_type = await self._get_document_bytes_and_meta(message)
        if not file_bytes:
            await self._safe_send_message(chat_id, "No pude descargar el archivo.")
            return
        if len(file_bytes) > settings.telegram_image_max_bytes:
            await self._safe_send_message(
                chat_id,
                f"El archivo supera el tamaño máximo ({settings.telegram_image_max_bytes // (1024 * 1024)} MB).",
            )
            return

        await self._safe_send_chat_action(chat_id, "upload_document")
        await self._safe_send_message(chat_id, f"Subiendo comparativo al contrato {contract_id}...")

        try:
            import io as _io
            from fastapi import UploadFile
            from sqlmodel import select
            from app.db.session import get_session
            from app.platform.contracts_core.models import ContractOffer
            from app.domains.procurement.comparatives.analytics import offer_to_comparative_entry
            from app.domains.procurement.comparatives.service import add_offer
            from app.models.user import User

            upload = UploadFile(
                file=_io.BytesIO(file_bytes),
                filename=filename,
                headers=Headers({"content-type": mime_type}),
            )
            gen = get_session()
            session = next(gen)
            try:
                user = session.exec(
                    select(User).where(User.id == settings.telegram_default_user_id)
                ).first()
                if not user:
                    await self._safe_send_message(chat_id, "Error: usuario de sistema no configurado.")
                    return
                offer = add_offer(
                    session=session,
                    contract_id=contract_id,
                    tenant_id=settings.telegram_default_tenant_id,
                    payload={},
                    upload=upload,
                    user=user,
                )
                offer_id = int(offer.id)
                offer_rows = list(
                    session.exec(
                        select(ContractOffer)
                        .where(
                            ContractOffer.tenant_id == settings.telegram_default_tenant_id,
                            ContractOffer.contract_id == contract_id,
                        )
                        .order_by(ContractOffer.created_at.asc(), ContractOffer.id.asc())
                    ).all()
                )
                offer_entries = [offer_to_comparative_entry(row) for row in offer_rows]
                best_offer_msg = self._build_best_offer_message(offer_entries)
            finally:
                gen.close()

            lines = [
                f"Comparativo registrado en contrato {contract_id}.",
                f"Oferta ID: {offer_id}",
                f"Archivo: {filename}",
                "El OCR extrae los datos automaticamente.",
            ]
            if best_offer_msg:
                lines.append("")
                lines.append(best_offer_msg)
            await self._safe_send_message(chat_id, "\n".join(lines))

        except Exception:
            logger.exception("Comparative upload failed for chat %s contract %s", chat_id, contract_id)
            await self._safe_send_message(
                chat_id,
                f"Error al registrar el comparativo en contrato {contract_id}. "
                "Verifica que el contrato existe y tienes permisos.",
            )

    # ------------------------------------------------------------------ #

    def _build_best_offer_message(self, offers: list[dict[str, Any]]) -> str:
        if not offers:
            return ""

        priced: list[dict[str, Any]] = []
        for offer in offers:
            try:
                amount = float(offer.get("total_amount"))  # type: ignore[arg-type]
            except (TypeError, ValueError):
                continue
            if amount <= 0:
                continue
            enriched = dict(offer)
            enriched["_amount"] = amount
            priced.append(enriched)

        if not priced:
            return "Aun no hay importes detectados en las ofertas para calcular la mejor."

        priced.sort(key=lambda item: item["_amount"])
        best = priced[0]
        provider = _safe_str(best.get("supplier_name")) or _safe_str(best.get("offer_name")) or "Proveedor sin nombre"
        best_amount = self._format_amount(best["_amount"])
        best_id = best.get("id")

        lines = [f"Mejor oferta actual: {provider} ({best_amount} EUR) [ID {best_id}]"]
        if len(priced) > 1:
            lines.append("Ranking:")
            for idx, offer in enumerate(priced[:5], start=1):
                name = _safe_str(offer.get("supplier_name")) or _safe_str(offer.get("offer_name")) or "Proveedor sin nombre"
                amount_txt = self._format_amount(offer["_amount"])
                lines.append(f"{idx}. {name} - {amount_txt} EUR [ID {offer.get('id')}]")
        return "\n".join(lines)

    def _format_amount(self, amount: float) -> str:
        base = f"{amount:,.2f}"
        return base.replace(",", "_").replace(".", ",").replace("_", ".")

    async def _call_agent(self, *, chat_id: int, message_text: str) -> dict[str, Any]:
        payload = {
            "userId": f"telegram:{chat_id}",
            "tenantId": str(settings.telegram_default_tenant_id),
            "sessionId": f"telegram:{chat_id}",
            "message": message_text,
        }
        url = f"{settings.telegram_agent_base_url.rstrip('/')}/agent/chat"
        timeout = httpx.Timeout(timeout=max(settings.telegram_request_timeout_seconds, 45), connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload)
            if response.status_code >= 500:
                body = (response.text or "").strip()
                raise RuntimeError(f"Agent backend error {response.status_code}: {body[:240]}")
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                raise RuntimeError("Invalid agent response payload")
            return data

    def _looks_like_image_follow_up(self, normalized_text: str) -> bool:
        keys = (
            "que pone",
            "que ves",
            "describe",
            "descripcion",
            "extrae",
            "lee la imagen",
            "analiza imagen",
            "texto de la imagen",
        )
        return any(key in normalized_text for key in keys)

    def _format_image_answer(self, result: TelegramImageResult, normalized_text: str) -> str:
        ocr_excerpt = result.ocr_text[: settings.telegram_image_ocr_max_chars].strip()
        if not ocr_excerpt:
            ocr_excerpt = "No detecte texto legible."

        if "que pone" in normalized_text or "texto" in normalized_text:
            return f"Texto detectado:\n{ocr_excerpt}"

        if "extrae" in normalized_text:
            return (
                "Datos detectados:\n"
                f"- Resolucion: {result.width}x{result.height}\n"
                f"- Texto OCR:\n{ocr_excerpt}"
            )

        return (
            f"Descripcion:\n{result.description}\n\n"
            f"Texto detectado:\n{ocr_excerpt}\n\n"
            "Puedes preguntarme: 'que pone', 'extrae datos' o 'que ves'."
        )

    async def _extract_image_bytes(self, message: dict[str, Any]) -> bytes | None:
        # Telegram photos come as list of sizes; pick highest resolution (last item).
        photos = message.get("photo")
        if isinstance(photos, list) and photos:
            for item in reversed(photos):
                if isinstance(item, dict):
                    file_id = _safe_str(item.get("file_id"))
                    if file_id:
                        return await self._download_telegram_file(file_id)

        # Telegram documents can also be images.
        document = message.get("document")
        if isinstance(document, dict):
            mime_type = _safe_str(document.get("mime_type")).lower()
            if mime_type.startswith("image/"):
                file_id = _safe_str(document.get("file_id"))
                if file_id:
                    return await self._download_telegram_file(file_id)
        return None

    async def _download_telegram_file(self, file_id: str) -> bytes | None:
        if not self.bot_client:
            return None
        try:
            file_path = await self.bot_client.get_file_path(file_id)
            if not file_path:
                return None
            return await self.bot_client.download_file(file_path)
        except Exception:
            logger.exception("Failed to download telegram file: %s", file_id)
            return None

    async def _analyze_image(self, image_bytes: bytes) -> TelegramImageResult:
        try:
            image = Image.open(io.BytesIO(image_bytes))
            image.load()
        except Exception:
            logger.exception("Invalid image received")
            return TelegramImageResult(
                description="No pude abrir la imagen recibida.",
                ocr_text="",
                width=0,
                height=0,
                mode="unknown",
            )

        width, height = image.size
        mode = image.mode
        prepared = self._prepare_image_for_ocr(image)
        ocr_text = await self._extract_ocr_text(prepared)
        description = await self._extract_image_description(prepared, width, height, mode, ocr_text)
        return TelegramImageResult(
            description=description,
            ocr_text=ocr_text,
            width=width,
            height=height,
            mode=mode,
        )

    def _prepare_image_for_ocr(self, image: Image.Image) -> bytes:
        img = image.copy()
        max_side = 1900
        if max(img.size) > max_side:
            img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        if img.mode not in {"RGB", "L"}:
            img = img.convert("RGB")
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=88, optimize=True)
        return buffer.getvalue()

    async def _extract_ocr_text(self, image_bytes: bytes) -> str:
        candidates: list[str] = []

        # OCR via Ollama (rapido, pero no siempre fiable en texto pequeno).
        try:
            from app.ai.client import OllamaClient

            def _ollama_ocr() -> str:
                client = OllamaClient()
                return client.ocr_image_to_text(
                    image_bytes,
                    timeout_seconds=min(25, max(10, settings.ollama_ocr_timeout_seconds)),
                    max_retries=1,
                )

            text = await asyncio.to_thread(_ollama_ocr)
            text = _clean_ocr_text(_safe_str(text))
            if text:
                candidates.append(text)
        except Exception:
            logger.warning("Image OCR via Ollama failed, using local tesseract fallback", exc_info=True)

        # OCR local multipasada: distintos preprocesados para mejorar texto corto.
        try:
            with Image.open(io.BytesIO(image_bytes)) as img:
                local_candidates = await asyncio.to_thread(self._local_ocr_candidates, img.copy())
                candidates.extend(local_candidates)
        except Exception:
            logger.exception("Local image OCR fallback failed")

        if not candidates:
            return ""

        best = max(candidates, key=_score_ocr_text)
        best = _clean_ocr_text(best)
        if _score_ocr_text(best) < 20:
            return ""
        return best

    def _local_ocr_candidates(self, image: Image.Image) -> list[str]:
        candidates: list[str] = []
        psm_modes = (6, 7, 11, 13)
        for variant in self._build_ocr_variants(image):
            try:
                text = _clean_ocr_text(_safe_str(_ocr_image_tesseract(variant)))
            except Exception:
                text = ""
            if text:
                candidates.append(text)

            for psm in psm_modes:
                text_psm = _clean_ocr_text(self._run_tesseract_variant(variant, psm=psm))
                if text_psm:
                    candidates.append(text_psm)
                high_conf = _clean_ocr_text(self._run_tesseract_high_conf(variant, psm=psm))
                if high_conf:
                    candidates.append(high_conf)
        return candidates

    def _build_ocr_variants(self, image: Image.Image) -> list[Image.Image]:
        variants: list[Image.Image] = []
        base = image.convert("RGB")
        variants.append(base)

        gray = ImageOps.autocontrast(base.convert("L"))
        variants.append(gray)

        sharp = ImageEnhance.Sharpness(gray).enhance(1.8)
        variants.append(sharp)

        binary = sharp.point(lambda px: 255 if px > 150 else 0)
        variants.append(binary)

        upscaled = gray.resize((gray.width * 2, gray.height * 2), Image.Resampling.LANCZOS)
        variants.append(upscaled)

        denoised = upscaled.filter(ImageFilter.MedianFilter(size=3))
        variants.append(denoised)

        x3 = gray.resize((gray.width * 3, gray.height * 3), Image.Resampling.LANCZOS)
        variants.append(x3)

        inverted = ImageOps.invert(gray)
        variants.append(inverted)

        inv_upscaled = inverted.resize((inverted.width * 2, inverted.height * 2), Image.Resampling.LANCZOS)
        variants.append(inv_upscaled)
        return variants

    def _run_tesseract_variant(self, image: Image.Image, *, psm: int) -> str:
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=True) as tmp:
                image.save(tmp.name, format="PNG")
                cmd = [
                    "tesseract",
                    tmp.name,
                    "stdout",
                    "-l",
                    "spa+eng",
                    "--oem",
                    "1",
                    "--psm",
                    str(psm),
                    "-c",
                    "preserve_interword_spaces=1",
                ]
                proc = subprocess.run(
                    cmd,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=25,
                )
                if proc.returncode != 0:
                    return ""
                return _safe_str(proc.stdout)
        except Exception:
            return ""

    def _run_tesseract_high_conf(self, image: Image.Image, *, psm: int) -> str:
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=True) as tmp:
                image.save(tmp.name, format="PNG")
                cmd = [
                    "tesseract",
                    tmp.name,
                    "stdout",
                    "-l",
                    "spa+eng",
                    "--oem",
                    "1",
                    "--psm",
                    str(psm),
                    "tsv",
                ]
                proc = subprocess.run(
                    cmd,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=25,
                )
                if proc.returncode != 0 or not proc.stdout:
                    return ""

                words: list[str] = []
                for line in proc.stdout.splitlines()[1:]:
                    parts = line.split("\t")
                    if len(parts) < 12:
                        continue
                    text = _safe_str(parts[11])
                    if not text:
                        continue
                    try:
                        conf = float(parts[10])
                    except ValueError:
                        conf = -1.0
                    if conf < 55:
                        continue
                    if not re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", text):
                        continue
                    words.append(text)
                return _safe_str(" ".join(words))
        except Exception:
            return ""

    async def _extract_image_description(
        self,
        image_bytes: bytes,
        width: int,
        height: int,
        mode: str,
        ocr_text: str,
    ) -> str:
        # Si ya hay OCR, evitamos descripcion LLM para no alucinar objetos irrelevantes.
        if _safe_str(ocr_text):
            return (
                f"Imagen recibida ({width}x{height}, modo {mode}). "
                "He detectado texto y te muestro su extraccion OCR."
            )

        # Best effort vision prompt through Ollama.
        try:
            description = await asyncio.to_thread(self._describe_with_ollama, image_bytes)
            description = _safe_str(description)
            if description:
                return description
        except Exception:
            logger.warning("Image description via Ollama failed, using local fallback", exc_info=True)

        has_text = "si" if ocr_text else "no"
        return (
            f"Imagen recibida ({width}x{height}, modo {mode}). "
            f"Se detecta contenido textual en la imagen: {has_text}."
        )

    def _describe_with_ollama(self, image_bytes: bytes) -> str:
        encoded = base64.b64encode(image_bytes).decode("ascii")
        payload = {
            "model": settings.ollama_ocr_model,
            "stream": False,
            "prompt": (
                "Describe la imagen en espanol de forma breve y util. "
                "Si hay texto legible, indica el tipo de documento o contexto."
            ),
            "images": [encoded],
        }
        timeout = min(30, max(10, settings.ollama_ocr_timeout_seconds))
        headers: dict[str, str] = {}
        if settings.ollama_headers_json:
            try:
                import json

                parsed = json.loads(settings.ollama_headers_json)
                if isinstance(parsed, dict):
                    headers = {str(k): str(v) for k, v in parsed.items()}
            except Exception:
                headers = {}

        url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
        with httpx.Client(timeout=timeout) as client:
            response = client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                return ""
            return _safe_str(data.get("response"))

    def _message_has_image(self, message: dict[str, Any]) -> bool:
        has_photo = isinstance(message.get("photo"), list) and len(message.get("photo")) > 0
        if has_photo:
            return True
        document = message.get("document")
        if isinstance(document, dict):
            mime = _safe_str(document.get("mime_type")).lower()
            return mime.startswith("image/")
        return False

    def _message_has_voice(self, message: dict[str, Any]) -> bool:
        return isinstance(message.get("voice"), dict) or isinstance(message.get("audio"), dict)

    async def _safe_send_chat_action(self, chat_id: int, action: str) -> None:
        if not self.bot_client:
            return
        try:
            await self.bot_client.send_chat_action(chat_id, action=action)
        except Exception:
            logger.exception("Failed to send chat action")

    async def _safe_send_message(self, chat_id: int, text: str) -> None:
        if not self.bot_client:
            return
        try:
            await self.bot_client.send_message(chat_id, text)
        except Exception:
            logger.exception("Failed to send telegram message")


telegram_bridge_service = TelegramBridgeService()


