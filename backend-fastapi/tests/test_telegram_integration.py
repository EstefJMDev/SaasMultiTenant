from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.platform.telegram.api import get_telegram_bridge_service


class _FakeBridge:
    def __init__(self) -> None:
        self.called = False
        self.last_update = None

    async def handle_update(self, update):  # noqa: ANN001
        self.called = True
        self.last_update = update


def test_telegram_webhook_disabled_returns_404(client: TestClient) -> None:
    previous = settings.telegram_enabled
    settings.telegram_enabled = False
    try:
        response = client.post("/api/v1/integrations/telegram/webhook", json={})
        assert response.status_code == 404
    finally:
        settings.telegram_enabled = previous


def test_telegram_webhook_invalid_secret_returns_401(client: TestClient) -> None:
    prev_enabled = settings.telegram_enabled
    prev_secret = settings.telegram_webhook_secret
    settings.telegram_enabled = True
    settings.telegram_webhook_secret = "expected-secret"
    try:
        response = client.post(
            "/api/v1/integrations/telegram/webhook",
            headers={"X-Telegram-Bot-Api-Secret-Token": "wrong-secret"},
            json={},
        )
        assert response.status_code == 401
    finally:
        settings.telegram_enabled = prev_enabled
        settings.telegram_webhook_secret = prev_secret


def test_telegram_webhook_calls_bridge_with_valid_secret(client: TestClient) -> None:
    prev_enabled = settings.telegram_enabled
    prev_secret = settings.telegram_webhook_secret
    settings.telegram_enabled = True
    settings.telegram_webhook_secret = "expected-secret"
    fake_bridge = _FakeBridge()
    app.dependency_overrides[get_telegram_bridge_service] = lambda: fake_bridge
    payload = {"update_id": 1, "message": {"chat": {"id": 123}, "from": {"id": 9}, "text": "hola"}}
    try:
        response = client.post(
            "/api/v1/integrations/telegram/webhook",
            headers={"X-Telegram-Bot-Api-Secret-Token": "expected-secret"},
            json=payload,
        )
        assert response.status_code == 200
        assert response.json() == {"ok": True}
        assert fake_bridge.called is True
        assert fake_bridge.last_update == payload
    finally:
        app.dependency_overrides.pop(get_telegram_bridge_service, None)
        settings.telegram_enabled = prev_enabled
        settings.telegram_webhook_secret = prev_secret
