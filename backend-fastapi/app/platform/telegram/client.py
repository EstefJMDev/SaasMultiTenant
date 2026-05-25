from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


class TelegramBotClient:
    def __init__(self, bot_token: str, timeout_seconds: int) -> None:
        self._bot_token = bot_token
        self._timeout_seconds = timeout_seconds

    @property
    def _base_url(self) -> str:
        return f"https://api.telegram.org/bot{self._bot_token}"

    async def send_chat_action(self, chat_id: int, action: str = "typing") -> None:
        async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
            await client.post(
                f"{self._base_url}/sendChatAction",
                json={"chat_id": chat_id, "action": action},
            )

    async def send_message(self, chat_id: int, text: str) -> None:
        max_len = 4096
        chunks = [text[i : i + max_len] for i in range(0, len(text), max_len)] or [text]
        async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
            for chunk in chunks:
                await client.post(
                    f"{self._base_url}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": chunk,
                        "disable_web_page_preview": True,
                    },
                )

    async def send_voice(self, chat_id: int, audio_bytes: bytes, filename: str = "reply.mp3") -> None:
        async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
            files = {"voice": (filename, audio_bytes, "audio/mpeg")}
            await client.post(
                f"{self._base_url}/sendVoice",
                data={"chat_id": str(chat_id)},
                files=files,
            )

    async def send_audio(self, chat_id: int, audio_bytes: bytes, filename: str = "reply.mp3") -> None:
        async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
            files = {"audio": (filename, audio_bytes, "audio/mpeg")}
            await client.post(
                f"{self._base_url}/sendAudio",
                data={"chat_id": str(chat_id)},
                files=files,
            )

    async def get_file_path(self, file_id: str) -> str | None:
        async with httpx.AsyncClient(timeout=self._timeout_seconds) as client:
            response = await client.post(
                f"{self._base_url}/getFile",
                json={"file_id": file_id},
            )
            response.raise_for_status()
            payload: dict[str, Any] = response.json()
            result = payload.get("result")
            if not isinstance(result, dict):
                return None
            file_path = result.get("file_path")
            return file_path if isinstance(file_path, str) and file_path else None

    async def download_file(self, file_path: str) -> bytes:
        file_url = f"https://api.telegram.org/file/bot{self._bot_token}/{file_path.lstrip('/')}"
        async with httpx.AsyncClient(timeout=max(self._timeout_seconds, 60)) as client:
            response = await client.get(file_url)
            response.raise_for_status()
            return response.content


def get_telegram_bot_client() -> TelegramBotClient | None:
    if not settings.telegram_bot_token:
        return None
    return TelegramBotClient(
        bot_token=settings.telegram_bot_token,
        timeout_seconds=settings.telegram_request_timeout_seconds,
    )
