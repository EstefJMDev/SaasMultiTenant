from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status

from app.core.config import settings
from app.platform.telegram.service import TelegramBridgeService, telegram_bridge_service


router = APIRouter(prefix="/integrations/telegram", tags=["telegram"])


def get_telegram_bridge_service() -> TelegramBridgeService:
    return telegram_bridge_service


def _validate_telegram_secret(secret_header: Optional[str]) -> None:
    expected = (settings.telegram_webhook_secret or "").strip()
    if not expected:
        return
    if (secret_header or "").strip() != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Telegram webhook secret",
        )


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_telegram_secret_token: Optional[str] = Header(
        default=None,
        alias="X-Telegram-Bot-Api-Secret-Token",
    ),
    bridge: TelegramBridgeService = Depends(get_telegram_bridge_service),
) -> dict[str, bool]:
    if not settings.telegram_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Telegram integration disabled",
        )

    _validate_telegram_secret(x_telegram_secret_token)
    try:
        update: dict[str, Any] = await request.json()
    except Exception:
        update = {}
    background_tasks.add_task(bridge.handle_update, update)
    return {"ok": True}
